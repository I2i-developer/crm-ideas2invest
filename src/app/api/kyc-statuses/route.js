import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { buildKycSummary, isValidPan, normalizeKycPayload, normalizePan } from "@/lib/kyc/status";

export const dynamic = "force-dynamic";

async function findClientByPan(supabase, pan) {
  const normalized = normalizePan(pan);
  if (!normalized) return null;

  const { data: holder } = await supabase
    .from("client_holders")
    .select("client_id, client:clients(id, full_name)")
    .eq("pan", normalized)
    .maybeSingle();

  return holder?.client || null;
}

export async function GET(request) {
  const supabase = await createClient(request);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const review = searchParams.get("review") || "";
  const limit = Math.min(Number(searchParams.get("limit") || 1000), 5000);

  let query = supabase
    .from("client_kyc_statuses")
    .select("*, client:clients(id, full_name, email, mobile)")
    .order("client_name", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("kyc_status", status);
  if (review === "due") {
    query = query.lte("next_review_date", new Date().toISOString().slice(0, 10));
  }
  if (search) {
    const safe = search.replaceAll(",", " ");
    query = query.or(`client_name.ilike.%${safe}%,pan_number.ilike.%${safe}%,normalized_pan.ilike.%${safe}%,remarks.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ records: data || [], summary: buildKycSummary(data || []), role }, { status: 200 });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_kyc_status_create",
      entityType: "client_kyc_status",
      request,
    });
    return NextResponse.json({ error: "Only CRM admin and operations users can add KYC status records" }, { status: 403 });
  }

  const body = await request.json();
  const payload = normalizeKycPayload(body, user.id);
  if (!payload.client_name) return NextResponse.json({ error: "Client name is required" }, { status: 400 });
  if (payload.normalized_pan && !isValidPan(payload.normalized_pan)) {
    return NextResponse.json({ error: "PAN number format is invalid" }, { status: 400 });
  }

  const linkedClient = body.client_id ? null : await findClientByPan(supabase, payload.normalized_pan);
  const insertPayload = {
    ...payload,
    client_id: payload.client_id || linkedClient?.id || null,
    created_by: user.id,
    updated_by: user.id,
  };

  const { data, error } = await supabase
    .from("client_kyc_statuses")
    .insert(insertPayload)
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
    kyc_status_id: data.id,
    changed_by: user.id,
    old_status: null,
    new_status: data.kyc_status,
    new_value: data,
    change_note: "KYC tracker record created",
  });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "kyc_status_created",
    entityType: "client_kyc_status",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ record: data }, { status: 201 });
}
