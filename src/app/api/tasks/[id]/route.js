/**
 * Task Detail API Route
 * GET, PUT, DELETE single task
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient, getValidTaskAssigneeIds } from "@/lib/tasks/assignees";
import { hydrateTaskDetail } from "@/lib/tasks/hydrate";

// ================================================================
// GET /api/tasks/[id]
// ================================================================
export async function GET(request, { params }) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);
  const { id } = await params;

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

  const { data: baseTask, error: baseTaskError } = await taskDb
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (baseTaskError) {
    return NextResponse.json({ error: baseTaskError.message }, { status: 500 });
  }

  if (!baseTask) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const task = await hydrateTaskDetail(taskDb, baseTask);

  return NextResponse.json({ task }, { status: 200 });
}

// ================================================================
// PUT /api/tasks/[id]
// ================================================================
export async function PUT(request, { params }) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);
  const { id } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: existingTask, error: existingTaskError } = await taskDb
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (existingTaskError) {
    return NextResponse.json({ error: existingTaskError.message }, { status: 500 });
  }

  if (!existingTask) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: currentAssignments, error: currentAssignmentsError } = await taskDb
    .from("task_assignments")
    .select("user_id")
    .eq("task_id", id);

  if (currentAssignmentsError) {
    return NextResponse.json({ error: currentAssignmentsError.message }, { status: 500 });
  }

  const existingTaskWithAssignments = {
    ...existingTask,
    task_assignments: currentAssignments || [],
  };

  const isAssigned = existingTaskWithAssignments.task_assignments?.some(a => a.user_id === user.id);
  const role = String(profile?.role || "").trim().toLowerCase();
  if (!["admin", "operations"].includes(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_task_update",
      entityType: "task",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    title,
    description,
    category,
    priority,
    status,
    due_date,
    client_id,
    tags,
    assigned_to
  } = body;

  const updates = {};
  const activityLog = { task_id: id, action_type: "updated", performed_by: user.id, metadata: {} };
  if (role === "operations" && !isAssigned) {
    activityLog.metadata.team_coverage = true;
  }

  if (role === "admin") {
    if (title !== undefined) { updates.title = title; activityLog.metadata.title = title; }
    if (description !== undefined) { updates.description = description; }
    if (category !== undefined) { updates.category = category; }
    if (priority !== undefined) { updates.priority = priority; activityLog.metadata.priority = priority; }
    if (due_date !== undefined) { updates.due_date = due_date; }
    if (client_id !== undefined) { updates.client_id = client_id; }
    if (tags !== undefined) { updates.tags = tags; }
  }

  if (status !== undefined) {
    updates.status = status;
    activityLog.action_type = `status_changed_to_${status}`;
    activityLog.metadata.status = status;
    if (status === "Completed") {
      updates.completed_at = existingTask.completed_at || new Date().toISOString();
      updates.completed_by = user.id;
    } else if (existingTask.status === "Completed") {
      updates.completed_at = null;
      updates.completed_by = null;
      updates.reopened_count = Number(existingTask.reopened_count || 0) + 1;
      activityLog.metadata.reopened_by = user.id;
    }

    if (existingTask.created_by !== user.id) {
      await taskDb.from("task_notifications").insert({
        user_id: existingTask.created_by,
        task_id: id,
        title: "Task Status Updated",
        message: `Task "${existingTask.title}" status changed to ${status}`,
        notification_type: "task_status_changed",
        entity_type: "task",
        entity_id: id,
        link_url: `/dashboard/tasks/${id}`,
      });
    }

    const assignedUserIds = existingTaskWithAssignments.task_assignments?.map((assignment) => assignment.user_id) || [];
    const statusNotifications = assignedUserIds
      .filter((userId) => userId !== user.id)
      .map((userId) => ({
        user_id: userId,
        task_id: id,
        title: "Task Status Updated",
        message: `Task "${existingTask.title}" status changed to ${status}`,
        notification_type: "task_status_changed",
        entity_type: "task",
        entity_id: id,
        link_url: `/dashboard/tasks/${id}`,
      }));

    if (statusNotifications.length > 0) {
      await taskDb.from("task_notifications").insert(statusNotifications);
    }
  }

  if (role === "admin" && assigned_to !== undefined) {
    let validAssigneeIds = [];
    try {
      validAssigneeIds = await getValidTaskAssigneeIds(supabase, assigned_to);
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const currentUserIds = existingTaskWithAssignments.task_assignments?.map(a => a.user_id) || [];
    const toAdd = validAssigneeIds.filter(uid => !currentUserIds.includes(uid));
    const toRemove = currentUserIds.filter(uid => !validAssigneeIds.includes(uid));

    if (toRemove.length > 0) {
      const { error: removeError } = await taskDb.from("task_assignments").delete().eq("task_id", id).in("user_id", toRemove);
      if (removeError) {
        return NextResponse.json({ error: `Task reassignment failed: ${removeError.message}` }, { status: 500 });
      }
    }
    if (toAdd.length > 0) {
      const newAssignments = toAdd.map(uid => ({ task_id: id, user_id: uid, assigned_by: user.id }));
      const { error: assignmentError } = await taskDb.from("task_assignments").insert(newAssignments);
      if (assignmentError) {
        return NextResponse.json({ error: `Task assignment failed: ${assignmentError.message}` }, { status: 500 });
      }

      const notifications = toAdd.map(uid => ({
        user_id: uid,
        task_id: id,
        title: "New Task Assigned",
        message: `You have been assigned to task: ${existingTask.title}`,
        notification_type: "task_assigned",
        entity_type: "task",
        entity_id: id,
        link_url: `/dashboard/tasks/${id}`,
        dedupe_key: `task_assigned:${id}:${uid}`,
      }));
      const { error: notificationError } = await taskDb.from("task_notifications").insert(notifications);
      if (notificationError && notificationError.code !== "23505") {
        return NextResponse.json({ error: `Task notification failed: ${notificationError.message}` }, { status: 500 });
      }
    }

    activityLog.action_type = "reassigned";
    activityLog.metadata.added_assignees = toAdd;
    activityLog.metadata.removed_assignees = toRemove;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await taskDb.from("tasks").update(updates).eq("id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  await taskDb.from("task_activity_logs").insert(activityLog);

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: activityLog.action_type || "task_updated",
    entityType: "task",
    entityId: id,
    oldValue: existingTaskWithAssignments,
    newValue: updates,
    metadata: activityLog.metadata,
    request,
  });

  const { data: updatedTask, error: updatedTaskError } = await taskDb
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (updatedTaskError) {
    return NextResponse.json({ error: updatedTaskError.message }, { status: 500 });
  }

  const task = await hydrateTaskDetail(taskDb, updatedTask || existingTask);

  return NextResponse.json({ task }, { status: 200 });
}

// ================================================================
// DELETE /api/tasks/[id]
// ================================================================
export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const { id } = await params;

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
  if (role !== "admin") {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_task_delete",
      entityType: "task",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  await supabase.from("task_activity_logs").insert({
    task_id: id,
    action_type: "deleted",
    performed_by: user.id,
    metadata: {}
  });

  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "task_deleted",
    entityType: "task",
    entityId: id,
    request,
  });

  return NextResponse.json({ message: "Task deleted successfully" }, { status: 200 });
}
