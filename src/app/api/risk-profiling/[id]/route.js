import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { canAccessClient, getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

export async function PATCH(request, { params }) {
  const supabase = await createClient(request);
  const { id } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing, error: existingError } = await supabase
    .from("risk_profile_assessments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  const body = await request.json();
  const approving = body.action === "approve";

  if (approving && !isAdmin(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_risk_assessment_approve",
      entityType: "risk_profile_assessment",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Only admin can approve risk profiles" }, { status: 403 });
  }

  if (!approving) {
    const allowed = isAdmin(role) || await canAccessClient(supabase, user.id, role, existing.client_id);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isAdmin(role) && body.status === "Approved") {
      return NextResponse.json({ error: "Only admin can approve risk profiles" }, { status: 403 });
    }
  }

  const payload = approving
    ? { status: "Approved", approved_by: user.id, approved_at: new Date().toISOString() }
    : {
        status: body.status || existing.status,
        review_date: body.review_date || existing.review_date,
        remarks: body.remarks ?? existing.remarks,
      };

  const { data, error } = await supabase
    .from("risk_profile_assessments")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: approving ? "risk_assessment_approved" : "risk_assessment_updated",
    entityType: "risk_profile_assessment",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ assessment: data }, { status: 200 });
}
