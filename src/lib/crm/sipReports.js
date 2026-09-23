import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit/logger";
import { getAdminUserIds, createNotification } from "@/lib/notifications/service";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";
import {
  DEFAULT_SIP_REPORT_RTA,
  DEFAULT_SIP_REPORT_TYPE,
  getSipReportRta,
  getSipReportType,
  sipReportRtaLabel,
  sipReportTypeLabel,
} from "@/lib/crm/sipReportTypes";

export const SIP_FOLLOW_UP_STATUSES = [
  "pending",
  "contacted",
  "client_informed",
  "restarted",
  "not_interested",
  "resolved",
];

const FIELD_MAP = {
  FUND: "fund",
  SCHEME: "scheme",
  PLAN: "plan",
  PRODCODE: "product_code",
  ACNO: "folio_no",
  AMOUNT: "amount",
  STARTDATE: "start_date",
  ENDDATE: "end_date",
  TERMDATE: "termination_date",
  FREQUENCY: "frequency",
  AGENT: "agent",
  AGENTNAME: "agent_name",
  SUBBROKER: "subbroker",
  INVNAME: "investor_name",
  EMAIL: "email",
  MOBILE: "mobile",
  PHONE: "phone",
  REMARKS: "remarks",
  SIPFLAG: "sip_flag",
  SIPREGDT: "sip_registration_date",
  IHNO: "ihno",
  TOSCHEME: "to_scheme",
  TOPLAN: "to_plan",
  TOPRODCODE: "to_product_code",
  REJREMARKS: "rejection_remarks",
  SIPREGSLNO: "sip_registration_no",
  BRANCHCODE: "branch_code",
};

const REQUIRED_HEADERS = ["INVNAME", "ACNO"];
const REPORT_REQUIRED_HEADERS = {
  kfintech_sip_stp: REQUIRED_HEADERS,
  kfintech_termination_pause: ["INVNAME", "ACNO", "TRTYPE", "STARTDATE", "ENDDATE", "IHNO"],
  kfintech_transaction_rejection: ["NAME", "ACNO", "TRDATE", "REMARKS"],
  kfintech_closed_sip_stp: ["INVNAME", "ACNO", "FROMDATE", "TODATE", "SIPREGDT", "IHNO", "TRTYPE"],
  kfintech_sip_stp_expiring: ["NAME", "ACNO", "ENDDATE", "TRTYPE", "IHNO"],
  cams_unoperational_sip_stp: ["PRODUCT", "SCHEME", "FOLIO_NO", "INV_NAME", "AUTO_AMOUN", "FROM_DATE", "CEASE_DATE", "PAN"],
};
const DATE_FIELDS = new Set(["start_date", "end_date", "termination_date", "sip_registration_date"]);

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .split(",")[0]
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function trimValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function rawValue(rawRow, candidates) {
  if (!rawRow) return null;
  const normalizedCandidates = candidates.map(normalizeHeader);
  const entry = Object.entries(rawRow).find(([key, value]) =>
    value !== null &&
    value !== undefined &&
    normalizedCandidates.includes(normalizeHeader(key))
  );
  return entry ? trimValue(entry[1]) : null;
}

export function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function normalizeEmail(value) {
  const text = trimValue(value);
  return text ? text.toLowerCase() : null;
}

function parseAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(amount) ? amount : null;
}

function normalizePan(value) {
  const text = trimValue(value);
  return text ? text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : null;
}

function displayFrequencyLabel(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "D") return "Daily";
  if (text === "OM" || text === "M") return "Monthly";
  if (text === "Q") return "Quarterly";
  if (text === "W" || text === "OW") return "Weekly";
  return trimValue(value);
}

function cleanCamsRemark(value) {
  const cleaned = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (/^this is a systematic transaction exchange\/channel\.?$/i.test(cleaned)) return null;
  return cleaned;
}

function excelSerialToDate(serial) {
  const excelEpoch = Date.UTC(1899, 11, 30);
  return new Date(excelEpoch + Number(serial) * 86400000);
}

function dateKeyFromDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function validDateParts(year, month, day) {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function dateKeyFromParts(year, month, day) {
  if (!validDateParts(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseReportDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dateKeyFromDate(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return dateKeyFromDate(excelSerialToDate(value));
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (Number.isFinite(serial) && serial > 20000 && serial < 90000) {
      return dateKeyFromDate(excelSerialToDate(serial));
    }
  }

  const iso = Date.parse(text);
  if (!Number.isNaN(iso) && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) {
    return dateKeyFromDate(new Date(iso));
  }

  const match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (match) {
    const [, firstText, secondText, yearText] = match;
    const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
    const first = Number(firstText);
    const second = Number(secondText);
    const candidates = second > 12 && first <= 12
      ? [[year, first, second], [year, second, first]]
      : [[year, second, first], [year, first, second]];
    for (const [candidateYear, candidateMonth, candidateDay] of candidates) {
      const parsed = dateKeyFromParts(candidateYear, candidateMonth, candidateDay);
      if (parsed) return parsed;
    }
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : dateKeyFromDate(fallback);
}

function inferEventType(row) {
  const haystack = [row.remarks, row.sip_flag, row.rejection_remarks]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bpause|paused|pause\b/.test(haystack)) return "paused";
  if (/term|terminated|cancel|cancelled|canceled|stop|stopped/.test(haystack)) return "terminated";
  if (row.rejection_remarks) return "rejected";
  if (row.termination_date) return "terminated";
  return "unknown";
}

function isNormalSipRow(row) {
  const flag = String(row.sip_flag || "").trim().toLowerCase();
  return flag.includes("sip") && !flag.includes("stp");
}

function stableFingerprint(row) {
  const parts = [
    row.report_rta,
    row.report_type,
    row.folio_no,
    row.sip_registration_no,
    rawValue(row.raw_row, ["TRNO"]),
    rawValue(row.raw_row, ["IHNO"]),
    rawValue(row.raw_row, ["CHQNO"]),
    rawValue(row.raw_row, ["AUTO_TRNO"]),
    rawValue(row.raw_row, ["REQUEST_RE"]),
    row.product_code,
    row.pan_number,
    row.amount,
    row.start_date,
    row.end_date,
    row.termination_date,
    row.sip_flag,
    row.remarks,
    row.rejection_remarks,
  ].map((part) => String(part || "").trim().toLowerCase());

  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function normalizeRow(rawRow, { reportRta, reportType } = {}) {
  const normalized = {
    raw_row: rawRow,
    report_rta: reportRta || DEFAULT_SIP_REPORT_RTA,
    report_type: reportType || DEFAULT_SIP_REPORT_TYPE,
  };

  for (const [rawHeader, value] of Object.entries(rawRow)) {
    const mappedKey = FIELD_MAP[normalizeHeader(rawHeader)];
    if (!mappedKey) continue;

    if (DATE_FIELDS.has(mappedKey)) normalized[mappedKey] = parseReportDate(value);
    else if (mappedKey === "amount") normalized[mappedKey] = parseAmount(value);
    else if (mappedKey === "email") normalized[mappedKey] = normalizeEmail(value);
    else if (mappedKey === "mobile") normalized[mappedKey] = normalizeMobile(value);
    else if (mappedKey === "phone") normalized[mappedKey] = normalizeMobile(value) || trimValue(value);
    else normalized[mappedKey] = trimValue(value);
  }

  normalized.event_type = inferEventType(normalized);
  normalized.row_fingerprint = stableFingerprint(normalized);
  return normalized;
}

function normalizeKfintechTransactionRejectionRow(rawRow, { reportRta, reportType } = {}) {
  const fundCode = rawValue(rawRow, ["Fund"]);
  const schemeCode = rawValue(rawRow, ["Scheme"]);
  const planCode = rawValue(rawRow, ["Pln", "Plan"]);
  const schemeDescription = rawValue(rawRow, ["Schdesc"]) || schemeCode;
  const planDescription = rawValue(rawRow, ["Plandesc"]) || planCode;
  const phone = rawValue(rawRow, ["Phone", "Mobile"]);
  const transactionNo = rawValue(rawRow, ["Trno"]);
  const sipReference = rawValue(rawRow, ["Ihno", "SIPREGSLNO"]);

  const normalized = {
    raw_row: rawRow,
    report_rta: reportRta || DEFAULT_SIP_REPORT_RTA,
    report_type: reportType || "kfintech_transaction_rejection",
    fund: schemeDescription,
    scheme: schemeDescription,
    plan: planDescription,
    product_code: [fundCode, schemeCode, planCode].filter(Boolean).join("-") || null,
    folio_no: rawValue(rawRow, ["Acno"]),
    amount: parseAmount(rawValue(rawRow, ["Amount"])),
    start_date: parseReportDate(rawValue(rawRow, ["FromDate"])),
    end_date: parseReportDate(rawValue(rawRow, ["ToDate"])),
    termination_date: parseReportDate(rawValue(rawRow, ["TrDate"])),
    frequency: rawValue(rawRow, ["Frequency"]),
    agent: rawValue(rawRow, ["Agent"]),
    agent_name: rawValue(rawRow, ["Agentname", "AgentName"]),
    subbroker: rawValue(rawRow, ["SubBrok", "SubBroker"]),
    branch_code: rawValue(rawRow, ["Branch", "BranchCode"]),
    investor_name: rawValue(rawRow, ["Name", "InvName"]),
    email: normalizeEmail(rawValue(rawRow, ["Email"])),
    phone: normalizeMobile(phone) || phone,
    mobile: normalizeMobile(phone),
    remarks: rawValue(rawRow, ["Remarks"]),
    rejection_remarks: rawValue(rawRow, ["Remarks"]),
    sip_registration_date: parseReportDate(rawValue(rawRow, ["sipregdt", "SIPREGDT"])),
    ihno: sipReference,
    sip_registration_no: [sipReference, transactionNo].filter(Boolean).join("-") || sipReference || null,
    event_type: "rejected",
  };

  normalized.row_fingerprint = stableFingerprint(normalized);
  return normalized;
}

function normalizeKfintechActiveSipStpRow(rawRow, { reportRta, reportType } = {}) {
  const transactionType = rawValue(rawRow, ["TrType", "SIPFlag"]) || "SIP/STP";
  const frequency = rawValue(rawRow, ["Freq", "Frequency"]);
  const paidInstallments = rawValue(rawRow, ["PAIDINST"]);
  const pendingInstallments = rawValue(rawRow, ["PENDINST"]);
  const totalInstallments = rawValue(rawRow, ["INSTALNO"]);
  const remarks = cleanCamsRemark(rawValue(rawRow, ["REMARKS"]));
  const offPhone = rawValue(rawRow, ["OffPhone"]);
  const resPhone = rawValue(rawRow, ["ResPhone"]);
  const phone = offPhone || resPhone;
  const stpTarget = [
    rawValue(rawRow, ["STPInScheme"]),
    rawValue(rawRow, ["StpInPlan"]),
    rawValue(rawRow, ["StpInProdCode"]),
  ].filter(Boolean).join(" / ");
  const installmentText = [paidInstallments, totalInstallments].filter(Boolean).join("/");

  const normalized = {
    raw_row: rawRow,
    report_rta: reportRta || DEFAULT_SIP_REPORT_RTA,
    report_type: reportType || "kfintech_termination_pause",
    fund: rawValue(rawRow, ["SchDesc"]) || rawValue(rawRow, ["Fund"]),
    scheme: rawValue(rawRow, ["SchDesc"]) || rawValue(rawRow, ["SchCode"]),
    plan: rawValue(rawRow, ["SchCode"]),
    product_code: rawValue(rawRow, ["Prodcode", "ProdCode"]) || rawValue(rawRow, ["SchCode"]),
    folio_no: rawValue(rawRow, ["Acno"]),
    amount: parseAmount(rawValue(rawRow, ["AMOUNT", "Amount"])),
    start_date: parseReportDate(rawValue(rawRow, ["STARTDATE", "StartDate"])),
    end_date: parseReportDate(rawValue(rawRow, ["ENDDATE", "EndDate"])),
    frequency,
    agent: rawValue(rawRow, ["Agent"]),
    subbroker: rawValue(rawRow, ["SubBroker", "SubBrok"]),
    investor_name: rawValue(rawRow, ["InvName", "Name"]),
    email: normalizeEmail(rawValue(rawRow, ["Email"])),
    mobile: normalizeMobile(phone),
    phone: normalizeMobile(phone) || phone,
    remarks: remarks || `${transactionType} active${installmentText ? `; installments ${installmentText}` : ""}${pendingInstallments ? `; pending ${pendingInstallments}` : ""}${stpTarget ? `; target ${stpTarget}` : ""}`,
    sip_flag: transactionType,
    sip_registration_date: parseReportDate(rawValue(rawRow, ["RegDate", "sipregdt", "SIPREGDT"])),
    ihno: rawValue(rawRow, ["IHNO", "Ihno"]),
    sip_registration_no: rawValue(rawRow, ["IHNO", "Ihno"]),
    to_scheme: rawValue(rawRow, ["STPInScheme"]),
    to_plan: rawValue(rawRow, ["StpInPlan"]),
    to_product_code: rawValue(rawRow, ["StpInProdCode"]),
    event_type: "active",
  };

  normalized.row_fingerprint = stableFingerprint(normalized);
  return normalized;
}

function normalizeKfintechSipStpExpiringRow(rawRow, { reportRta, reportType } = {}) {
  const fundCode = rawValue(rawRow, ["Fund"]);
  const schemeCode = rawValue(rawRow, ["Scheme"]);
  const planCode = rawValue(rawRow, ["Pln", "Plan"]);
  const productCode = rawValue(rawRow, ["prcode", "ProdCode"]) || [fundCode, schemeCode, planCode].filter(Boolean).join("-");
  const schemeDescription = rawValue(rawRow, ["Schdesc"]) || schemeCode;
  const planDescription = rawValue(rawRow, ["Plandesc"]) || planCode;
  const mobile = rawValue(rawRow, ["Mobile", "Phone"]);
  const trType = rawValue(rawRow, ["TrType", "SIPFlag"]) || "SIP/STP";
  const endDate = parseReportDate(rawValue(rawRow, ["EndDate"]));
  const toScheme = rawValue(rawRow, ["ToScheme"]);
  const toPlan = rawValue(rawRow, ["ToPlan"]);
  const target = [toScheme, toPlan].filter(Boolean).join(" / ");

  const normalized = {
    raw_row: rawRow,
    report_rta: reportRta || DEFAULT_SIP_REPORT_RTA,
    report_type: reportType || "kfintech_sip_stp_expiring",
    fund: schemeDescription,
    scheme: schemeDescription,
    plan: planDescription,
    product_code: productCode || null,
    folio_no: rawValue(rawRow, ["Acno"]),
    amount: parseAmount(rawValue(rawRow, ["Amount"])),
    start_date: parseReportDate(rawValue(rawRow, ["Startdate", "StartDate"])),
    end_date: endDate,
    frequency: rawValue(rawRow, ["Frequency"]),
    agent: rawValue(rawRow, ["Agent"]),
    agent_name: rawValue(rawRow, ["Agentname", "AgentName"]),
    subbroker: rawValue(rawRow, ["SubBroker", "SubBrok"]),
    branch_code: rawValue(rawRow, ["Branch", "BranchCode"]),
    investor_name: rawValue(rawRow, ["Name", "InvName"]),
    email: normalizeEmail(rawValue(rawRow, ["Email"])),
    mobile: normalizeMobile(mobile),
    phone: normalizeMobile(mobile) || mobile,
    remarks: `${trType} expiring${endDate ? ` on ${endDate}` : ""}${target ? `; target ${target}` : ""}`,
    sip_flag: trType,
    sip_registration_date: parseReportDate(rawValue(rawRow, ["sipregdt", "SIPREGDT"])),
    ihno: rawValue(rawRow, ["Ihno", "IHNO"]),
    sip_registration_no: rawValue(rawRow, ["Ihno", "IHNO"]),
    to_scheme: toScheme,
    to_plan: toPlan,
    event_type: "expiring",
  };

  normalized.row_fingerprint = stableFingerprint(normalized);
  return normalized;
}

function normalizeKfintechClosedSipStpRow(rawRow, { reportRta, reportType } = {}) {
  const fundCode = rawValue(rawRow, ["FundCode", "Fund"]);
  const schemeCode = rawValue(rawRow, ["Scheme"]);
  const planCode = rawValue(rawRow, ["Pln", "Plan"]);
  const productCode = rawValue(rawRow, ["PrCode", "ProdCode"]) || [fundCode, schemeCode, planCode].filter(Boolean).join("-");
  const transactionType = rawValue(rawRow, ["TrType", "SIPFlag"]) || "SIP/STP";
  const mobile = rawValue(rawRow, ["Mobile", "Phone"]);
  const officePhone = rawValue(rawRow, ["OPhone", "OffPhone"]);
  const residencePhone = rawValue(rawRow, ["RPhone", "ResPhone"]);
  const phone = mobile || officePhone || residencePhone;
  const fromDate = parseReportDate(rawValue(rawRow, ["FromDate", "StartDate"]));
  const toDate = parseReportDate(rawValue(rawRow, ["ToDate", "EndDate"]));

  const normalized = {
    raw_row: rawRow,
    report_rta: reportRta || DEFAULT_SIP_REPORT_RTA,
    report_type: reportType || "kfintech_closed_sip_stp",
    fund: fundCode,
    scheme: [schemeCode, planCode].filter(Boolean).join(" / ") || schemeCode || productCode,
    plan: planCode,
    product_code: productCode || null,
    folio_no: rawValue(rawRow, ["Acno"]),
    amount: parseAmount(rawValue(rawRow, ["Amount"])),
    start_date: fromDate,
    end_date: toDate,
    termination_date: toDate,
    frequency: rawValue(rawRow, ["Frequency"]),
    investor_name: rawValue(rawRow, ["InvName", "Name"]),
    email: normalizeEmail(rawValue(rawRow, ["Email"])),
    mobile: normalizeMobile(mobile),
    phone: normalizeMobile(phone) || phone,
    remarks: `${transactionType} closed${toDate ? ` on ${toDate}` : ""}${productCode ? `; product ${productCode}` : ""}`,
    sip_flag: transactionType,
    sip_registration_date: parseReportDate(rawValue(rawRow, ["SipRegDt", "SIPREGDT", "RegDate"])),
    ihno: rawValue(rawRow, ["IHno", "IHNO"]),
    sip_registration_no: rawValue(rawRow, ["IHno", "IHNO"]),
    event_type: "closed",
  };

  normalized.row_fingerprint = stableFingerprint(normalized);
  return normalized;
}

function normalizeCamsUnoperationalSipStpRow(rawRow, { reportRta, reportType } = {}) {
  const transactionCode = rawValue(rawRow, ["AUT_TRNTYP"]);
  const autoTransactionNo = rawValue(rawRow, ["AUTO_TRNO"]);
  const requestReference = rawValue(rawRow, ["REQUEST_RE"]);
  const frequency = rawValue(rawRow, ["PERIODICIT"]);
  const periodDay = rawValue(rawRow, ["PERIOD_DAY"]);
  const remarks = rawValue(rawRow, ["REMARKS"]);
  const ceaseDate = parseReportDate(rawValue(rawRow, ["CEASE_DATE"]));
  const frequencyText = displayFrequencyLabel(frequency);

  const normalized = {
    raw_row: rawRow,
    report_rta: reportRta || "cams",
    report_type: reportType || "cams_unoperational_sip_stp",
    fund: rawValue(rawRow, ["SCHEME"]),
    scheme: rawValue(rawRow, ["SCHEME"]),
    product_code: rawValue(rawRow, ["PRODUCT"]),
    folio_no: rawValue(rawRow, ["FOLIO_NO"]),
    amount: parseAmount(rawValue(rawRow, ["AUTO_AMOUN"])),
    start_date: parseReportDate(rawValue(rawRow, ["FROM_DATE"])),
    end_date: parseReportDate(rawValue(rawRow, ["TO_DATE"])),
    termination_date: ceaseDate,
    frequency,
    investor_name: rawValue(rawRow, ["INV_NAME"]),
    remarks: remarks || `CAMS un-operational ${frequencyText || "SIP/STP"}${periodDay ? ` on day ${periodDay}` : ""}${ceaseDate ? `; cease date ${ceaseDate}` : ""}`,
    sip_flag: transactionCode ? `CAMS ${transactionCode}` : "CAMS SIP/STP",
    ihno: autoTransactionNo,
    sip_registration_no: requestReference || autoTransactionNo,
    pan_number: normalizePan(rawValue(rawRow, ["PAN"])),
    event_type: "unoperational",
  };

  normalized.row_fingerprint = stableFingerprint(normalized);
  return normalized;
}

function rowHasRequiredHeaders(row = [], requiredHeaders = REQUIRED_HEADERS) {
  const headers = row.map(normalizeHeader);
  return requiredHeaders.map(normalizeHeader).every((header) => headers.includes(header));
}

function buildRowsFromHeaderMatrix(matrix = [], requiredHeaders = REQUIRED_HEADERS, reportLabel = "SIP report") {
  const headerIndex = matrix.findIndex((row) => rowHasRequiredHeaders(row, requiredHeaders));
  if (headerIndex === -1) {
    const availableHeaders = matrix
      .slice(0, 12)
      .flat()
      .map(normalizeHeader)
      .filter(Boolean);
    const missing = requiredHeaders.filter((header) => !availableHeaders.includes(normalizeHeader(header)));
    throw new Error(`Missing required ${reportLabel} columns: ${missing.join(", ")}`);
  }

  const headers = matrix[headerIndex].map((header, index) => {
    const label = trimValue(header);
    return label || `COLUMN_${index + 1}`;
  });

  return matrix
    .slice(headerIndex + 1)
    .map((row) => {
      const rawRow = {};
      headers.forEach((header, index) => {
        rawRow[header] = row[index] ?? null;
      });
      return rawRow;
    })
    .filter((row) => Object.values(row).some((value) => trimValue(value)));
}

function normalizeRowsForReport(rows, selection) {
  if (selection.reportType === "kfintech_termination_pause") {
    const activeRows = rows.map((row) => normalizeKfintechActiveSipStpRow(row, selection));
    if (!activeRows.length) {
      throw new Error("No active SIP/STP rows found.");
    }
    return activeRows;
  }

  if (selection.reportType === "kfintech_transaction_rejection") {
    const rejectedRows = rows.map((row) => normalizeKfintechTransactionRejectionRow(row, selection));
    if (!rejectedRows.length) {
      throw new Error("No transaction-level SIP rejection rows found.");
    }
    return rejectedRows;
  }

  if (selection.reportType === "kfintech_sip_stp_expiring") {
    const expiringRows = rows.map((row) => normalizeKfintechSipStpExpiringRow(row, selection));
    if (!expiringRows.length) {
      throw new Error("No SIP/STP expiring rows found.");
    }
    return expiringRows;
  }

  if (selection.reportType === "kfintech_closed_sip_stp") {
    const closedRows = rows.map((row) => normalizeKfintechClosedSipStpRow(row, selection));
    if (!closedRows.length) {
      throw new Error("No closed SIP/STP rows found.");
    }
    return closedRows;
  }

  if (selection.reportType === "cams_unoperational_sip_stp") {
    const unoperationalRows = rows.map((row) => normalizeCamsUnoperationalSipStpRow(row, selection));
    if (!unoperationalRows.length) {
      throw new Error("No CAMS un-operational SIP/STP rows found.");
    }
    return unoperationalRows;
  }

  const sipRows = rows.map((row) => normalizeRow(row, selection)).filter(isNormalSipRow);
  if (!sipRows.length) {
    throw new Error("No Normal SIP rows found. Normal STP rows are ignored by the SIP tracker.");
  }
  return sipRows;
}

export function fileHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeReportSelection({ reportRta, reportType } = {}) {
  const selectedType = getSipReportType(reportType || DEFAULT_SIP_REPORT_TYPE);
  if (!selectedType) {
    throw new Error("Invalid SIP report type selected.");
  }
  const selectedRta = getSipReportRta(reportRta || selectedType.rta || DEFAULT_SIP_REPORT_RTA);
  if (!selectedRta || selectedRta.value !== selectedType.rta) {
    throw new Error("Selected RTA does not match the selected SIP report type.");
  }
  if (!selectedType.supported) {
    throw new Error(`${selectedType.label} import is not configured yet. Upload a sample CSV first so its columns can be mapped.`);
  }
  return {
    reportRta: selectedRta.value,
    reportType: selectedType.value,
    reportLabel: selectedType.label,
    rtaLabel: selectedRta.label,
  };
}

export async function parseSipReportFile({ buffer, fileName, reportRta, reportType }) {
  const selection = normalizeReportSelection({ reportRta, reportType });
  const extension = String(fileName || "").split(".").pop()?.toLowerCase();
  if (!["xlsx", "xls", "csv", "txt"].includes(extension)) {
    throw new Error("Unsupported file type. Upload .xlsx, .xls, or .csv.");
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found in uploaded file.");

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  });
  const requiredHeaders = REPORT_REQUIRED_HEADERS[selection.reportType] || REQUIRED_HEADERS;
  const rows = buildRowsFromHeaderMatrix(matrix, requiredHeaders, selection.reportLabel);
  if (!rows.length) throw new Error("Uploaded SIP report is empty.");

  return { rows: normalizeRowsForReport(rows, selection), selection };
}

function normalizeName(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function similarName(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

async function findClientMatch(supabase, event) {
  const mobile = normalizeMobile(event.mobile || event.phone);
  const email = normalizeEmail(event.email);
  const pan = normalizePan(event.pan_number || rawValue(event.raw_row, ["PAN"]));

  if (mobile) {
    const { data } = await supabase
      .from("clients")
      .select("id, full_name, operations_owner, mobile, email")
      .or(`mobile.eq.${mobile},alternate_mobile.eq.${mobile},nominee_mobile.eq.${mobile}`)
      .limit(1)
      .maybeSingle();

    if (data) {
      return {
        client: data,
        matched_status: "matched",
        match_confidence: "high",
        match_reason: "Exact mobile match",
      };
    }
  }

  if (email) {
    const { data } = await supabase
      .from("clients")
      .select("id, full_name, operations_owner, mobile, email")
      .or(`email.eq.${email},alternate_email.eq.${email},nominee_email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (data) {
      return {
        client: data,
        matched_status: "matched",
        match_confidence: "high",
        match_reason: "Exact email match",
      };
    }
  }

  if (pan) {
    const { data: holder } = await supabase
      .from("client_holders")
      .select("client_id")
      .ilike("pan", pan)
      .limit(1)
      .maybeSingle();

    if (holder?.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("id, full_name, operations_owner, mobile, email")
        .eq("id", holder.client_id)
        .maybeSingle();

      if (client) {
        return {
          client,
          matched_status: "matched",
          match_confidence: "high",
          match_reason: "Exact PAN match",
        };
      }
    }
  }

  if (event.investor_name) {
    const { data: exactName } = await supabase
      .from("clients")
      .select("id, full_name, operations_owner, mobile, email")
      .ilike("full_name", event.investor_name)
      .limit(1)
      .maybeSingle();

    if (exactName) {
      return {
        client: exactName,
        matched_status: "matched",
        match_confidence: "medium",
        match_reason: "Investor name exact match",
      };
    }

    const { data: candidates } = await supabase
      .from("clients")
      .select("id, full_name, operations_owner, mobile, email")
      .ilike("full_name", `%${String(event.investor_name).split(" ")[0] || event.investor_name}%`)
      .limit(10);

    const candidate = (candidates || []).find((client) => similarName(client.full_name, event.investor_name));
    if (candidate) {
      return {
        client: candidate,
        matched_status: "possible_match",
        match_confidence: "low",
        match_reason: "Investor name possible match",
      };
    }
  }

  return {
    client: null,
    matched_status: "unmatched",
    match_confidence: null,
    match_reason: "No mobile, email, PAN, or reliable name match",
  };
}

async function pickAssignee(supabase, client) {
  if (client?.operations_owner) return client.operations_owner;

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "operations")
    .neq("status", "Inactive")
    .or("is_active.is.null,is_active.eq.true")
    .limit(1)
    .maybeSingle();

  return data?.id || null;
}

export async function resolveSipAssignee(supabase, client) {
  return pickAssignee(supabase, client);
}

function taskDescription(event) {
  const frequency = displayFrequencyLabel(event.frequency);
  const dateLines = event.report_type === "cams_unoperational_sip_stp"
    ? [
        `From Date: ${formatDateDDMonYYYY(event.start_date, "-")}`,
        `To Date: ${formatDateDDMonYYYY(event.end_date, "-")}`,
        `Cease Date: ${formatDateDDMonYYYY(event.termination_date, "-")}`,
      ]
    : [`Date: ${formatDateDDMonYYYY(event.termination_date || event.end_date, "-")}`];
  return [
    `Investor: ${event.investor_name || "Unknown"}`,
    `Event: ${event.event_type}`,
    `Fund: ${event.fund || "-"}`,
    `Scheme: ${event.scheme || "-"}`,
    `Folio: ${event.folio_no || "-"}`,
    `PAN: ${event.pan_number || rawValue(event.raw_row, ["PAN"]) || "-"}`,
    `Amount: ${event.amount || "-"}`,
    `Frequency: ${frequency || "-"}`,
    ...dateLines,
    `Remarks: ${cleanCamsRemark(event.remarks) || event.remarks || "-"}`,
    `Rejection Remarks: ${event.rejection_remarks || "-"}`,
  ].join("\n");
}

async function createSipTaskAndNotifications({ supabase, actor, profile, event, client, assigneeId, request }) {
  const taskDb = getTaskDataClient(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const title = `Follow up: SIP ${event.event_type} for ${event.investor_name || client?.full_name || "client"}`;
  const taskNumber = `SIP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${randomUUID().slice(0, 8).toUpperCase()}`;

  const { data: task, error: taskError } = await taskDb
    .from("tasks")
    .insert({
      task_number: taskNumber,
      title,
      description: taskDescription(event),
      category: "Follow-up",
      priority: ["terminated", "rejected", "unoperational"].includes(event.event_type) ? "High" : "Medium",
      status: "Pending",
      due_date: today,
      client_id: client?.id || null,
      tags: ["SIP", event.event_type],
      created_by: actor.id,
    })
    .select()
    .single();

  if (taskError) {
    return { task: null, notification: null, error: taskError.message };
  }

  if (assigneeId) {
    await taskDb.from("task_assignments").insert({
      task_id: task.id,
      user_id: assigneeId,
      assigned_by: actor.id,
    });
  }

  await taskDb.from("task_activity_logs").insert({
    task_id: task.id,
    action_type: "created",
    performed_by: actor.id,
    metadata: { source: "sip_report_import", sip_event_id: event.id, event_type: event.event_type },
  });

  let notification = null;
  if (assigneeId) {
    notification = await createNotification(taskDb, {
      userId: assigneeId,
      taskId: task.id,
      title: "SIP follow-up assigned",
      message: `${event.investor_name || "Client"} has a SIP ${event.event_type} event requiring follow-up.`,
      type: "sip_follow_up_assigned",
      entityType: "sip_event",
      entityId: event.id,
      linkUrl: `/dashboard/tasks/${task.id}`,
      metadata: { sip_event_id: event.id, client_id: client?.id || null },
      dedupeKey: `sip_follow_up:${event.id}:${assigneeId}`,
    });
  }

  await writeAuditLog(supabase, {
    actor,
    profile,
    action: "sip_followup_task_created",
    entityType: "sip_event",
    entityId: event.id,
    newValue: { task_id: task.id, assigned_to: assigneeId },
    request,
  });

  return { task, notification, error: null };
}

export async function createSipFollowupTask({ supabase, actor, profile, eventId, request }) {
  const taskDb = getTaskDataClient(supabase);
  const { data: event, error: eventError } = await taskDb
    .from("sip_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) throw new Error(eventError.message);
  if (!event) throw new Error("SIP event not found");
  if (event.task_id) return { event, task: { id: event.task_id }, alreadyExists: true };

  const { data: client, error: clientError } = event.client_id
    ? await taskDb
        .from("clients")
        .select("id, full_name, operations_owner")
        .eq("id", event.client_id)
        .maybeSingle()
    : { data: null, error: null };

  if (clientError) throw new Error(clientError.message);
  if (event.client_id && !client) throw new Error("Matched client was not found");

  const assigneeId = event.assigned_to || await pickAssignee(taskDb, client);
  const result = await createSipTaskAndNotifications({
    supabase,
    actor,
    profile,
    event,
    client,
    assigneeId,
    request,
  });

  if (result.error) throw new Error(result.error);

  const { data: updatedEvent, error: updateError } = await taskDb
    .from("sip_events")
    .update({
      task_id: result.task.id,
      notification_id: result.notification?.id || null,
      assigned_to: assigneeId,
    })
    .eq("id", event.id)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);
  return { event: updatedEvent, task: result.task, notification: result.notification, alreadyExists: false };
}

export async function importSipReport({
  supabase,
  actor,
  profile,
  fileName,
  buffer,
  sourceType = "manual_upload",
  reportRta = DEFAULT_SIP_REPORT_RTA,
  reportType = DEFAULT_SIP_REPORT_TYPE,
  request,
}) {
  const taskDb = getTaskDataClient(supabase);
  const hash = fileHash(buffer);
  const { data: existingImport } = await taskDb
    .from("sip_report_imports")
    .select("id")
    .eq("file_hash", hash)
    .eq("import_status", "completed")
    .maybeSingle();

  const parsedReport = await parseSipReportFile({ buffer, fileName, reportRta, reportType });
  const rows = parsedReport.rows;
  const selection = parsedReport.selection;
  const { data: importRow, error: importError } = await taskDb
    .from("sip_report_imports")
    .insert({
      source_type: sourceType,
      report_rta: selection.reportRta,
      report_type: selection.reportType,
      file_name: fileName,
      file_hash: hash,
      imported_by: actor.id,
      import_status: "processing",
      total_rows: rows.length,
      metadata: {
        report_label: selection.reportLabel,
        rta_label: selection.rtaLabel,
        ...(existingImport ? { duplicate_file_of: existingImport.id } : {}),
      },
    })
    .select()
    .single();

  if (importError) throw new Error(importError.message);

  const summary = {
    total_rows: rows.length,
    new_records: 0,
    duplicate_records: 0,
    failed_rows: 0,
    matched_rows: 0,
    unmatched_rows: 0,
    errors: [],
  };

  for (const [index, row] of rows.entries()) {
    try {
      const { data: existingEvent } = await taskDb
        .from("sip_events")
        .select("id")
        .eq("row_fingerprint", row.row_fingerprint)
        .maybeSingle();

      if (existingEvent) {
        summary.duplicate_records += 1;
        continue;
      }

      const match = await findClientMatch(taskDb, row);
      const client = match.matched_status === "matched" ? match.client : null;
      const assigneeId = client ? await pickAssignee(taskDb, client) : null;
      const eventPayload = {
        ...row,
        import_id: importRow.id,
        report_rta: selection.reportRta,
        report_type: selection.reportType,
        client_id: client?.id || null,
        matched_status: match.matched_status,
        match_confidence: match.match_confidence,
        match_reason: match.match_reason,
        assigned_to: assigneeId,
      };

      const { data: event, error: eventError } = await taskDb
        .from("sip_events")
        .insert(eventPayload)
        .select()
        .single();

      if (eventError) {
        if (eventError.code === "23505") summary.duplicate_records += 1;
        else if (
          eventError.code === "23514" &&
          String(eventError.message || "").includes("sip_events_event_type_check")
        ) {
          throw new Error(
            "Database migration required: sip_events_event_type_check must allow the 'closed' event type before importing Closed SIP/STP reports."
          );
        }
        else throw new Error(eventError.message);
        continue;
      }

      summary.new_records += 1;
      if (match.matched_status === "matched") summary.matched_rows += 1;
      else summary.unmatched_rows += 1;

      if (client && ["terminated", "paused", "rejected", "expiring", "closed", "unoperational"].includes(event.event_type)) {
        const taskResult = await createSipTaskAndNotifications({
          supabase,
          actor,
          profile,
          event,
          client,
          assigneeId,
          request,
        });

        if (taskResult.task) {
          await taskDb
            .from("sip_events")
            .update({
              task_id: taskResult.task.id,
              notification_id: taskResult.notification?.id || null,
            })
            .eq("id", event.id);
        } else if (taskResult.error) {
          summary.errors.push({ row: index + 1, error: `Task creation failed: ${taskResult.error}` });
        }
      }
    } catch (error) {
      summary.failed_rows += 1;
      summary.errors.push({ row: index + 1, error: error.message });
    }
  }

  const importStatus = summary.failed_rows > 0 ? "completed_with_errors" : "completed";
  await taskDb
    .from("sip_report_imports")
    .update({
      import_status: importStatus,
      total_rows: summary.total_rows,
      new_records: summary.new_records,
      duplicate_records: summary.duplicate_records,
      failed_rows: summary.failed_rows,
      matched_rows: summary.matched_rows,
      unmatched_rows: summary.unmatched_rows,
      error_summary: summary.errors,
    })
    .eq("id", importRow.id);

  const adminIds = await getAdminUserIds(taskDb);
  await Promise.all(
    adminIds.map((adminId) =>
      createNotification(taskDb, {
        userId: adminId,
        title: "SIP report imported",
        message: `${sipReportRtaLabel(selection.reportRta)} ${sipReportTypeLabel(selection.reportType)}: ${summary.new_records} new, ${summary.duplicate_records} duplicates, ${summary.unmatched_rows} unmatched.`,
        type: "sip_report_imported",
        entityType: "sip_import",
        entityId: importRow.id,
        linkUrl: "/admin/sip-tracker",
        metadata: summary,
        dedupeKey: `sip_report_import:${importRow.id}:${adminId}`,
      })
    )
  );

  await writeAuditLog(supabase, {
    actor,
    profile,
    action: "sip_report_imported",
    entityType: "sip_import",
    entityId: importRow.id,
    newValue: summary,
    request,
  });

  return {
    import_id: importRow.id,
    duplicate_file: Boolean(existingImport),
    report_rta: selection.reportRta,
    report_type: selection.reportType,
    report_label: selection.reportLabel,
    rta_label: selection.rtaLabel,
    ...summary,
  };
}
