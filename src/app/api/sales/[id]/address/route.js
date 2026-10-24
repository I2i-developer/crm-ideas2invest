import { salesContext, salesJson, salesError, getSalesLead } from "@/lib/sales/server";
import { UUID_RE } from "@/lib/sales/rules";
import { writeAuditLog } from "@/lib/audit/logger";

export async function PATCH(request, { params }) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return salesJson({ error: "Lead not found" }, 404);
    const existing = await getSalesLead(ctx, id);
    if (!existing) return salesJson({ error: "Lead not found" }, 404);
    const body = await request.json();
    if (typeof body.address !== "string" || body.address.trim().length > 1000) throw new Error("Address must be text of at most 1000 characters");
    if (!Number.isSafeInteger(body.version) || body.version < 1) throw new Error("Refresh the lead before editing its address");
    const { data, error } = await ctx.supabase.rpc("sales_update_address", { p_id: id, p_version: body.version, p_address: body.address.trim() });
    if (error) throw error;
    await writeAuditLog(ctx.supabase, { actor: ctx.user, profile: ctx.profile, action: "sales_address_updated", entityType: "sales_lead", entityId: id, oldValue: { address: existing.address }, newValue: { address: data.address }, request });
    return salesJson({ lead: data });
  } catch (error) { return salesError(error); }
}
