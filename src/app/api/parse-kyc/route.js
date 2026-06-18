import vision from "@google-cloud/vision";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabaseServer";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export const runtime = "nodejs";

let visionClient;

function parseCredentialJson(rawValue, source) {
  try {
    return JSON.parse(rawValue);
  } catch {
    throw new Error(`${source} is not valid Google service-account JSON`);
  }
}

function getVisionClient() {
  if (visionClient) return visionClient;

  if (process.env.GOOGLE_VISION_CREDENTIALS_JSON) {
    visionClient = new vision.ImageAnnotatorClient({
      credentials: parseCredentialJson(process.env.GOOGLE_VISION_CREDENTIALS_JSON, "GOOGLE_VISION_CREDENTIALS_JSON"),
    });
    return visionClient;
  }

  if (process.env.GOOGLE_VISION_CREDENTIALS_BASE64) {
    const decodedCredentials = Buffer.from(process.env.GOOGLE_VISION_CREDENTIALS_BASE64, "base64").toString("utf8");
    visionClient = new vision.ImageAnnotatorClient({
      credentials: parseCredentialJson(decodedCredentials, "GOOGLE_VISION_CREDENTIALS_BASE64"),
    });
    return visionClient;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credentialsPath = path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : path.join(/* turbopackIgnore: true */ process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);

    if (!fs.existsSync(credentialsPath) || !fs.statSync(credentialsPath).isFile()) {
      throw new Error(
        `Google Vision credential file is missing. Add the service-account JSON at ${credentialsPath}, or set GOOGLE_VISION_CREDENTIALS_JSON / GOOGLE_VISION_CREDENTIALS_BASE64 in .env.local.`
      );
    }
  }

  visionClient = new vision.ImageAnnotatorClient();
  return visionClient;
}

function shouldSkipOcr(doc) {
  const key = String(doc.requirement_key || "").toLowerCase();
  const type = String(doc.document_type || "").toLowerCase();
  return (
    key.includes("passport_photo") ||
    key.includes("photo") ||
    key.includes("signature") ||
    type.includes("passport-size photo") ||
    type.includes("photo") ||
    type.includes("signature")
  );
}

