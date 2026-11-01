import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { sourceId, istDate } from "@/lib/sales/rules";
import { buildCallingEodPrefill } from "@/lib/sales/eodPrefill";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  if (ctx.role !== "sales") return salesJson({ error: "Only Sales users can prepare their calling EOD" }, 403);
  try {
    const params = new URL(request.url).searchParams, source = sourceId(params.get("source")), date = params.get("date") || istDate();
    if (!source || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > istDate()) throw new Error("Choose a source and a valid report date");
    const { data: rows, error } = await ctx.supabase.rpc("sales_source_eod", { p_date: date, p_user: ctx.user.id, p_source_id: source });
    if (error) throw error;
    const { data: sourceRow, error: sourceError } = await ctx.db.from("sales_sources").select("id,name").eq("id", source).maybeSingle();
    if (sourceError) throw sourceError;
    if (!sourceRow) return salesJson({ error: "Source not found" }, 404);
    const { data: existing, error: reportError } = await ctx.db.from("operation_eod_reports")
      .select("id,report_date,work_summary,completed_work,pending_work,blockers,tomorrow_plan,client_followups,tasks_completed,tasks_pending,status")
      .eq("created_by", ctx.user.id).eq("report_date", date).is("operation_hidden_at", null).maybeSingle();
    if (reportError) throw reportError;
    const row = (rows || []).find((item) => item.user_id === ctx.user.id);
    return salesJson({ prefill: buildCallingEodPrefill(row, sourceRow.name, date), source_name: sourceRow.name, existing_report: existing || null });
  } catch (error) { return salesError(error); }
}
