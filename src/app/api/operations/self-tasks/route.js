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
    .map((item) => {
      if (typeof item === "string") return { id: null, name: item.trim() };
      return {
        id: item?.id || null,
        name: String(item?.name || item?.label || "").trim(),
      };
    })
    .filter((item) => item.name);
}

function payloadFromBody(body, userId, existing = {}) {
  const status = STATUSES.includes(body.status) ? body.status : existing.status || "Pending";
  const taskDate = body.task_date || existing.task_date || new Date().toISOString().slice(0, 10);
  return {
    client_id: body.client_id || existing.client_id || null,
    client_name: String(body.client_name ?? existing.client_name ?? "").trim() || null,
    task_date: taskDate,
    task_description: String(body.task_description ?? existing.task_description ?? "").trim(),
    remark: String(body.remark ?? existing.remark ?? "").trim() || null,
    done_by: normalizeDoneBy(body.done_by ?? existing.done_by ?? []),
    status,
    priority: PRIORITIES.includes(body.priority) ? body.priority : existing.priority || "Medium",
    completed_at: status === "Done" ? (existing.completed_at || new Date().toISOString()) : null,
    updated_by: userId,
  };
}

async function listProfiles(db) {
  const { data } = await db
    .from("profiles")
    .select("id, name, full_name, email, role, is_active, status")
    .in("role", ["admin", "operations"])
    .order("name", { ascending: true, nullsFirst: false });

  return (data || [])
    .filter((profile) => profile.is_active !== false && String(profile.status || "Active").toLowerCase() !== "inactive")
    .map((profile) => ({
      id: profile.id,
      name: profile.name || profile.full_name || profile.email || "CRM User",
      role: profile.role,
    }));
}

export async function GET(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  let query = db
    .from("operation_self_tasks")
    .select("*")
    .eq("is_archived", false)
    .order("task_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!isAdmin(role)) query = query.eq("created_by", user.id);
  if (searchParams.get("status")) query = query.eq("status", searchParams.get("status"));
  if (searchParams.get("date_from")) query = query.gte("task_date", searchParams.get("date_from"));
  if (searchParams.get("date_to")) query = query.lte("task_date", searchParams.get("date_to"));
  if (searchParams.get("client_name")) query = query.ilike("client_name", `%${searchParams.get("client_name")}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const search = searchParams.get("search")?.toLowerCase();
  const doneBy = searchParams.get("done_by")?.toLowerCase();
  const tasks = (data || []).filter((task) => {
    const doneByNames = (task.done_by || []).map((item) => item.name || "").join(" ");
    const matchesSearch = !search || [task.client_name, task.task_description, task.remark, doneByNames]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
    const matchesDoneBy = !doneBy || doneByNames.toLowerCase().includes(doneBy);
    return matchesSearch && matchesDoneBy;
  });

  return NextResponse.json({ tasks, users: await listProfiles(db), role });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperations(role)) return NextResponse.json({ error: "Only operations users can create self task records" }, { status: 403 });

  const body = await request.json();
  const payload = {
    ...payloadFromBody(body, user.id),
    created_by: user.id,
  };

  if (!payload.task_description) {
    return NextResponse.json({ error: "Task/work description is required" }, { status: 400 });
  }

  const { data, error } = await db.from("operation_self_tasks").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "operation_self_task_created",
    entityType: "operation_self_task",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ task: data }, { status: 201 });
}
