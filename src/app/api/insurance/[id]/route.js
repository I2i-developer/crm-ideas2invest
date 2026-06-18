import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { canAccessClient, getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { normalizePolicyPayload } from "@/lib/insurance/renewals";
import { getTaskDataClient } from "@/lib/tasks/assignees";

async function getPolicy(db, id) {
  const { data, error } = await db
    .from("insurance_policies")
    .select("*, client:clients(id, full_name, mobile, email)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function PUT(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { id } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await getPolicy(db, id);
  if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const allowed =
    isAdmin(role) ||
    (!existing.client_id && String(role || "").toLowerCase() === "operations") ||
    await canAccessClient(supabase, user.id, role, existing.client_id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const payload = normalizePolicyPayload(body, user.id, existing);

  const { data, error } = await db
    .from("insurance_policies")
    .update(payload)
    .eq("id", id)
    .select("*, client:clients(id, full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing.client_id) {
    await db
      .from("clients")
      .update({
        has_insurance: "Yes",
        insurance_through_company: payload.through_company ? "Yes" : "No",
        insurance_provider_name: payload.insurance_company,
        insurance_policy_type: payload.policy_type,
        insurance_renewal_date: payload.renewal_date,
        insurance_remarks: payload.remarks,
        updated_by: user.id,
      })
      .eq("id", existing.client_id);
  }

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "insurance_policy_updated",
    entityType: "insurance_policy",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ policy: data }, { status: 200 });
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { id } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Only admin can delete insurance records" }, { status: 403 });

  const existing = await getPolicy(db, id);
  if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const { error } = await db.from("insurance_policies").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "insurance_policy_deleted",
    entityType: "insurance_policy",
    entityId: id,
    oldValue: existing,
    request,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
