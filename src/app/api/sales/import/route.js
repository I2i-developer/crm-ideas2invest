import * as XLSX from "xlsx";
import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { prepareImport, validateLead, normalizeStatus, validateImportSource, validateAssignees, SALES_IMPORT_LIMIT } from "@/lib/sales/rules";
import { writeAuditLog } from "@/lib/audit/logger";

export async function POST(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || !/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error("Choose an Excel or CSV calling sheet");
    if (file.size > 10 * 1024 * 1024) throw new Error("The file must be smaller than 10 MB");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, sheetRows: SALES_IMPORT_LIMIT + 27 });
    const sheetName = String(form.get("sheet") || workbook.SheetNames[0]);
    if (!workbook.Sheets[sheetName]) throw new Error("Worksheet not found");
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    const rows = prepareImport(matrix);
    if (rows.length > SALES_IMPORT_LIMIT || workbook.Sheets[sheetName]["!fullref"] && XLSX.utils.decode_range(workbook.Sheets[sheetName]["!fullref"]).e.r > SALES_IMPORT_LIMIT + 25) throw new Error("Import at most 10,000 leads per file");
    const keys = [...new Set(rows.filter((r) => r.valid).flatMap((r) => r.phone_keys))];
    const existing = new Set();
    for (let i = 0; i < keys.length; i += 200) {
      const { data, error } = await ctx.db.from("sales_lead_phones").select("phone_key").in("phone_key", keys.slice(i, i + 200));
      if (error) throw error;
      (data || []).forEach((r) => existing.add(r.phone_key));
    }
    rows.filter((r) => r.valid).forEach((r) => { if (r.phone_keys.some((key) => existing.has(key))) { r.valid = false; r.error = "Phone already exists in CRM; existing lead and source will not change"; } });
    return salesJson({ filename: file.name, sheet: sheetName, sheets: workbook.SheetNames, rows, valid: rows.filter((r) => r.valid).length, rejected: rows.filter((r) => !r.valid).length });
  } catch (error) { return salesError(error); }
}

export async function PUT(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const body = await request.json();
    const source = validateImportSource(body);
    const assignees = validateAssignees(body.assigned_user_ids ?? (body.assigned_to ? [body.assigned_to] : []));
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > SALES_IMPORT_LIMIT) throw new Error("Choose between 1 and 10,000 valid rows");
    const rows = body.rows.map((row) => {
      const status = normalizeStatus(row.status);
      if (!status) throw new Error("Unknown import status");
      return { ...validateLead(row), status, row: row.row, remark: String(row.remark || "").slice(0, 5000), done_by: String(row.done_by || "").slice(0, 180) };
    });
    const { data, error } = await ctx.supabase.rpc("sales_import_shared_to_source", { p_rows: rows, p_filename: String(body.filename || "Calling sheet").slice(0, 255), p_assigned_users: assignees, p_source_id: source.source_id, p_source_name: source.source_name });
    if (error) throw error;
    await writeAuditLog(ctx.supabase, { actor: ctx.user, profile: ctx.profile, action: "sales_sheet_imported", entityType: "sales_import", entityId: data.import_id, newValue: { source_id: data.source_id, source_name: data.source_name, assigned_user_ids: data.assigned_user_ids, accepted: data.accepted, rejected: data.rejected }, request });
    return salesJson(data);
  } catch (error) { return salesError(error); }
}