function inferMimeType(doc, detectedMime, buffer) {
  const source = `${doc.file_name || ""} ${doc.storage_path || ""}`.toLowerCase();
  const mime = String(detectedMime || "").toLowerCase();

  if (mime && mime !== "application/octet-stream") return mime;
  if (buffer?.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (buffer?.[0] === 0xff && buffer?.[1] === 0xd8 && buffer?.[2] === 0xff) return "image/jpeg";
  if (buffer?.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buffer?.subarray(0, 4).toString() === "RIFF" && buffer?.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buffer?.subarray(0, 4).toString("hex") === "49492a00" || buffer?.subarray(0, 4).toString("hex") === "4d4d002a") {
    return "image/tiff";
  }
  if (source.endsWith(".pdf")) return "application/pdf";
  if (source.endsWith(".tif") || source.endsWith(".tiff")) return "image/tiff";
  if (source.endsWith(".png")) return "image/png";
  if (source.endsWith(".jpg") || source.endsWith(".jpeg")) return "image/jpeg";
  if (source.endsWith(".webp")) return "image/webp";

  return mime || "application/octet-stream";
}

async function getDocumentBuffer(supabase, doc) {
  if (doc.storage_path) {
    const { data, error } = await supabase.storage
      .from("client-documents")
      .download(doc.storage_path);

    if (error) {
      throw new Error(`Unable to download ${doc.document_type || "document"}: ${error.message}`);
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    return {
      buffer,
      mimeType: inferMimeType(doc, doc.file_type || data.type, buffer),
    };
  }

  if (!doc.file_url) {
    throw new Error(`${doc.document_type || "Document"} has no readable file URL or storage path`);
  }

  const response = await fetch(doc.file_url);
  if (!response.ok) {
    throw new Error(`Unable to fetch ${doc.document_type || "document"} for OCR`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    mimeType: inferMimeType(doc, doc.file_type || response.headers.get("content-type"), buffer),
  };
}

function textFromFileResponse(response) {
  return (response?.responses || [])
    .map((page) => page?.fullTextAnnotation?.text || page?.textAnnotations?.[0]?.description || "")
    .filter(Boolean)
    .join("\n");
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

function deriveState(address = "") {
  const upperAddress = address.toUpperCase();
  return INDIAN_STATES.find((state) => upperAddress.includes(state.toUpperCase())) || "";
}

function deriveCity(address = "", state = "") {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const stateIndex = parts.findIndex((part) => state && part.toUpperCase().includes(state.toUpperCase()));
  const pinIndex = parts.findIndex((part) => /\b\d{6}\b/.test(part));
  const candidateIndex = stateIndex > 0 ? stateIndex - 1 : pinIndex > 0 ? pinIndex - 1 : parts.length - 2;
  return parts[candidateIndex]?.replace(/\b\d{6}\b/g, "").trim() || "";
}

async function extractDocumentText(supabase, doc) {
  const ocrClient = getVisionClient();
  const { buffer, mimeType } = await getDocumentBuffer(supabase, doc);
  const normalizedMime = String(mimeType || "").toLowerCase();

  if (normalizedMime.includes("pdf") || normalizedMime.includes("tiff")) {
    const [fileResponse] = await ocrClient.batchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            content: buffer,
            mimeType: normalizedMime.includes("pdf") ? "application/pdf" : "image/tiff",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["en"] },
          pages: [1, 2, 3, 4, 5],
        },
      ],
    });

    return textFromFileResponse(fileResponse?.responses?.[0]);
  }

  const [ocrResult] = await ocrClient.documentTextDetection({
    image: {
      content: buffer,
    },
    imageContext: { languageHints: ["en"] },
  });

  const documentText = ocrResult.fullTextAnnotation?.text || ocrResult.textAnnotations?.[0]?.description || "";
  if (documentText) return documentText;

  const [textResult] = await ocrClient.textDetection({
    image: {
      content: buffer,
    },
    imageContext: { languageHints: ["en"] },
  });

  return textResult.fullTextAnnotation?.text || textResult.textAnnotations?.[0]?.description || "";
}

