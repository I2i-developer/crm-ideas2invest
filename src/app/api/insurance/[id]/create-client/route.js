import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { id } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && String(role || "").toLowerCase() !== "operations") {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_insurance_client_create",
      entityType: "insurance_policy",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "You cannot create CRM clients from insurance imports" }, { status: 403 });
  }

  const { data: policy, error: policyError } = await db
    .from("insurance_policies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (policyError) return NextResponse.json({ error: policyError.message }, { status: 500 });
  if (!policy) return NextResponse.json({ error: "Insurance policy not found" }, { status: 404 });
  if (policy.client_id) return NextResponse.json({ error: "This policy is already linked to a CRM client" }, { status: 409 });

  const fullName = String(policy.imported_client_name || "").trim();
  if (!fullName) return NextResponse.json({ error: "Imported client name is required before creating a CRM client" }, { status: 400 });

  const mobile = policy.imported_contact_mobile || policy.contact_mobile || null;
  const email = policy.imported_contact_email || policy.contact_email || null;

  const { data: client, error: clientError } = await db
    .from("clients")
    .insert({
      full_name: fullName,
      display_name: fullName,
      mobile,
      email,
      tax_status: "Individual",
      holding_pattern: "Single",
      has_insurance: "Yes",
      insurance_through_company: policy.through_company ? "Yes" : "No",
      insurance_provider_name: policy.insurance_company || null,
      insurance_policy_type: policy.policy_type || null,
      insurance_renewal_date: policy.due_date || policy.renewal_date || null,
      insurance_remarks: policy.remarks || "Created from insurance renewal queue",
      onboarding_status: "Imported",
      notes: "Created manually from imported insurance policy row.",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, full_name, mobile, email")
    .single();

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 });

  const { data: updatedPolicy, error: updateError } = await db
    .from("insurance_policies")
    .update({
      client_id: client.id,
      match_status: "manual_linked",
      match_reason: "CRM client created from insurance row",
      contact_mobile: policy.contact_mobile || mobile,
      contact_email: policy.contact_email || email,
      updated_by: user.id,
    })
    .eq("id", id)
    .select("*, client:clients(id, full_name, mobile, email, has_insurance, insurance_through_company)")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "insurance_import_client_created",
    entityType: "insurance_policy",
    entityId: id,
    newValue: { client, policy: updatedPolicy },
    request,
  });

  return NextResponse.json({ client, policy: updatedPolicy }, { status: 201 });
}
