import { salesContext, salesJson, salesError, getSalesLead } from "@/lib/sales/server";
import { validateActivity, UUID_RE } from "@/lib/sales/rules";
import { writeAuditLog } from "@/lib/audit/logger";

export async function POST(request, { params }) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return salesJson({ error: "Lead not found" }, 404);
    const lead = await getSalesLead(ctx, id);
    if (!lead) return salesJson({ error: "Lead not found" }, 404);
    const body = validateActivity(await request.json(), lead);
    const { data, error } = await ctx.supabase.rpc("sales_record_activity", { p_id: id, p: body });
    if (error) throw error;
    await writeAuditLog(ctx.supabase, { actor: ctx.user, profile: ctx.profile, action: "sales_activity_recorded", entityType: "sales_lead", entityId: id, newValue: { activity_id: data.activity.id, kind: body.kind, status: body.status }, request });
    return salesJson(data, 201);
  } catch (error) { return salesError(error); }
}