export async function POST(req) {

  try {
    const supabase = await createClient(req);
    const dataDb = getTaskDataClient(supabase);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { documents = [], clientId } = body;

    const result = {
      name: "",
      father_name: "",
      dob: "",
      aadhaar_number: "",
      pan_number: "",
      passport_number: "",
      passport_expiry_date: "",
      account_number: "",
      ifsc_code: "",
      micr_code: "",
      bank_name: "",
      account_type: "",
      nri_account_type: "",
      address: "",
      pincode: "",
      // nominee_address: ""
    };
    const parsedDocuments = [];
    const parseErrors = [];
    const ocrDocuments = documents.filter((doc) => !shouldSkipOcr(doc));

    if (ocrDocuments.length === 0) {
      return Response.json(
        { error: "No OCR-readable documents were uploaded. Upload PAN, Aadhaar, passport, or cheque documents before parsing." },
        { status: 422 }
      );
    }

    try {
      getVisionClient();
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    for (const doc of ocrDocuments) {
      let text = "";
      try {
        text = await extractDocumentText(supabase, doc);
      } catch (error) {
        console.error("Document OCR failed:", {
          document_id: doc.id,
          document_type: doc.document_type,
          storage_path: doc.storage_path,
          error: error.message,
        });
        parseErrors.push({
          document_id: doc.id,
          document_type: doc.document_type,
          error: error.message,
        });
        continue;
      }

      if (!text) {
        parseErrors.push({
          document_id: doc.id,
          document_type: doc.document_type,
          error: "No readable text found",
        });
        continue;
      }

      /* ---------- NOMINEE DOCUMENT ---------- */

      // if (doc.type === "nominee_id") {

      //   result.nominee_address = extractAddress(text);

      //   continue;

      // }

      /* ---------- MAIN KYC DOCUMENTS ---------- */

      const parsed = parseKycText(text);
      parsedDocuments.push({
        document: doc,
        parsed,
      });

      for (const key in parsed) {

        if (!result[key] && parsed[key]) {
          result[key] = parsed[key];
        }

      }

    }

    if (parsedDocuments.length === 0) {
      return Response.json(
        {
          error: "No readable text found in uploaded documents",
          details: parseErrors,
        },
        { status: 422 }
      );
    }

    if (clientId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        await writeAuditLog(supabase, {
          actor: user,
          profile,
          action: "permission_denied_document_parse",
          entityType: "client",
          entityId: clientId,
          metadata: { document_count: documents.length },
          request: req,
        });
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const { error } = await syncParsedKycToClient(
        dataDb,
        clientId,
        result,
        parsedDocuments
      );

      if (error) {
        console.error("Error saving parsed data:", error);
        return Response.json(
          { error: `Parsed data was extracted but could not be saved: ${error.message || error}` },
          { status: 500 }
        );
      }

      if (documents.length > 0) {
        const documentIds = documents.map((document) => document.id).filter(Boolean);
        if (documentIds.length > 0) {
          await dataDb
            .from("documents")
            .update({ status: "Parsed" })
            .in("id", documentIds);
        }

        const storagePaths = documents.map((document) => document.storage_path).filter(Boolean);
        if (storagePaths.length > 0) {
          await dataDb
            .from("client_documents")
            .update({ status: "Parsed" })
            .eq("client_id", clientId)
            .in("storage_path", storagePaths);
        }
      }

      await writeAuditLog(supabase, {
        actor: user,
        profile,
        action: "document_parsed",
        entityType: "client",
        entityId: clientId,
        newValue: result,
        metadata: {
          document_count: documents.length,
          synced: !error,
        },
        request: req,
      });
    }

    return Response.json(result);

  } catch (error) {

    console.error("OCR Error:", error);

    return Response.json(
      { error: error?.message || "OCR failed" },
      { status: 500 }
    );

  }

}


/* ---------------- PARSER ---------------- */

function parseKycText(text) {

  const panMatch = text.match(/[A-Z]{5}[0-9]{4}[A-Z]/);

  const aadhaarMatch = text.match(/\d{4}\s?\d{4}\s?\d{4}/);

  const ifscMatch = text.match(/[A-Z]{4}0[A-Z0-9]{6}/);

  const accountMatch = text.match(/\b\d{9,18}\b/);

  const micrMatch = text.match(/\b\d{9}\b/);

  const dobMatch = text.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/);

  const pinCodeMatch = text.match(/\b\d{6}\b/);

  const passportMatch = text.match(/\b[A-Z][0-9]{7}\b/i);

  const passportExpiryMatch = text.match(
    /(?:date of expiry|expiry|valid until|valid upto)[:\s-]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i
  );

  return {

    name: extractName(text),
    father_name: extractFatherName(text),
    dob: dobMatch ? dobMatch[0] : "",
    aadhaar_number: aadhaarMatch ? aadhaarMatch[0] : "",
    pan_number: panMatch ? panMatch[0] : "",
    passport_number: passportMatch ? passportMatch[0].toUpperCase() : "",
    passport_expiry_date: passportExpiryMatch ? passportExpiryMatch[1] : "",
    account_number: accountMatch ? accountMatch[0] : "",
    ifsc_code: ifscMatch ? ifscMatch[0] : "",
    micr_code: micrMatch ? micrMatch[0] : "",
    bank_name: extractBankName(text),
    account_type: extractAccountType(text),
    nri_account_type: extractNriAccountType(text),
    address: extractAddress(text),
    pincode: pinCodeMatch ? pinCodeMatch[0] : ""

  };

}

