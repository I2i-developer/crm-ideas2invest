import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { sourceId } from "@/lib/sales/rules";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const p = new URL(request.url).searchParams;
    const source = sourceId(p.get("source"));
    if (!source) return salesJson({ meetings: [] });
    const start = p.get("from"), end = p.get("to");
    const days = (Date.parse(end) - Date.parse(start)) / 86400000;
    if (!Number.isFinite(days) || days <= 0 || days > 62) throw new Error("Choose a calendar range of up to 62 days");
    let q = ctx.db.from("sales_meetings").select("*,lead:sales_leads!inner(id,name,phone,assigned_to,archived_at,source_id)").eq("lead.source_id", source).gte("starts_at", start).lt("starts_at", end).is("lead.archived_at", null).order("starts_at").limit(1000);
    if (ctx.role !== "admin") q = q.eq("lead.assigned_to", ctx.user.id);
    else if (p.get("owner")) q = q.eq("assigned_to", p.get("owner"));
    const { data, error } = await q;
    if (error) throw error;
    return salesJson({ meetings: data });
  } catch (error) { return salesError(error); }
}
