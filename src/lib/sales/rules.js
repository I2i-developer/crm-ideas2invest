import * as chrono from "chrono-node";

export const SALES_STATUSES = [
  "New", ...Array.from({ length: 6 }, (_, i) => `RNR-${i + 1}`),
  "Call Busy", "Switched off", "Call back later", "Follow up",
  "Meeting Schedule", "Meeting Completed", "Follow up after meeting",
  "Not Interested", "Wrong Number", "Do Not Call", "Converted", "Meeting Cancelled",
];
export const CALL_STATUSES = ["RNR", ...SALES_STATUSES.filter((s) => !["New", "Meeting Cancelled"].includes(s) && !s.startsWith("RNR-"))];
export const FOLLOWUP_STATUSES = ["Call back later", "Follow up", "Follow up after meeting"];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sourceId(value) {
  if (!value) return null;
  if (!UUID_RE.test(value)) throw new Error("Select a valid source");
  return value;
}

export function validateImportSource(input) {
  const id = sourceId(input.source_id);
  const name = String(input.source_name || "").trim().replace(/\s+/g, " ");
  if (id && name) throw new Error("Choose an existing source or a new source, not both");
  if (!id && (!name || name.length > 120)) throw new Error("Source name is required (maximum 120 characters)");
  return { source_id: id, source_name: name || null };
}

export function phoneKey(value) {
  const text = String(value ?? "").trim();
  if (!text || !/^[+\d\s().-]+$/.test(text)) return "";
  let digits = text.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : "";
}

export function normalizeStatus(value) {
  const original = String(value || "").trim();
  if (!original) return "New";
  const key = original.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (/^rnr\s*[1-6]$/.test(key)) return `RNR-${key.match(/[1-6]/)[0]}`;
  const aliases = {
    rnr: "RNR-1", busy: "Call Busy", "switched off": "Switched off",
    "callback": "Call back later", "call back": "Call back later", "followup": "Follow up",
    "meeting scheduled": "Meeting Schedule", "not interested": "Not Interested",
    "non interested": "Not Interested", "dnc": "Do Not Call",
  };
  return aliases[key] || SALES_STATUSES.find((s) => s.toLowerCase().replace(/-/g, " ") === key) || "";
}

export function istDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function toIstInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 16);
}

export function fromIstInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "")) return null;
  const d = new Date(`${value}:00+05:30`);
  return Number.isNaN(d.getTime()) || toIstInput(d) !== value ? null : d.toISOString();
}

export function suggestedFollowup(status, remark, reference = new Date()) {
  if (status === "Call Busy") return new Date(reference.getTime() + 3 * 86400000).toISOString();
  if (status === "Switched off") return new Date(reference.getTime() + 7 * 86400000).toISOString();
  if (!FOLLOWUP_STATUSES.includes(status)) return null;
  const results = chrono.en.casual.parse(String(remark || ""), { instant: reference, timezone: 330 }, { forwardDate: true });
  const future = results.find((r) => r.start.date().getTime() > reference.getTime());
  return future ? future.start.date().toISOString() : null;
}

export function validateLead(input) {
  const name = String(input.name || "").trim();
  const phone = String(input.phone || "").trim();
  const email = String(input.email || "").trim();
  const address = String(input.address || "").trim();
  if (address.length > 1000) throw new Error("Address must be at most 1000 characters");
  if (!name || name.length > 180) throw new Error("Name/Entity is required (maximum 180 characters)");
  if (!phoneKey(phone)) throw new Error("Enter one valid phone number with its country code when outside India");
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Enter a valid email address");
  return { name, phone, phone_key: phoneKey(phone), email: email || null, address: address || null };
}

export function validateActivity(body, lead, reference = new Date()) {
  const kind = body.kind || "call";
  if (!["call", "note", "meeting"].includes(kind)) throw new Error("Invalid activity type");
  if (!UUID_RE.test(body.request_id || "")) throw new Error("A request identifier is required");
  const remark = String(body.remark || "").trim();
  if (!remark || remark.length > 5000) throw new Error("Add a remark (maximum 5000 characters)");
  let status = kind === "note" ? lead.status : String(body.status || "");
  if (status === "RNR") status = `RNR-${Math.min(6, (lead.rnr_count || 0) + 1)}`;
  if (!SALES_STATUSES.includes(status) || (kind === "call" && status === "New")) throw new Error("Select a valid call status");
  if (kind === "call" && ["Do Not Call", "Converted"].includes(lead.status)) throw new Error("This lead is closed for calling; ask an admin to reopen it");
  let due = body.due_at || null;
  if (kind !== "note" && ["Call Busy", "Switched off"].includes(status)) due = suggestedFollowup(status, remark, reference);
  if (due && (!Number.isFinite(Date.parse(due)) || Date.parse(due) <= reference.getTime())) throw new Error("Follow-up time must be in the future");
  if (kind !== "note" && FOLLOWUP_STATUSES.includes(status) && !due) throw new Error("Confirm a follow-up date and time from the remark");
  if (kind !== "note" && status === "Meeting Schedule") {
    if (!body.meeting_at || !Number.isFinite(Date.parse(body.meeting_at)) || Date.parse(body.meeting_at) <= reference.getTime()) throw new Error("Choose a future meeting date and time");
    if (!body.meeting_end || Date.parse(body.meeting_end) <= Date.parse(body.meeting_at)) throw new Error("Meeting end must be after the start");
  }
  if (kind !== "note" && status === "Meeting Completed" && !String(body.meeting_notes || "").trim()) throw new Error("Add the minutes of the meeting");
  return { ...body, kind, status, remark, due_at: due };
}

export function prepareImport(matrix) {
  const aliases = {
    name: ["nameentity", "name", "entity", "clientname", "leadname"],
    phone: ["phone", "phoneno", "phonenumber", "mobile", "mobileno", "mobilenumber", "contactnumber"],
    email: ["emailaddress", "email", "emailid"], status: ["status", "callstatus"],
    remark: ["remark", "remarks", "notes"], done_by: ["doneby", "calledby", "handledby"],
    address: ["address", "postaladdress", "residentialaddress", "officeaddress", "fulladdress", "mailingaddress"],
  };
  const normalize = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let headerRow = -1;
  let mapping;
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const headers = matrix[i].map(normalize);
    const map = Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, headers.findIndex((h) => values.includes(h))]));
    if (map.name >= 0 && map.phone >= 0) { headerRow = i; mapping = map; break; }
  }
  if (headerRow < 0) throw new Error("The sheet must contain Name/Entity and Phone columns");
  const seen = new Set();
  return matrix.slice(headerRow + 1).flatMap((row, i) => {
    if (!row.some((cell) => String(cell ?? "").trim())) return [];
    const result = { row: headerRow + i + 2 };
    try {
      const fields = Object.fromEntries(Object.entries(mapping).map(([key, column]) => [key, column < 0 ? "" : String(row[column] ?? "").trim()]));
      const lead = validateLead(fields);
      const status = normalizeStatus(fields.status);
      if (!status) throw new Error(`Unknown status: ${fields.status}`);
      if (seen.has(lead.phone_key)) throw new Error("Duplicate phone within this file");
      seen.add(lead.phone_key);
      return [{ ...result, ...lead, status, remark: fields.remark.slice(0, 5000), done_by: fields.done_by.slice(0, 180), valid: true }];
    } catch (error) {
      return [{ ...result, name: String(row[mapping.name] || ""), phone: String(row[mapping.phone] || ""), valid: false, error: error.message }];
    }
  });
}