async function syncParsedKycToClient(supabase, clientId, result, parsedDocuments) {
  const hasNriDocument = parsedDocuments.some(
    ({ document, parsed }) =>
      document.requirement_key === "passport" ||
      document.requirement_key === "cancelled_cheque_nre_nro" ||
      Boolean(parsed.nri_account_type)
  );

  const clientUpdates = removeEmptyValues({
    parsed_kyc: result,
    residential_address: result.address,
    city: deriveCity(result.address, deriveState(result.address)),
    state: deriveState(result.address),
    pin_code: result.pincode,
    foreign_address: hasNriDocument ? result.address : "",
    passport_number: result.passport_number,
    passport_expiry_date: normalizeDate(result.passport_expiry_date),
    nri_bank_account_type: result.nri_account_type,
  });

  const { error: clientError } = await supabase
    .from("clients")
    .update(clientUpdates)
    .eq("id", clientId);

  if (clientError) return { error: clientError };

  for (const { document, parsed } of parsedDocuments) {
    const syncError = await syncParsedDocument(supabase, clientId, document, parsed);
    if (syncError) return { error: syncError };
  }

  return { error: null };
}

async function syncParsedDocument(supabase, clientId, document, parsed) {
  if (document.owner_type === "bank") {
    return syncBankAccount(supabase, clientId, document, parsed);
  }

  if (document.requirement_key === "aadhaar_back" && parsed.address) {
    await supabase
      .from("clients")
      .update(removeEmptyValues({
        residential_address: parsed.address,
        city: deriveCity(parsed.address, deriveState(parsed.address)),
        state: deriveState(parsed.address),
        pin_code: parsed.pincode,
      }))
      .eq("id", clientId);
  }

  if (document.owner_type === "guardian") {
    const updates = removeEmptyValues({
      full_name: parsed.name,
      pan: parsed.pan_number,
      aadhaar_last_four: getAadhaarLastFour(parsed.aadhaar_number),
      address: parsed.address,
      date_of_birth: normalizeDate(parsed.dob),
    });

    if (Object.keys(updates).length === 0) return null;

    const query = supabase.from("client_guardians").update(updates);
    const { error } = document.guardian_id
      ? await query.eq("id", document.guardian_id)
      : await query.eq("client_id", clientId);

    return error;
  }

  if (document.owner_type === "nominee") {
    const updates = removeEmptyValues({
      name: parsed.name,
      pan: parsed.pan_number,
      aadhaar_last_four: getAadhaarLastFour(parsed.aadhaar_number),
      address: parsed.address,
      date_of_birth: normalizeDate(parsed.dob),
    });

    if (Object.keys(updates).length === 0) return null;

    const query = supabase.from("client_nominees").update(updates);
    const { error } = document.nominee_id
      ? await query.eq("id", document.nominee_id)
      : await query.eq("client_id", clientId);

    return error;
  }

  if (document.owner_type === "holder") {
    const holderUpdates = removeEmptyValues({
      full_name: parsed.name,
      father_spouse_name: parsed.father_name,
      date_of_birth: normalizeDate(parsed.dob),
      pan: parsed.pan_number,
      aadhaar_last_four: getAadhaarLastFour(parsed.aadhaar_number),
      address: parsed.address,
      foreign_address:
        document.requirement_key === "foreign_address" || document.requirement_key === "passport"
          ? parsed.address
          : "",
      passport_number: parsed.passport_number,
      passport_expiry_date: normalizeDate(parsed.passport_expiry_date),
    });

    if (Object.keys(holderUpdates).length === 0) return null;

    const query = supabase.from("client_holders").update(holderUpdates);
    const { error } = document.holder_id
      ? await query.eq("id", document.holder_id)
      : await query.eq("client_id", clientId).eq("holder_type", document.owner_role || "primary");

    return error;
  }

  return null;
}

