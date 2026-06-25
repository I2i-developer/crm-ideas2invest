import crypto from "crypto";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".txt"];
const STATUSES = ["Pending", "In progress", "Done", "On hold", "Cancelled"];

const HEADER_MAP = {
  client_name: [
    "client",
    "clientname",
    "client_name",
    "client name",
    "customer",
    "investor",
    "investorname",
    "investor name",
    "name of client",
  ],
  task_date: ["date", "taskdate", "task date", "workdate", "work date", "createddate", "created date"],
  task_description: [
    "task",
    "tasks",
    "taskdescription",
    "task description",
    "work",
    "workdescription",
    "work description",
    "description",
    "particulars",
  ],
  remark: ["remark", "remarks", "note", "notes", "comment", "comments"],
  done_by: ["doneby", "done by", "completedby", "completed by", "team member", "user", "person"],
  status: ["status", "taskstatus", "task status", "workstatus", "work status"],
};

function normalizedHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, " ");
}

function canonicalHeader(value) {
  const normalized = normalizedHeader(value);
  const compact = normalized.replace(/\s+/g, "");

  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    if (aliases.some((alias) => alias === normalized || alias === compact)) return field;
  }

  return null;
}

function dateToIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function excelSerialToDate(serial) {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return null;
  return dateToIso(new Date(parsed.y, parsed.m - 1, parsed.d));
}

function parseTaskDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) return dateToIso(value) || new Date().toISOString().slice(0, 10);
  if (typeof value === "number") return excelSerialToDate(value) || new Date().toISOString().slice(0, 10);

  const text = String(value).trim();
  if (!text) return new Date().toISOString().slice(0, 10);

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const dmy = text.match(/^(\d{1,2})[-/.\s]([A-Za-z]{3,}|\d{1,2})[-/.\s](\d{2,4})$/);
  if (dmy) {
    let [, day, month, year] = dmy;
    const monthNames = {
      jan: "01",
      january: "01",
      feb: "02",
      february: "02",
      mar: "03",
      march: "03",
      apr: "04",
      april: "04",
      may: "05",
      jun: "06",
      june: "06",
      jul: "07",
      july: "07",
      aug: "08",
      august: "08",
      sep: "09",
      sept: "09",
      september: "09",
      oct: "10",
      october: "10",
      nov: "11",
      november: "11",
      dec: "12",
      december: "12",
    };
    month = monthNames[month.toLowerCase()] || month.padStart(2, "0");
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day.padStart(2, "0")}`;
  }

  return dateToIso(new Date(text)) || new Date().toISOString().slice(0, 10);
}

function splitDoneBy(value) {
  return String(value || "")
    .split(/[,;/|&\n]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ id: null, name }));
}

function normalizeStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "Pending";
  if (["done", "complete", "completed", "closed"].includes(text)) return "Done";
  if (["in progress", "inprogress", "progress", "wip", "working"].includes(text)) return "In progress";
  if (["hold", "on hold", "onhold", "paused"].includes(text)) return "On hold";
  if (["cancelled", "canceled", "cancel"].includes(text)) return "Cancelled";
  return STATUSES.find((status) => status.toLowerCase() === text) || "Pending";
}

function findHeaderRow(rows) {
  let best = { index: -1, mapping: {}, score: 0 };

  rows.slice(0, 15).forEach((row, rowIndex) => {
    const mapping = {};
    row.forEach((cell, cellIndex) => {
      const key = canonicalHeader(cell);
      if (key && mapping[key] === undefined) mapping[key] = cellIndex;
    });
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { index: rowIndex, mapping, score };
  });

  return best;
}

function rowValue(row, mapping, key) {
  const index = mapping[key];
  return index === undefined ? "" : row[index];
}

export async function POST(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperations(role)) {
    return NextResponse.json({ error: "Only operations users can import self work records" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Please upload an Excel or CSV file" }, { status: 400 });
  }

  const fileName = file.name || "work-tracker-import";
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return NextResponse.json({ error: "Only Excel and CSV files are supported" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File is too large. Please upload a file below 10 MB" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false, raw: true });

    if (!rows.length) return NextResponse.json({ error: "The uploaded file is empty" }, { status: 400 });

    const header = findHeaderRow(rows);
    if (header.mapping.task_description === undefined) {
      return NextResponse.json({
        error: "Missing required work tracker column: Task/work description",
      }, { status: 400 });
    }

    const dataRows = rows.slice(header.index + 1);
    const errors = [];
    const payloads = [];

    dataRows.forEach((row, index) => {
      const taskDescription = String(rowValue(row, header.mapping, "task_description") || "").trim();
      const hasAnyData = row.some((cell) => String(cell || "").trim());
      if (!hasAnyData) return;

      if (!taskDescription) {
        errors.push({ row: index + header.index + 2, error: "Task/work description is missing" });
        return;
      }

      payloads.push({
        client_name: String(rowValue(row, header.mapping, "client_name") || "").trim() || null,
        task_date: parseTaskDate(rowValue(row, header.mapping, "task_date")),
        task_description: taskDescription,
        remark: String(rowValue(row, header.mapping, "remark") || "").trim() || null,
        done_by: splitDoneBy(rowValue(row, header.mapping, "done_by")),
        status: normalizeStatus(rowValue(row, header.mapping, "status")),
        priority: "Medium",
        metadata: {
          import_file_name: fileName,
          import_file_hash: fileHash,
          import_sheet_name: firstSheetName,
          import_row_number: index + header.index + 2,
        },
        created_by: user.id,
        updated_by: user.id,
      });
    });

    let inserted = [];
    if (payloads.length) {
      const { data, error } = await db.from("operation_self_tasks").insert(payloads).select();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      inserted = data || [];
    }

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "operation_self_tasks_imported",
      entityType: "operation_self_task",
      metadata: {
        file_name: fileName,
        file_hash: fileHash,
        total_rows: dataRows.length,
        imported_rows: inserted.length,
        failed_rows: errors.length,
      },
      request,
    });

    return NextResponse.json({
      file_name: fileName,
      total_rows: dataRows.filter((row) => row.some((cell) => String(cell || "").trim())).length,
      imported_rows: inserted.length,
      failed_rows: errors.length,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to import work tracker file" }, { status: 500 });
  }
}
