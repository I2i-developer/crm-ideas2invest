import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { buildPerformanceReport } from "@/lib/tasks/performance";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });

  const searchParams = new URL(request.url).searchParams;
  const filters = Object.fromEntries(
    ["user_id", "assigned_by", "status", "priority", "client_id", "date_from", "date_to", "due_from", "due_to", "completed_from", "completed_to"]
      .map((key) => [key, searchParams.get(key)])
      .filter(([, value]) => value)
  );

  const [tasksRes, assignmentsRes, activityRes, profilesRes, clientsRes, selfTasksRes] = await Promise.all([
    taskDb.from("tasks").select("*").order("created_at", { ascending: false }),
    taskDb.from("task_assignments").select("id, task_id, user_id, assigned_by, assigned_at"),
    taskDb.from("task_activity_logs").select("id, task_id, action_type, performed_by, metadata, created_at"),
    taskDb.from("profiles").select("id, name, full_name, email, designation, role, is_active, status"),
    taskDb.from("clients").select("id, full_name").order("full_name"),
    taskDb.from("operation_self_tasks").select("id, created_by, status, is_archived, task_date"),
  ]);

  const error = [tasksRes, assignmentsRes, activityRes, profilesRes, clientsRes, selfTasksRes].find((result) => result.error)?.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (profilesRes.data || []).filter((profile) => profile.is_active !== false && String(profile.status || "").toLowerCase() !== "inactive");
  const clients = clientsRes.data || [];
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const report = buildPerformanceReport({
    tasks: tasksRes.data || [],
    assignments: assignmentsRes.data || [],
    activities: activityRes.data || [],
    users,
    selfTasks: selfTasksRes.data || [],
    filters,
  });

  report.users = report.users.map((member) => ({
    ...member,
    tasks: member.tasks.map((task) => ({
      ...task,
      client: clientMap.get(task.client_id) || null,
    })),
  }));

  return NextResponse.json({
    ...report,
    options: {
      users: users.filter((profile) => String(profile.role || "").toLowerCase() === "operations"),
      assigners: users.filter((profile) => String(profile.role || "").toLowerCase() === "admin"),
      clients,
      statuses: [...new Set((tasksRes.data || []).map((task) => task.status).filter(Boolean))],
      priorities: [...new Set((tasksRes.data || []).map((task) => task.priority).filter(Boolean))],
    },
    filters,
  });
}