async function syncBankAccount(supabase, clientId, document, parsed) {
  const updates = removeEmptyValues({
    bank_name: parsed.bank_name,
    account_number: parsed.account_number,
    account_type: parsed.account_type,
    nri_account_type: parsed.nri_account_type,
    ifsc_code: parsed.ifsc_code,
    micr_code: parsed.micr_code,
    cancelled_cheque_uploaded: true,
  });

  if (Object.keys(updates).length === 0) return null;

  if (document.bank_account_id) {
    const { error } = await supabase
      .from("client_bank_accounts")
      .update(updates)
      .eq("id", document.bank_account_id);

    return error;
  }

  const { data: existingBank, error: lookupError } = await supabase
    .from("client_bank_accounts")
    .select("id")
    .eq("client_id", clientId)
    .eq("is_primary", true)
    .maybeSingle();

  if (lookupError) return lookupError;

  if (existingBank?.id) {
    const { error } = await supabase
      .from("client_bank_accounts")
      .update(updates)
      .eq("id", existingBank.id);

    return error;
  }

  const { error } = await supabase
    .from("client_bank_accounts")
    .insert([{ client_id: clientId, is_primary: true, ...updates }]);

  return error;
}

function removeEmptyValues(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

function normalizeDate(value) {
  if (!value) return "";

  const match = value.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (!match) return "";

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function getAadhaarLastFour(value) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}


/* ---------------- NAME ---------------- */

function extractName(text) {

  const lines = text.split("\n");

  const ignoreWords = [
    "INCOME TAX DEPARTMENT",
    "GOVT OF INDIA",
    "GOVERNMENT OF INDIA",
    "PERMANENT ACCOUNT NUMBER",
    "INDIA",
    "AADHAAR",
    "DOB",
    "MALE",
    "FEMALE"
  ];

  for (let line of lines) {

    const clean = line.trim();

    if (
      clean.length > 3 &&
      clean.length < 40 &&
      /^[A-Za-z\s]+$/.test(clean) &&
      !ignoreWords.some(word => clean.toUpperCase().includes(word))
    ) {
      return clean;
    }

  }

  return "";

}


/* ---------------- FATHER NAME ---------------- */

function extractFatherName(text) {

  const lines = text.split("\n").map(l => l.trim());

  for (let i = 0; i < lines.length; i++) {

    const line = lines[i].toLowerCase();

    if (
      line.includes("father") ||
      line.includes("s/o") ||
      line.includes("son of")
    ) {

      const nextLine = lines[i + 1];

      if (nextLine && /^[A-Za-z\s]+$/.test(nextLine)) {
        return nextLine.trim();
      }

    }

  }

  return "";

}


/* ---------------- ADDRESS ---------------- */
function extractAddress(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const startIndex = lines.findIndex(line =>
    /\b(address|addr(?:ess)?|c\/o|s\/o|d\/o|w\/o)\b/i.test(line)
  );

  if (startIndex === -1) {
    const pinIndex = lines.findIndex((line) => /\b\d{6}\b/.test(line));
    if (pinIndex === -1) return "";

    return cleanAddressLines(lines.slice(Math.max(0, pinIndex - 4), pinIndex + 1));
  }

  const addressLines = [];

  // Extract from same line after "Address:".
  const firstLine = lines[startIndex];
  const afterAddress = firstLine.split(/(?:address|addr(?:ess)?|c\/o|s\/o|d\/o|w\/o)[:\-]?\s*/i)[1];

  if (afterAddress) {
    addressLines.push(afterAddress.trim());
    if (afterAddress.match(/\b\d{6}\b/)) {
      return addressLines.join(", ");
    }
  }

  // Continue with following lines until the pincode appears.
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (isNonAddressLine(line)) continue;

    addressLines.push(line);

    if (line.match(/\b\d{6}\b/)) break;
  }

  return cleanAddressLines(addressLines);
}

function isNonAddressLine(line) {
  const upperLine = line.toUpperCase();
  return [
    "GOVERNMENT OF INDIA",
    "GOVT OF INDIA",
    "UNIQUE IDENTIFICATION",
    "AADHAAR",
    "VID",
    "DOB",
    "YEAR OF BIRTH",
    "MALE",
    "FEMALE",
    "HELP@UIDAI",
    "WWW.UIDAI",
  ].some((word) => upperLine.includes(word));
}

