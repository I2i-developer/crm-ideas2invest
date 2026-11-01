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
    const actor = sourceId(p.get("actor"));
    let q = ctx.db.from("sales_followups").select(`*,activity:sales_activities${actor ? "!inner" : ""}(actor_id),lead:sales_leads!inner(id,name,phone,assigned_to,assigned_user_ids,archived_at,source_id)`, { count: "exact" }).eq("lead.source_id", source).eq("status", "Pending").is("lead.archived_at", null).order("due_at").order("id");
    if (actor) q = q.eq("activity.actor_id", actor);
    if (ctx.role !== "admin") q = q.contains("lead.assigned_user_ids", [ctx.user.id]);
    const page = Math.max(1, Number.parseInt(p.get("page"), 10) || 1);
    if (ctx.role === "admin" && p.get("owner")) q = q.contains("lead.assigned_user_ids", [sourceId(p.get("owner"))]);
    const { data, error, count } = await q.range((page - 1) * 25, page * 25 - 1);
    if (error) throw error;
    const actorIds = [...new Set((data || []).map((item) => item.activity?.actor_id).filter(Boolean))];
    const { data: profiles, error: profileError } = actorIds.length ? await ctx.db.from("profiles").select("id,name,full_name").in("id", actorIds) : { data: [] };
    if (profileError) throw profileError;
    const actors = new Map((profiles || []).map((profile) => [profile.id, profile.name || profile.full_name || "CRM user"]));
    return salesJson({ followups: (data || []).map((item) => ({ ...item, set_by: item.activity?.actor_id ? { id: item.activity.actor_id, name: actors.get(item.activity.actor_id) || "CRM user" } : null })), total: count, page });
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
