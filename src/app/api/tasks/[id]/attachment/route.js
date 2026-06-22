/**
 * Task Attachments API
 * POST /api/tasks/[id]/attachment
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

async function authorizeTaskAccess(supabase, taskId, userId) {
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError) {
    return { response: NextResponse.json({ error: taskError.message }, { status: 500 }) };
  }

  if (!task) {
    return { response: NextResponse.json({ error: "Task not found" }, { status: 404 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const role = String(profile?.role || "").trim().toLowerCase();
  if (role === "admin") {
    return { task };
  }

  if (role === "operations") {
    const { data: assignment, error: assignmentError } = await supabase
      .from("task_assignments")
      .select("id")
      .eq("task_id", taskId)
      .eq("user_id", userId)
      .maybeSingle();

    if (assignmentError) {
      return { response: NextResponse.json({ error: assignmentError.message }, { status: 500 }) };
    }

    if (assignment) {
      return { task };
    }
  }

  return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const { id } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { file_url, file_name, file_type, file_size } = body;

  if (!file_url) {
    return NextResponse.json({ error: "File URL is required" }, { status: 400 });
  }

  const access = await authorizeTaskAccess(supabase, id, user.id);
  if (access.response) {
    return access.response;
  }

  const { data: attachment, error } = await supabase
    .from("task_attachments")
    .insert({
      task_id: id,
      file_url,
      file_name: file_name || "Untitled",
      file_type,
      file_size,
      uploaded_by: user.id
    })
    .select(`
      id,
      file_url,
      file_name,
      file_type,
      file_size,
      uploaded_at,
      uploader:profiles!task_attachments_uploaded_by_fkey(name)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("task_activity_logs").insert({
    task_id: id,
    action_type: "attachment_added",
    performed_by: user.id,
    metadata: { file_name, attachment_id: attachment.id }
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