function cleanAddressLines(lines) {
  const cleaned = lines
    .map((line) =>
      line
        .replace(/^(address|addr(?:ess)?|to|c\/o|s\/o|d\/o|w\/o)[:\-\s]*/i, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((line) => line && !isNonAddressLine(line) && !/[\u0900-\u097F]/.test(line));

  return [...new Set(cleaned)].join(", ");
}

/* ---------------- BANK NAME ---------------- */

function extractBankName(text) {

  const banks = [
    "STATE BANK OF INDIA",
    "HDFC BANK",
    "ICICI BANK",
    "AXIS BANK",
    "PUNJAB NATIONAL BANK",
    "BANK OF BARODA",
    "CANARA BANK",
    "KOTAK MAHINDRA BANK",
    "UNION BANK",
    "INDIAN BANK"
  ];

  const upperText = text.toUpperCase();

  for (let bank of banks) {

    if (upperText.includes(bank)) {
      return bank;
    }

  }

  return "";

}

function extractAccountType(text) {
  const upperText = text.toUpperCase();

  if (upperText.includes("SAVINGS")) return "Savings";
  if (upperText.includes("CURRENT")) return "Current";
  if (upperText.includes("NRE")) return "NRE";
  if (upperText.includes("NRO")) return "NRO";

  return "";
}

function extractNriAccountType(text) {
  const upperText = text.toUpperCase();

  if (upperText.includes("FCNR")) return "FCNR";
  if (upperText.includes("NRE")) return "NRE";
  if (upperText.includes("NRO")) return "NRO";

  return "";
}

// import vision from "@google-cloud/vision";

// const client = new vision.ImageAnnotatorClient();

// export async function POST(req) {
//   try {

//     const body = await req.json();
//     const { documents } = body;

//     let combinedText = "";

//     for (const doc of documents) {

//       const [result] = await client.textDetection(doc.file_url);

//       const detections = result.textAnnotations;

//       if (detections && detections.length > 0) {
//         combinedText += detections[0].description + "\n";
//       }

//     }

//     const parsedData = parseKycText(combinedText);

//     return Response.json(parsedData);

//   } catch (error) {

//     console.error("OCR Error:", error);

//     return Response.json(
//       { error: "OCR failed" },
//       { status: 500 }
//     );
//   }
// }

// function parseKycText(text) {

//   const panMatch = text.match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/);

//   const aadhaarMatch = text.match(/\d{4}\s?\d{4}\s?\d{4}/);

//   const ifscMatch = text.match(/[A-Z]{4}0[A-Z0-9]{6}/);

//   const accountMatch = text.match(/\d{9,18}/);

//   const dobMatch = text.match(/\d{2}\/\d{2}\/\d{4}/);

//   return {
//     name: extractName(text),
//     dob: dobMatch ? dobMatch[0] : "",
//     aadhaar_number: aadhaarMatch ? aadhaarMatch[0] : "",
//     pan_number: panMatch ? panMatch[0] : "",
//     account_number: accountMatch ? accountMatch[0] : "",
//     ifsc_code: ifscMatch ? ifscMatch[0] : "",
//     address: extractAddress(text),
//     father_name: "",
//   };
// }

// function extractName(text) {

//   const lines = text.split("\n");

//   for (let line of lines) {

//     if (
//       line.length > 4 &&
//       line.length < 40 &&
//       /^[A-Z\s]+$/.test(line.trim())
//     ) {
//       return line.trim();
//     }

//   }

//   return "";
// }

// function extractAddress(text) {

//   const lines = text.split("\n");

//   const addressLines = lines.filter(
//     (line) =>
//       line.toLowerCase().includes("road") ||
//       line.toLowerCase().includes("street") ||
//       line.toLowerCase().includes("nagar") ||
//       line.toLowerCase().includes("sector") ||
//       line.toLowerCase().includes("village")
//   );

//   return addressLines.join(", ");
// }
