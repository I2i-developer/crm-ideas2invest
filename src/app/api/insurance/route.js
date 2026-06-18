import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { canAccessClient, getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { formatDateDDMonYYYY } from "@/lib/dateFormat";
import { createNotification, getAdminUserIds, notifyUsers } from "@/lib/notifications/service";
import { buildInsuranceSummary, inferPaymentStatus, normalizePolicyPayload } from "@/lib/insurance/renewals";
import { getTaskDataClient } from "@/lib/tasks/assignees";

async function canWorkOnClient(supabase, user, role, clientId) {
  if (isAdmin(role)) return true;
  return canAccessClient(supabase, user.id, role, clientId);
}

async function getProfilesByUserIds(supabase, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, full_name, email, role")
    .in("id", ids);

  if (error) {
    console.error("Insurance profile lookup failed:", error.message);
    return new Map();
  }

  return new Map((data || []).map((profile) => [profile.id, profile]));
}

export async function GET(request) {
  const supabase = await createClient(request);
  const readDb = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const renewalFrom = searchParams.get("renewal_from");
  const renewalTo = searchParams.get("renewal_to");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const throughCompany = searchParams.get("through_company");
  const policyType = searchParams.get("policy_type");
  const paymentStatus = searchParams.get("payment_status");
  const insuranceCompany = searchParams.get("insurance_company");
  const assignedTo = searchParams.get("assigned_to");
  const premiumRange = searchParams.get("premium_range");
  const search = searchParams.get("search");

  let query = readDb
    .from("insurance_policies")
    .select("*, client:clients(id, full_name, mobile, email, has_insurance, insurance_through_company)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("renewal_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);
  if (renewalFrom || dateFrom) query = query.gte("due_date", renewalFrom || dateFrom);
  if (renewalTo || dateTo) query = query.lte("due_date", renewalTo || dateTo);
  if (throughCompany === "true" || throughCompany === "false") query = query.eq("through_company", throughCompany === "true");
  if (policyType) query = query.eq("policy_type", policyType);
  if (paymentStatus) query = query.eq("payment_status", paymentStatus);
  if (insuranceCompany) query = query.ilike("insurance_company", `%${insuranceCompany}%`);
  if (premiumRange) {
    const [minimumText, maximumText] = premiumRange.split("-");
    const minimum = minimumText === "" ? NaN : Number(minimumText);
    const maximum = maximumText === "" ? NaN : Number(maximumText);
    if (Number.isFinite(minimum)) query = query.gte("premium_amount", minimum);
    if (Number.isFinite(maximum)) query = query.lte("premium_amount", maximum);
  }
  if (isAdmin(role) && assignedTo) query = query.eq("assigned_to", assignedTo);
  if (search) {
    query = query.or(
      `policy_number.ilike.%${search}%,insurance_company.ilike.%${search}%,policy_type.ilike.%${search}%,contact_mobile.ilike.%${search}%,contact_email.ilike.%${search}%,imported_client_name.ilike.%${search}%,imported_contact_mobile.ilike.%${search}%,imported_contact_email.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const assignedProfileMap = await getProfilesByUserIds(
    readDb,
    (data || []).map((policy) => policy.assigned_to)
  );

  const policies = (data || []).map((policy) => ({
    ...policy,
    assigned_profile: assignedProfileMap.get(policy.assigned_to) || null,
    computed_payment_status: inferPaymentStatus(policy),
  }));

  const filteredPolicies = search
    ? policies.filter((policy) =>
        [
          policy.client?.full_name,
          policy.client?.mobile,
          policy.client?.email,
          policy.imported_client_name,
          policy.imported_contact_mobile,
          policy.imported_contact_email,
          policy.contact_mobile,
          policy.contact_email,
          policy.policy_number,
          policy.insurance_company,
          policy.policy_type,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search.toLowerCase()))
      )
    : policies;

  return NextResponse.json({
    policies: filteredPolicies,
    summary: buildInsuranceSummary(filteredPolicies),
  }, { status: 200 });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.client_id) return NextResponse.json({ error: "Client is required" }, { status: 400 });

  const allowed = await canWorkOnClient(supabase, user, role, body.client_id);
  if (!allowed) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_insurance_create",
      entityType: "client",
      entityId: body.client_id,
      request,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = {
    ...normalizePolicyPayload(body, user.id),
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from("insurance_policies")
    .insert(payload)
    .select("*, client:clients(id, full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
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
    .eq("id", payload.client_id);

  const adminIds = await getAdminUserIds(supabase);
  await notifyUsers(supabase, adminIds.filter((id) => id !== user.id), {
    title: "Insurance policy updated",
    message: `${data.client?.full_name || "Client"} insurance policy was added.`,
    type: "insurance_policy_created",
    entityType: "insurance_policy",
    entityId: data.id,
    linkUrl: `/admin/insurance?client_id=${payload.client_id}`,
    metadata: { client_id: payload.client_id },
  });

  if (payload.renewal_date) {
    await createNotification(supabase, {
      userId: user.id,
      title: "Insurance renewal tracked",
      message: `Renewal date set for ${formatDateDDMonYYYY(payload.renewal_date, payload.renewal_date)}.`,
      type: "insurance_renewal_tracked",
      entityType: "insurance_policy",
      entityId: data.id,
      linkUrl: `/admin/insurance?client_id=${payload.client_id}`,
      metadata: { renewal_date: payload.renewal_date },
    });
  }

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "insurance_policy_created",
    entityType: "insurance_policy",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ policy: data }, { status: 201 });
}
