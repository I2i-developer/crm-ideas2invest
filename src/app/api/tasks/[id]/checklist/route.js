/**
 * Task Checklist API
 * POST, PUT, DELETE /api/tasks/[id]/checklist
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

async function authorizeTaskAccess(supabase, taskId, userId) {
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id")
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
  const { item_text, is_completed } = body;

  if (!item_text || !item_text.trim()) {
    return NextResponse.json({ error: "Item text is required" }, { status: 400 });
  }

  const access = await authorizeTaskAccess(supabase, id, user.id);
  if (access.response) {
    return access.response;
  }

  const { data: item, error } = await supabase
    .from("task_checklist")
    .insert({
      task_id: id,
      item_text: item_text.trim(),
      is_completed: is_completed || false,
      created_by: user.id
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("task_activity_logs").insert({
    task_id: id,
    action_type: "checklist_item_added",
    performed_by: user.id,
    metadata: { item_id: item.id, text: item_text.trim() }
  });

  return NextResponse.json({ item }, { status: 201 });
}

export async function PUT(request, { params }) {
  const supabase = await createClient(request);
  const { id } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { item_id, is_completed } = body;

  if (!item_id) {
    return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
  }

  const access = await authorizeTaskAccess(supabase, id, user.id);
  if (access.response) {
    return access.response;
  }

  const { error } = await supabase
    .from("task_checklist")
    .update({ is_completed })
    .eq("id", item_id)
    .eq("task_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("task_activity_logs").insert({
    task_id: id,
    action_type: is_completed ? "checklist_item_completed" : "checklist_item_uncompleted",
    performed_by: user.id,
    metadata: { item_id }
  });

  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const { id } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const item_id = searchParams.get("item_id");

  if (!item_id) {
    return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
  }

  const access = await authorizeTaskAccess(supabase, id, user.id);
  if (access.response) {
    return access.response;
  }

  const { error } = await supabase
    .from("task_checklist")
    .delete()
    .eq("id", item_id)
    .eq("task_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
