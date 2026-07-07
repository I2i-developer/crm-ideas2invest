import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAdminUserIds } from "@/lib/notifications/service";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { generateTaskDateNotifications } from "@/lib/tasks/alerts";
import { generateInsuranceRenewalNotifications } from "@/lib/insurance/alerts";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { buildInsuranceSummary, inferPaymentStatus } from "@/lib/insurance/renewals";
import { getTaskLifecycle, summarizeTasks } from "@/lib/tasks/performance";

export const dynamic = "force-dynamic";

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthStartKey(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

function currentWeekBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: dateKey(start),
    end: dateKey(end),
  };
}

function summarizeStatuses(tasks) {
  return tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});
}

function summarizeBy(items, key) {
  return (items || []).reduce((acc, item) => {
    const value = item[key] || "Not set";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

export async function GET(request) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await generateTaskDateNotifications(supabase, user.id);
  await generateInsuranceRenewalNotifications(supabase, user.id);

  const admin = isAdmin(role);
  const today = dateKey();
  const monthStart = monthStartKey();

  const renewalWindow = new Date();
  renewalWindow.setDate(renewalWindow.getDate() + 30);
  const renewalWindowKey = dateKey(renewalWindow);

  const [clientsRes, documentsRes, tasksRes, taskActivityRes, profilesRes, notificationsRes, riskRes, insuranceRes, sipRes, selfTasksRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, created_at, updated_at, operations_owner, relationship_manager, tax_status, holding_pattern")
      .order("updated_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, client_id, status, document_type, updated_at")
      .order("updated_at", { ascending: false }),
    taskDb
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false }),
    taskDb
      .from("task_activity_logs")
      .select("id, task_id, action_type, created_at"),
    taskDb.from("profiles").select("id, name, full_name, email, role, is_active, status"),
    taskDb
      .from("task_notifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("risk_profile_assessments")
      .select("id, client_id, status")
      .neq("status", "Approved"),
    taskDb
      .from("insurance_policies")
      .select("id, client_id, renewal_date, due_date, status, payment_status, through_company, premium_amount, next_follow_up_date, grace_period_end_date")
      .eq("status", "Active"),
    taskDb
      .from("sip_events")
      .select("id, client_id, assigned_to, event_type, follow_up_status, matched_status, termination_date, end_date, created_at")
      .order("created_at", { ascending: false }),
    taskDb
      .from("operation_self_tasks")
      .select("id, created_by, task_date, status, is_archived")
      .eq("is_archived", false),
  ]);

  const taskIds = (tasksRes.data || []).map((task) => task.id);
  const { data: taskAssignments = [], error: taskAssignmentsError } = taskIds.length
    ? await taskDb
        .from("task_assignments")
        .select("id, task_id, user_id")
        .in("task_id", taskIds)
    : { data: [], error: null };

  if (taskAssignmentsError) {
    return NextResponse.json({ error: taskAssignmentsError.message }, { status: 500 });
  }

  const assignmentsByTask = new Map();
  for (const assignment of taskAssignments || []) {
    const existing = assignmentsByTask.get(assignment.task_id) || [];
    existing.push(assignment);
    assignmentsByTask.set(assignment.task_id, existing);
  }

  const allTasks = (tasksRes.data || []).map((task) => ({
    ...getTaskLifecycle(task, taskActivityRes.data || []),
    task_assignments: assignmentsByTask.get(task.id) || [],
  }));
  const visibleTasks = admin
    ? allTasks
    : allTasks.filter((task) =>
        task.task_assignments?.some((assignment) => assignment.user_id === user.id)
      );

  const visibleClientIds = new Set((clientsRes.data || []).map((client) => client.id));
  const visibleDocuments = (documentsRes.data || []).filter((document) => visibleClientIds.has(document.client_id));
  const documentsRequiringAction = visibleDocuments.filter((document) =>
    ["Uploaded", "Parsed", "Under review", "Rejected"].includes(document.status)
  );
  const visibleRiskAssessments = (riskRes.data || []).filter((assessment) => visibleClientIds.has(assessment.client_id));
  const visibleInsurancePolicies = (insuranceRes.data || []).filter((policy) => !policy.client_id || visibleClientIds.has(policy.client_id));
  const visibleInsuranceSummary = buildInsuranceSummary(visibleInsurancePolicies);
  const visibleInsuranceFollowUps = visibleInsurancePolicies.filter((policy) => {
    const status = inferPaymentStatus(policy);
    const dueDate = policy.due_date || policy.renewal_date;
    return status !== "Paid" && status !== "Lapsed" && dueDate && dueDate <= renewalWindowKey;
  });
  const allSipEvents = sipRes.error ? [] : (sipRes.data || []);
  const visibleSipEvents = admin
    ? allSipEvents
    : allSipEvents.filter((event) => event.assigned_to === user.id || event.client_id);
  const week = currentWeekBounds();
  const isSipTerminatedInCurrentWeek = (event) =>
    Boolean(event.termination_date) &&
    event.termination_date >= week.start &&
    event.termination_date <= week.end;
  const sipTerminatedThisWeek = visibleSipEvents.filter(
    (event) => event.event_type === "terminated" && isSipTerminatedInCurrentWeek(event)
  );
  const sipPausedThisWeek = visibleSipEvents.filter(
    (event) => event.event_type === "paused" && isSipTerminatedInCurrentWeek(event)
  );
  const sipRejectedThisWeek = visibleSipEvents.filter(
    (event) => event.event_type === "rejected" && isSipTerminatedInCurrentWeek(event)
  );
  const sipPendingFollowUps = visibleSipEvents.filter((event) => event.follow_up_status === "pending");
  const sipUnmatchedRecords = allSipEvents.filter((event) => event.matched_status === "unmatched");
  const sipTerminatedTotal = allSipEvents.filter((event) => event.event_type === "terminated");
  const sipRejectedTotal = allSipEvents.filter((event) => event.event_type === "rejected");
  const sipPausedTotal = allSipEvents.filter((event) => event.event_type === "paused");

  const pendingTasks = visibleTasks.filter((task) => !task.completed && !task.cancelled);
  const overdueTasks = pendingTasks.filter((task) => task.due_date && task.due_date < today);
  const dueTodayTasks = pendingTasks.filter((task) => task.due_date === today);
  const recentlyAssignedTasks = visibleTasks.slice(0, 5);
  const visibleSelfTasks = admin
    ? (selfTasksRes.data || [])
    : (selfTasksRes.data || []).filter((task) => task.created_by === user.id);
  const selfTasksThisWeek = visibleSelfTasks.filter((task) => task.task_date >= week.start && task.task_date <= week.end);

  const operationsUsers = (profilesRes.data || []).filter((profile) => {
    const profileRole = String(profile.role || "").trim().toLowerCase();
    const profileStatus = String(profile.status || "Active").trim().toLowerCase();
    return profileRole === "operations" && profile.is_active !== false && profileStatus !== "inactive";
  });

  const operationsSummary = operationsUsers.map((profile) => {
    const assignedTasks = allTasks.filter((task) =>
      task.task_assignments?.some((assignment) => assignment.user_id === profile.id)
    );

    const taskSummary = summarizeTasks(assignedTasks);
    return {
      id: profile.id,
      name: profile.name || profile.full_name || profile.email || "Operations User",
      assigned: taskSummary.assigned,
      pending: taskSummary.current_workload,
      completed: taskSummary.completed,
      overdue: taskSummary.overdue,
      completion_rate: taskSummary.completion_rate,
    };
  });

  const birthdayResponse = await fetch(new URL("/api/birthdays?range=upcoming&days=14", request.url), {
    headers: {
      authorization: request.headers.get("authorization") || "",
      cookie: request.headers.get("cookie") || "",
    },
  });
  const birthdayData = birthdayResponse.ok ? await birthdayResponse.json() : { today: [], upcoming: [] };
  const nearestUpcomingDays = birthdayData.upcoming?.[0]?.days_until;
  const nearestUpcomingBirthdays =
    nearestUpcomingDays === undefined
      ? []
      : (birthdayData.upcoming || []).filter((birthday) => birthday.days_until === nearestUpcomingDays);

  const adminIds = admin ? await getAdminUserIds(supabase) : [];

  return NextResponse.json({
    role,
    current_user: {
      id: user.id,
      name: profile?.name || profile?.full_name || user.user_metadata?.full_name || user.email || "CRM User",
      email: profile?.email || user.email || "",
      role,
    },
    admin_ids: adminIds,
    metrics: {
      total_clients: clientsRes.data?.length || 0,
      new_clients_this_month: (clientsRes.data || []).filter((client) => client.created_at >= monthStart).length,
      pending_document_verification: documentsRequiringAction.length,
      pending_tasks: pendingTasks.length,
      overdue_tasks: overdueTasks.length,
      due_today_tasks: dueTodayTasks.length,
      unread_notifications: notificationsRes.data?.length || 0,
      risk_profiling_pending: visibleRiskAssessments.length,
      insurance_follow_up: visibleInsuranceFollowUps.length,
      insurance_due_next_30: visibleInsuranceSummary.due_next_30_days || 0,
      insurance_pending_renewals: visibleInsurancePolicies.filter((policy) =>
        ["Pending", "Grace Period", "Overdue"].includes(inferPaymentStatus(policy))
      ).length,
      insurance_pending_followups: visibleInsuranceSummary.pending_followups || 0,
      insurance_amount_due: visibleInsuranceSummary.renewal_amount_due || 0,
      sip_terminated_this_week: sipTerminatedThisWeek.length,
      sip_paused_this_week: sipPausedThisWeek.length,
      sip_rejected_this_week: sipRejectedThisWeek.length,
      sip_terminated_total: sipTerminatedTotal.length,
      sip_paused_total: sipPausedTotal.length,
      sip_rejected_total: sipRejectedTotal.length,
      sip_pending_followups: sipPendingFollowUps.length,
      sip_resolved_total: visibleSipEvents.filter((event) => event.follow_up_status === "resolved").length,
      sip_unmatched_records: admin ? sipUnmatchedRecords.length : 0,
      my_sip_followups_pending: sipPendingFollowUps.filter((event) => event.assigned_to === user.id).length,
      self_tasks_pending: visibleSelfTasks.filter((task) => task.status !== "Done" && task.status !== "Cancelled").length,
      self_tasks_done_today: visibleSelfTasks.filter((task) => task.status === "Done" && task.task_date === today).length,
      self_tasks_this_week: selfTasksThisWeek.length,
    },
    tasks_by_status: summarizeStatuses(visibleTasks),
    self_tasks_by_status: summarizeStatuses(visibleSelfTasks),
    documents_by_status: summarizeBy(visibleDocuments, "status"),
    clients_by_tax_status: summarizeBy(clientsRes.data || [], "tax_status"),
    clients_by_holding_pattern: summarizeBy(clientsRes.data || [], "holding_pattern"),
    risk_by_status: summarizeBy(visibleRiskAssessments, "status"),
    insurance_by_status: summarizeBy(visibleInsurancePolicies, "status"),
    insurance_by_payment_status: visibleInsurancePolicies.reduce((acc, policy) => {
      const status = inferPaymentStatus(policy);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}),
    sip_by_event_type: summarizeBy(allSipEvents, "event_type"),
    sip_by_follow_up_status: summarizeBy(allSipEvents, "follow_up_status"),
    operations_summary: admin ? operationsSummary : [],
    recent_clients: (clientsRes.data || []).slice(0, 6),
    recent_tasks: recentlyAssignedTasks,
    overdue_tasks: overdueTasks.slice(0, 6),
    due_today_tasks: dueTodayTasks.slice(0, 6),
    documents_requiring_action: documentsRequiringAction.slice(0, 8),
    notifications: notificationsRes.data || [],
    birthdays: {
      ...birthdayData,
      upcoming: nearestUpcomingBirthdays,
    },
    risk_profiles_pending: visibleRiskAssessments.slice(0, 6),
    insurance_followups: visibleInsuranceFollowUps.slice(0, 6),
    sip_events: visibleSipEvents.slice(0, 6),
  }, { status: 200 });
}
