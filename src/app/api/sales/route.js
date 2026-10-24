import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { validateLead, SALES_STATUSES, UUID_RE, sourceId } from "@/lib/sales/rules";
import { writeAuditLog } from "@/lib/audit/logger";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const p = new URL(request.url).searchParams;
    const page = Math.max(1, Number.parseInt(p.get("page"), 10) || 1);
    const source = sourceId(p.get("source"));
    let q = ctx.db.from("sales_lead_queue").select("*", { count: "exact" });
    if (ctx.role !== "admin") q = q.eq("assigned_to", ctx.user.id);
    else if (p.get("owner") === "unassigned") q = q.is("assigned_to", null);
    else if (UUID_RE.test(p.get("owner") || "")) q = q.eq("assigned_to", p.get("owner"));
    q = p.get("archived") === "true" ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    if (SALES_STATUSES.includes(p.get("status"))) q = q.eq("status", p.get("status"));
    if (p.get("due") === "overdue") q = q.lte("next_due", new Date().toISOString());
    const search = String(p.get("search") || "").replace(/[^a-zA-Z0-9@+.\s-]/g, " ").trim().slice(0, 100);
    if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,phone_key.ilike.%${search}%,email.ilike.%${search}%`);
    const { data: leads, error, count } = source
      ? await q.eq("source_id", source).order("updated_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1)
      : { data: [], error: null, count: 0 };
    if (error) throw error;
    let usersQuery = ctx.db.from("profiles").select("id,name,full_name,role,is_active,status").in("role", ["admin", "sales"]).order("name");
    if (ctx.role !== "admin") usersQuery = usersQuery.eq("id", ctx.user.id);
    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;
    return salesJson({ leads, total: count, page, page_size: 25, role: ctx.role,
      viewer: { id: ctx.user.id, name: ctx.profile.name || ctx.profile.full_name || ctx.user.email },
      users: (users || []).filter((u) => u.is_active !== false && u.status !== "Inactive").map((u) => ({ id: u.id, name: u.name || u.full_name || "Sales user", role: u.role })) });
  } catch (error) { return salesError(error); }
}

export async function POST(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    const body = await request.json();
    const lead = validateLead(body);
    const source = sourceId(body.source_id);
    if (!source) throw new Error("Select a source for this lead");
    if (body.assigned_to && !UUID_RE.test(body.assigned_to)) throw new Error("Select a valid user");
    const { data, error } = await ctx.supabase.rpc("sales_create_lead", { p: { ...lead, source_id: source, assigned_to: body.assigned_to || null, remark: String(body.remark || "").slice(0, 5000) } });
    if (error) throw error;
    await writeAuditLog(ctx.supabase, { actor: ctx.user, profile: ctx.profile, action: "sales_lead_created", entityType: "sales_lead", entityId: data.id, request });
    return salesJson({ lead: data }, 201);
  } catch (error) { return salesError(error); }
}
