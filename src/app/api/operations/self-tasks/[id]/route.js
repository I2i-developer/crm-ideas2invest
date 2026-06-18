import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

const STATUSES = ["Pending", "In progress", "Done", "On hold", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High"];

function normalizeDoneBy(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: typeof item === "object" ? item?.id || null : null,
      name: String(typeof item === "object" ? item?.name || item?.label || "" : item || "").trim(),
    }))
    .filter((item) => item.name);
}

function updatePayload(body, userId, existing) {
  const status = STATUSES.includes(body.status) ? body.status : existing.status;
  return {
    client_id: body.client_id === undefined ? existing.client_id : body.client_id || null,
    client_name: body.client_name === undefined ? existing.client_name : String(body.client_name || "").trim() || null,
    task_date: body.task_date || existing.task_date,
    task_description: body.task_description === undefined ? existing.task_description : String(body.task_description || "").trim(),
    remark: body.remark === undefined ? existing.remark : String(body.remark || "").trim() || null,
    done_by: body.done_by === undefined ? existing.done_by || [] : normalizeDoneBy(body.done_by),
    status,
    priority: PRIORITIES.includes(body.priority) ? body.priority : existing.priority || "Medium",
    completed_at: status === "Done" ? (existing.completed_at || new Date().toISOString()) : null,
    updated_by: userId,
  };
}

function canMutateSelfTask(user, role, task) {
  return isAdmin(role) || (isOperations(role) && task.created_by === user.id);
}

export async function PUT(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);
  const { id } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing, error: existingError } = await db
    .from("operation_self_tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing || existing.is_archived) return NextResponse.json({ error: "Self task not found" }, { status: 404 });
  if (!canMutateSelfTask(user, role, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const payload = updatePayload(body, user.id, existing);
  if (!payload.task_description) {
    return NextResponse.json({ error: "Task/work description is required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("operation_self_tasks")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "operation_self_task_updated",
    entityType: "operation_self_task",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ task: data });
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);
  const { id } = await params;

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing, error: existingError } = await db
    .from("operation_self_tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing || existing.is_archived) return NextResponse.json({ error: "Self task not found" }, { status: 404 });
  if (!canMutateSelfTask(user, role, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await db
    .from("operation_self_tasks")
    .update({ is_archived: true, updated_by: user.id })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "operation_self_task_archived",
    entityType: "operation_self_task",
    entityId: id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ task: data });
}
