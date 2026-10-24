import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { sourceId } from "@/lib/sales/rules";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const p = new URL(request.url).searchParams;
    const source = sourceId(p.get("source"));
    if (!source) return salesJson({ followups: [], total: 0, page: 1 });
    let q = ctx.db.from("sales_followups").select("*,lead:sales_leads!inner(id,name,phone,assigned_to,archived_at,source_id)", { count: "exact" }).eq("lead.source_id", source).eq("status", "Pending").is("lead.archived_at", null).order("due_at");
    if (ctx.role !== "admin") q = q.eq("lead.assigned_to", ctx.user.id);
    const page = Math.max(1, Number.parseInt(p.get("page"), 10) || 1);
    if (ctx.role === "admin" && p.get("owner")) q = q.eq("user_id", p.get("owner"));
    const { data, error, count } = await q.range((page - 1) * 25, page * 25 - 1);
    if (error) throw error;
    return salesJson({ followups: data, total: count, page });
  } catch (error) { return salesError(error); }
}

export async function PATCH(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const body = await request.json();
    const { data, error } = await ctx.supabase.rpc("sales_update_followup", { p_id: body.id, p_action: body.action, p_due: body.due_at || null });
    if (error) throw error;
    return salesJson({ followup: data });
  } catch (error) { return salesError(error); }
}
