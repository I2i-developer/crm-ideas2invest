import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { createInsuranceFollowupTask } from "@/lib/insurance/renewals";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { id } = await params;
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_insurance_task_create",
      entityType: "insurance_policy",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Only admin can create insurance follow-up tasks" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { data: policy, error } = await db
    .from("insurance_policies")
    .select("*, client:clients(id, full_name)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!policy) return NextResponse.json({ error: "Insurance policy not found" }, { status: 404 });
  const dueDate = policy.due_date || policy.renewal_date;
  const alertType = dueDate && dueDate < new Date().toISOString().slice(0, 10)
    ? "overdue_followup"
    : "upcoming_30_day";

  const alert = await createInsuranceFollowupTask({
    supabase: db,
    policy,
    actor: user,
    assigneeId: body.assigned_to || policy.assigned_to || user.id,
    alertType,
  });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "insurance_followup_task_created",
    entityType: "insurance_policy",
    entityId: id,
    newValue: alert,
    request,
  });

  return NextResponse.json({ alert }, { status: 201 });
}
