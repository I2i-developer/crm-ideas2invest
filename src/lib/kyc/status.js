import crypto from "crypto";
import * as XLSX from "xlsx";

export const KYC_STATUSES = [
  "Not Checked",
  "KYC Validated",
  "KYC Registered",
  "KYC On-Hold",
  "KYC Rejected",
];

export const KYC_STATUS_OPTIONS = KYC_STATUSES.map((status) => ({ value: status, label: status }));

const HEADER_ALIASES = {
  client_name: [
    "client name",
    "client",
    "name",
    "investor name",
    "customer name",
    "holder name",
    "full name",
  ],
  pan_number: [
    "pan",
    "pan number",
    "pan no",
    "pan card",
    "pan card number",
    "pancard",
    "pancard number",
  ],
  kyc_status: ["kyc status", "status", "kyc", "current status"],
  remarks: ["remarks", "remark", "notes", "note", "comment", "comments"],
  kra_agency: ["kra", "kra agency", "kyc agency"],
};

const STATUS_ALIASES = new Map([
  ["validated", "KYC Validated"],
  ["kyc validated", "KYC Validated"],
  ["valid", "KYC Validated"],
  ["registered", "KYC Registered"],
  ["kyc registered", "KYC Registered"],
  ["reg", "KYC Registered"],
  ["on hold", "KYC On-Hold"],
  ["on-hold", "KYC On-Hold"],
  ["hold", "KYC On-Hold"],
  ["kyc on hold", "KYC On-Hold"],
  ["kyc on-hold", "KYC On-Hold"],
  ["rejected", "KYC Rejected"],
  ["reject", "KYC Rejected"],
  ["kyc rejected", "KYC Rejected"],
  ["not checked", "Not Checked"],
  ["pending", "Not Checked"],
  ["", "Not Checked"],
]);

export function normalizePan(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

export function isValidPan(value) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizePan(value));
}

export function normalizeKycStatus(value) {
  const raw = String(value || "").trim();
  if (KYC_STATUSES.includes(raw)) return raw;
  return STATUS_ALIASES.get(raw.toLowerCase()) || "Not Checked";
}

export function buildKycSummary(rows = []) {
  const summary = {
    total: rows.length,
    not_checked: 0,
    validated: 0,
    registered: 0,
    on_hold: 0,
    rejected: 0,
    review_due: 0,
  };

  const today = new Date().toISOString().slice(0, 10);
  for (const row of rows) {
    if (row.kyc_status === "KYC Validated") summary.validated += 1;
    else if (row.kyc_status === "KYC Registered") summary.registered += 1;
    else if (row.kyc_status === "KYC On-Hold") summary.on_hold += 1;
    else if (row.kyc_status === "KYC Rejected") summary.rejected += 1;
    else summary.not_checked += 1;

    if (row.next_review_date && row.next_review_date <= today) summary.review_due += 1;
  }

  return summary;
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function mapHeaders(row) {
  const mapped = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const entry = Object.entries(row).find(([header]) => aliases.includes(normalizeHeader(header)));
    if (entry) mapped[key] = entry[1];
  }
  return mapped;
}

export async function parseKycImport(file) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { fileHash, rows: [], rejectedRows: [{ row: 0, reason: "Workbook has no sheets" }] };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
  const seenInFile = new Set();
  const rows = [];
  const rejectedRows = [];

  for (const [index, raw] of rawRows.entries()) {
    const rowNumber = index + 2;
    const mapped = mapHeaders(raw);
    const clientName = String(mapped.client_name || "").trim();
    const panNumber = normalizePan(mapped.pan_number);

    if (!clientName && !panNumber) continue;

    if (!clientName) {
      rejectedRows.push({ row: rowNumber, reason: "Client name is missing", raw });
      continue;
    }

    if (panNumber && !isValidPan(panNumber)) {
      rejectedRows.push({ row: rowNumber, reason: "PAN number format is invalid", pan_number: panNumber, raw });
      continue;
    }

    if (panNumber && seenInFile.has(panNumber)) {
      rejectedRows.push({ row: rowNumber, reason: "Duplicate PAN in uploaded file", pan_number: panNumber, raw });
      continue;
    }

    if (panNumber) seenInFile.add(panNumber);
    rows.push({
      row: rowNumber,
      client_name: clientName,
      pan_number: panNumber || null,
      normalized_pan: panNumber || null,
      kyc_status: normalizeKycStatus(mapped.kyc_status),
      remarks: String(mapped.remarks || "").trim() || null,
      kra_agency: String(mapped.kra_agency || "").trim() || null,
      raw_import_row: raw,
    });
  }

  return { fileHash, rows, rejectedRows };
}

export function normalizeKycPayload(body = {}, userId = null) {
  const normalizedPan = normalizePan(body.pan_number || body.normalized_pan);
  return {
    client_id: body.client_id || null,
    client_name: String(body.client_name || "").trim(),
    pan_number: normalizedPan || null,
    normalized_pan: normalizedPan || null,
    kyc_status: normalizeKycStatus(body.kyc_status),
    status_source: body.status_source || "Manual",
    kra_agency: body.kra_agency || null,
    last_checked_at: body.last_checked_at || null,
    next_review_date: body.next_review_date || null,
    remarks: body.remarks || null,
    updated_by: userId,
  };
}
