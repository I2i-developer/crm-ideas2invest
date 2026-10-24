import * as XLSX from "xlsx";
import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { prepareImport, validateLead, normalizeStatus, validateImportSource, UUID_RE } from "@/lib/sales/rules";
import { writeAuditLog } from "@/lib/audit/logger";

export async function POST(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  if (ctx.role !== "admin") return salesJson({ error: "Only admins can import calling sheets" }, 403);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || !/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error("Choose an Excel or CSV calling sheet");
    if (file.size > 10 * 1024 * 1024) throw new Error("The file must be smaller than 10 MB");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, sheetRows: 5027 });
    const sheetName = String(form.get("sheet") || workbook.SheetNames[0]);
    if (!workbook.Sheets[sheetName]) throw new Error("Worksheet not found");
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    const rows = prepareImport(matrix);
    if (rows.length > 5000 || workbook.Sheets[sheetName]["!fullref"] && XLSX.utils.decode_range(workbook.Sheets[sheetName]["!fullref"]).e.r > 5025) throw new Error("Import at most 5000 leads per file");
    for (let i = 0; i < rows.length; i += 200) {
      const group = rows.slice(i, i + 200).filter((r) => r.valid);
      if (!group.length) continue;
      const { data, error } = await ctx.db.from("sales_leads").select("phone_key").in("phone_key", group.map((r) => r.phone_key));
      if (error) throw error;
      const existing = new Set((data || []).map((r) => r.phone_key));
      group.forEach((r) => { if (existing.has(r.phone_key)) { r.valid = false; r.error = "Phone already exists in CRM; existing lead and source will not change"; } });
    }
    return salesJson({ filename: file.name, sheet: sheetName, sheets: workbook.SheetNames, rows, valid: rows.filter((r) => r.valid).length, rejected: rows.filter((r) => !r.valid).length });
  } catch (error) { return salesError(error); }
}

export async function PUT(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  if (ctx.role !== "admin") return salesJson({ error: "Only admins can import calling sheets" }, 403);
  try {
    const body = await request.json();
    const source = validateImportSource(body);
    if (body.assigned_to && !UUID_RE.test(body.assigned_to)) throw new Error("Select a valid user");
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 5000) throw new Error("Choose between 1 and 5000 valid rows");
    const rows = body.rows.map((row) => {
      const status = normalizeStatus(row.status);
      if (!status) throw new Error("Unknown import status");
      return { ...validateLead(row), status, row: row.row, remark: String(row.remark || "").slice(0, 5000), done_by: String(row.done_by || "").slice(0, 180) };
    });
    const { data, error } = await ctx.supabase.rpc("sales_import_to_source", { p_rows: rows, p_filename: String(body.filename || "Calling sheet").slice(0, 255), p_assigned_to: body.assigned_to || null, p_source_id: source.source_id, p_source_name: source.source_name });
    if (error) throw error;
    await writeAuditLog(ctx.supabase, { actor: ctx.user, profile: ctx.profile, action: "sales_sheet_imported", entityType: "sales_import", entityId: data.import_id, newValue: { source_id: data.source_id, source_name: data.source_name, accepted: data.accepted, rejected: data.rejected }, request });
    return salesJson(data);
  } catch (error) { return salesError(error); }
}
