/**
 * Task remarks API.
 * The database table/API path still use comments for compatibility.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);
  const { id } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { comment } = body;

  if (!comment || !comment.trim()) {
    return NextResponse.json({ error: "Remark cannot be empty" }, { status: 400 });
  }

  const { data: task, error: taskError } = await taskDb
    .from("tasks")
    .select("id, title, created_by")
    .eq("id", id)
    .maybeSingle();

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: assignments, error: assignmentsError } = await taskDb
    .from("task_assignments")
    .select("user_id")
    .eq("task_id", id);

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
  }

  const role = String(profile?.role || "").trim().toLowerCase();
  if (!["admin", "operations"].includes(role)) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_task_comment",
      entityType: "task",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: newComment, error } = await taskDb
    .from("task_comments")
    .insert({
      task_id: id,
      user_id: user.id,
      comment: comment.trim()
    })
    .select("id, comment, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: activityError } = await taskDb.from("task_activity_logs").insert({
    task_id: id,
    action_type: "comment_added",
    performed_by: user.id,
    metadata: {
      comment_id: newComment.id,
      remark: newComment.comment,
    }
  });

  if (activityError) {
    return NextResponse.json({ error: `Remark saved, but activity timeline could not be updated: ${activityError.message}` }, { status: 500 });
  }

  const recipients = [...new Set([task.created_by, ...(assignments || []).map((assignment) => assignment.user_id)])]
    .filter((recipientId) => recipientId && recipientId !== user.id);

  if (recipients.length > 0) {
    await taskDb.from("task_notifications").insert(
      recipients.map((recipientId) => ({
        user_id: recipientId,
        task_id: id,
        title: "New Task Remark",
        message: `New remark on task: ${task.title}`,
        notification_type: "task_comment_added",
        entity_type: "task",
        entity_id: id,
        link_url: `/dashboard/tasks/${id}`,
      }))
    );
  }

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "task_comment_added",
    entityType: "task",
    entityId: id,
    newValue: { comment_id: newComment.id },
    request,
  });

  return NextResponse.json({ comment: newComment }, { status: 201 });
}
