/**
 * Task Management API Routes
 * Handles all task-related CRUD operations
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient, getValidTaskAssigneeIds } from "@/lib/tasks/assignees";
import { hydrateTaskList } from "@/lib/tasks/hydrate";

// ================================================================
// GET /api/tasks - List all tasks (filtered by role)
// ================================================================
export async function GET(request) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const assignedUser = searchParams.get("assigned_user");
  const search = searchParams.get("search");
  const clientId = searchParams.get("client_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = String(profile?.role || "").trim().toLowerCase();

  if (!["admin", "operations"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let assignedTaskIds = null;
  if (role === "operations") {
    const { data: assignments, error: assignmentError } = await taskDb
      .from("task_assignments")
      .select("task_id")
      .eq("user_id", user.id);

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 });
    }

    assignedTaskIds = (assignments || []).map((assignment) => assignment.task_id);
    if (assignedTaskIds.length === 0) {
      return NextResponse.json({ tasks: [] }, { status: 200 });
    }
  }

  if (assignedUser && assignedUser !== "all") {
    const { data: assignments, error: assignmentFilterError } = await taskDb
      .from("task_assignments")
      .select("task_id")
      .eq("user_id", assignedUser);

    if (assignmentFilterError) {
      return NextResponse.json({ error: assignmentFilterError.message }, { status: 500 });
    }

    const filterTaskIds = (assignments || []).map((assignment) => assignment.task_id);
    assignedTaskIds = assignedTaskIds
      ? assignedTaskIds.filter((taskId) => filterTaskIds.includes(taskId))
      : filterTaskIds;

    if (assignedTaskIds.length === 0) {
      return NextResponse.json({ tasks: [] }, { status: 200 });
    }
  }

  let query = taskDb
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && status !== "All") query = query.eq("status", status);
  if (priority && priority !== "All") query = query.eq("priority", priority);
  if (clientId) query = query.eq("client_id", clientId);
  if (dateFrom) query = query.gte("due_date", dateFrom);
  if (dateTo) query = query.lte("due_date", dateTo);
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  if (assignedTaskIds) query = query.in("id", assignedTaskIds);

  const { data: tasks, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hydratedTasks = await hydrateTaskList(taskDb, tasks || []);

  return NextResponse.json({ tasks: hydratedTasks }, { status: 200 });
}

// ================================================================
// POST /api/tasks - Create a new task
// ================================================================
export async function POST(request) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const currentRole = String(profile?.role || "").trim().toLowerCase();

  if (currentRole !== "admin") {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_task_create",
      entityType: "task",
      request,
    });
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const {
    title,
    description,
    category,
    priority,
    due_date,
    client_id,
    tags,
    assigned_to
  } = body;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  let validAssigneeIds = [];
  try {
    validAssigneeIds = await getValidTaskAssigneeIds(supabase, assigned_to);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const now = new Date();
  const taskNumber = `TSK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${randomUUID().slice(0, 8).toUpperCase()}`;

  const { data: task, error: taskError } = await taskDb
    .from("tasks")
    .insert({
      task_number: taskNumber,
      title,
      description,
      category: category || "Internal",
      priority: priority || "Medium",
      status: "Pending",
      due_date,
      client_id,
      tags,
      created_by: user.id
    })
    .select()
    .single();

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  if (validAssigneeIds.length > 0) {
    const assignments = validAssigneeIds.map(userId => ({
      task_id: task.id,
      user_id: userId,
      assigned_by: user.id
    }));
    const { error: assignmentError } = await taskDb.from("task_assignments").insert(assignments);
    if (assignmentError) {
      await taskDb.from("tasks").delete().eq("id", task.id);
      return NextResponse.json({ error: `Task assignment failed: ${assignmentError.message}` }, { status: 500 });
    }

    const notifications = validAssigneeIds.map(userId => ({
      user_id: userId,
      task_id: task.id,
      title: "New Task Assigned",
      message: `You have been assigned to task: ${title}`,
      notification_type: "task_assigned",
      entity_type: "task",
      entity_id: task.id,
      link_url: `/dashboard/tasks/${task.id}`,
      dedupe_key: `task_assigned:${task.id}:${userId}`,
    }));
    const { error: notificationError } = await taskDb.from("task_notifications").insert(notifications);
    if (notificationError && notificationError.code !== "23505") {
      return NextResponse.json({ error: `Task notification failed: ${notificationError.message}` }, { status: 500 });
    }
  }

  await taskDb.from("task_activity_logs").insert({
    task_id: task.id,
    action_type: "created",
    performed_by: user.id,
    metadata: { title, priority, category }
  });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "task_created",
    entityType: "task",
    entityId: task.id,
    newValue: task,
    metadata: { assigned_to: validAssigneeIds },
    request,
  });

  const [completeTask] = await hydrateTaskList(taskDb, [task]);

  return NextResponse.json({ task: completeTask || task }, { status: 201 });
}
