import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit/logger";
import { getAdminUserIds, createNotification } from "@/lib/notifications/service";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";

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
const DATE_FIELDS = new Set(["start_date", "end_date", "termination_date", "sip_registration_date"]);

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function trimValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
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

function excelSerialToDate(serial) {
  const excelEpoch = Date.UTC(1899, 11, 30);
  return new Date(excelEpoch + Number(serial) * 86400000);
}

export function parseReportDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToDate(value).toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) return null;

  const iso = Date.parse(text);
  if (!Number.isNaN(iso) && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) {
    return new Date(iso).toISOString().slice(0, 10);
  }

  const match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (match) {
    const [, dayText, monthText, yearText] = match;
    const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString().slice(0, 10);
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
    row.folio_no,
    row.sip_registration_no,
    row.product_code,
    row.amount,
    row.termination_date,
    row.sip_flag,
    row.remarks,
    row.rejection_remarks,
  ].map((part) => String(part || "").trim().toLowerCase());

  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function normalizeRow(rawRow) {
  const normalized = { raw_row: rawRow };

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

function rowHasRequiredHeaders(row = []) {
  const headers = row.map(normalizeHeader);
  return REQUIRED_HEADERS.every((header) => headers.includes(header));
}

function buildRowsFromHeaderMatrix(matrix = []) {
  const headerIndex = matrix.findIndex(rowHasRequiredHeaders);
  if (headerIndex === -1) {
    const availableHeaders = matrix
      .slice(0, 12)
      .flat()
      .map(normalizeHeader)
      .filter(Boolean);
    const missing = REQUIRED_HEADERS.filter((header) => !availableHeaders.includes(header));
    throw new Error(`Missing required SIP report columns: ${missing.join(", ")}`);
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

export function fileHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function parseSipReportFile({ buffer, fileName }) {
  const extension = String(fileName || "").split(".").pop()?.toLowerCase();
  if (!["xlsx", "xls", "csv", "txt"].includes(extension)) {
    throw new Error("Unsupported file type. Upload .xlsx, .xls, or .csv.");
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found in uploaded file.");

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: false,
  });
  const rows = buildRowsFromHeaderMatrix(matrix);
  if (!rows.length) throw new Error("Uploaded SIP report is empty.");

  const sipRows = rows.map(normalizeRow).filter(isNormalSipRow);
  if (!sipRows.length) {
    throw new Error("No Normal SIP rows found. Normal STP rows are ignored by the SIP tracker.");
  }

  return sipRows;
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
    match_reason: "No mobile, email, folio, or reliable name match",
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
  const frequency = String(event.frequency || "").trim().toUpperCase() === "D" ? "Daily" : event.frequency;
  return [
    `Investor: ${event.investor_name || "Unknown"}`,
    `Event: ${event.event_type}`,
    `Fund: ${event.fund || "-"}`,
    `Scheme: ${event.scheme || "-"}`,
    `Folio: ${event.folio_no || "-"}`,
    `Amount: ${event.amount || "-"}`,
    `Frequency: ${frequency || "-"}`,
    `Date: ${formatDateDDMonYYYY(event.termination_date || event.end_date, "-")}`,
    `Remarks: ${event.remarks || "-"}`,
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
      priority: event.event_type === "terminated" ? "High" : "Medium",
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

export async function importSipReport({ supabase, actor, profile, fileName, buffer, sourceType = "manual_upload", request }) {
  const taskDb = getTaskDataClient(supabase);
  const hash = fileHash(buffer);
  const { data: existingImport } = await taskDb
    .from("sip_report_imports")
    .select("id")
    .eq("file_hash", hash)
    .eq("import_status", "completed")
    .maybeSingle();

  const rows = await parseSipReportFile({ buffer, fileName });
  const { data: importRow, error: importError } = await taskDb
    .from("sip_report_imports")
    .insert({
      source_type: sourceType,
      file_name: fileName,
      file_hash: hash,
      imported_by: actor.id,
      import_status: "processing",
      total_rows: rows.length,
      metadata: existingImport ? { duplicate_file_of: existingImport.id } : {},
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
        else throw new Error(eventError.message);
        continue;
      }

      summary.new_records += 1;
      if (match.matched_status === "matched") summary.matched_rows += 1;
      else summary.unmatched_rows += 1;

      if (client && ["terminated", "paused", "rejected"].includes(event.event_type)) {
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
        message: `${fileName}: ${summary.new_records} new, ${summary.duplicate_records} duplicates, ${summary.unmatched_rows} unmatched.`,
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

  return { import_id: importRow.id, duplicate_file: Boolean(existingImport), ...summary };
}
