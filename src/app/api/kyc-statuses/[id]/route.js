import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { isValidPan, normalizeKycPayload } from "@/lib/kyc/status";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_kyc_status_update",
      entityType: "client_kyc_status",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Only CRM admin and operations users can update KYC status records" }, { status: 403 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("client_kyc_statuses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "KYC status record not found" }, { status: 404 });

  const body = await request.json();
  const payload = normalizeKycPayload({ ...existing, ...body }, user.id);
  if (!payload.client_name) return NextResponse.json({ error: "Client name is required" }, { status: 400 });
  if (payload.normalized_pan && !isValidPan(payload.normalized_pan)) {
    return NextResponse.json({ error: "PAN number format is invalid" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_kyc_statuses")
    .update(payload)
    .eq("id", id)
    .select("*, client:clients(id, full_name, email, mobile)")
    .single();

  if (error) {
    const duplicate = error.code === "23505" || /duplicate|unique/i.test(error.message || "");
    return NextResponse.json(
      { error: duplicate ? "This PAN already exists in KYC Status Tracker" : error.message },
      { status: duplicate ? 409 : 500 }
    );
  }

  await supabase.from("client_kyc_status_history").insert({
    kyc_status_id: id,
    changed_by: user.id,
    old_status: existing.kyc_status,
    new_status: data.kyc_status,
    old_value: existing,
    new_value: data,
    change_note: body.change_note || "KYC tracker record updated",
  });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "kyc_status_updated",
    entityType: "client_kyc_status",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ record: data }, { status: 200 });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_kyc_status_delete",
      entityType: "client_kyc_status",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Only admin can delete KYC status records" }, { status: 403 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("client_kyc_statuses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "KYC status record not found" }, { status: 404 });

  const { error } = await supabase.from("client_kyc_statuses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "kyc_status_deleted",
    entityType: "client_kyc_status",
    entityId: id,
    oldValue: existing,
    request,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
