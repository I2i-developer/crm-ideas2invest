import { salesContext, salesJson, salesError, getSalesLead } from "@/lib/sales/server";
import { UUID_RE, validateLead } from "@/lib/sales/rules";
import { writeAuditLog } from "@/lib/audit/logger";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return salesJson({ error: "Lead not found" }, 404);
    const lead = await getSalesLead(ctx, id);
    if (!lead) return salesJson({ error: "Lead not found" }, 404);
    const page = Math.max(1, Number.parseInt(new URL(request.url).searchParams.get("page"), 10) || 1);
    const [events, meetings, reminders] = await Promise.all([
      ctx.db.from("sales_activities").select("*", { count: "exact" }).eq("lead_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 25, page * 25 - 1),
      ctx.db.from("sales_meetings").select("*").eq("lead_id", id).order("starts_at", { ascending: false }).limit(100),
      ctx.db.from("sales_followups").select("*").eq("lead_id", id).eq("status", "Pending").order("due_at"),
    ]);
    for (const result of [events, meetings, reminders]) if (result.error) throw result.error;
    const ids = [...new Set([lead.assigned_to, ...(events.data || []).map((a) => a.actor_id)].filter(Boolean))];
    const { data: profiles, error: profileError } = ids.length ? await ctx.db.from("profiles").select("id,name,full_name,email").in("id", ids) : { data: [] };
    if (profileError) throw profileError;
    const names = new Map((profiles || []).map((p) => [p.id, p.name || p.full_name || p.email || "Sales user"]));
    return salesJson({ lead: { ...lead, assigned_name: names.get(lead.assigned_to) || "Unassigned" },
      activities: (events.data || []).map((a) => ({ ...a, done_by: names.get(a.actor_id) || "Sales user" })),
      activity_total: events.count, meetings: meetings.data, followups: reminders.data });
  } catch (error) { return salesError(error); }
}

export async function PATCH(request, { params }) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  if (ctx.role !== "admin") return salesJson({ error: "Only admins can manage lead details and assignment" }, 403);
  try {
    const { id } = await params;
    const body = await request.json();
    if (!UUID_RE.test(id)) return salesJson({ error: "Lead not found" }, 404);
    const existing = await getSalesLead(ctx, id);
    if (!existing) return salesJson({ error: "Lead not found" }, 404);
    const fields = validateLead({ ...existing, ...body });
    const { data, error } = await ctx.supabase.rpc("sales_update_lead", { p_id: id, p: { ...body, ...fields } });
    if (error) throw error;
    await writeAuditLog(ctx.supabase, { actor: ctx.user, profile: ctx.profile, action: "sales_lead_updated", entityType: "sales_lead", entityId: id, request });
    return salesJson({ lead: data });
  } catch (error) { return salesError(error); }
}
