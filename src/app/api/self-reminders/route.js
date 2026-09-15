import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations, canAccessClient } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import {
  SELF_REMINDER_PRIORITIES,
  SELF_REMINDER_SELECT,
  SELF_REMINDER_STATUSES,
  effectiveReminderAt,
  generateDueSelfReminderNotifications,
} from "@/lib/reminders/selfReminders";

export const dynamic = "force-dynamic";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function buildSummary(reminders) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  return {
    total: reminders.length,
    pending: reminders.filter((item) => item.status === "Pending").length,
    snoozed: reminders.filter((item) => item.status === "Snoozed").length,
    completed: reminders.filter((item) => item.status === "Completed").length,
    due_now: reminders.filter((item) => {
      const dueAt = effectiveReminderAt(item);
      return ["Pending", "Snoozed"].includes(item.status) && dueAt && dueAt <= now.toISOString();
    }).length,
    due_today: reminders.filter((item) => {
      const dueAt = effectiveReminderAt(item);
      return ["Pending", "Snoozed"].includes(item.status) && dueAt?.slice(0, 10) === today;
    }).length,
  };
}

export async function GET(request) {
  const supabase = await createClient(request);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await generateDueSelfReminderNotifications(supabase, user.id);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "active";
  const search = normalizeText(searchParams.get("search"));
  const clientId = searchParams.get("client_id");
  const due = searchParams.get("due");
  const scope = searchParams.get("scope") || "mine";
  const limit = Math.min(Number(searchParams.get("limit") || 250), 500);

  let query = supabase
    .from("client_meeting_reminders")
    .select(SELF_REMINDER_SELECT)
    .order("reminder_at", { ascending: true })
    .limit(limit);

  if (!isAdmin(role) || scope !== "all") query = query.eq("user_id", user.id);
  if (clientId) query = query.eq("client_id", clientId);
  if (status === "active") query = query.in("status", ["Pending", "Snoozed"]);
  else if (status && status !== "all") query = query.eq("status", status);
  if (search) {
    const safe = search.replaceAll(",", " ");
    query = query.or(`title.ilike.%${safe}%,notes.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  let reminders = data || [];

  if (due === "now") {
    reminders = reminders.filter((item) => {
      const dueAt = effectiveReminderAt(item);
      return dueAt && dueAt <= nowIso;
    });
  } else if (due === "today") {
    reminders = reminders.filter((item) => effectiveReminderAt(item)?.slice(0, 10) === today);
  } else if (due === "upcoming") {
    reminders = reminders.filter((item) => {
      const dueAt = effectiveReminderAt(item);
      return dueAt && dueAt > nowIso;
    });
  }

  return NextResponse.json({ reminders, summary: buildSummary(reminders), role }, { status: 200 });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const title = normalizeText(body.title);
  const reminderAt = normalizeDateTime(body.reminder_at);
  const clientId = body.client_id || null;
  const priority = SELF_REMINDER_PRIORITIES.includes(body.priority) ? body.priority : "Medium";

  if (!title) return NextResponse.json({ error: "Reminder title is required" }, { status: 400 });
  if (!reminderAt) return NextResponse.json({ error: "Valid reminder date/time is required" }, { status: 400 });

  if (clientId && !(await canAccessClient(supabase, user.id, role, clientId))) {
    return NextResponse.json({ error: "You cannot link this reminder to that client" }, { status: 403 });
  }

  const payload = {
    meeting_id: body.meeting_id || null,
    client_id: clientId,
    user_id: user.id,
    title,
    reminder_at: reminderAt,
    priority,
    notes: normalizeText(body.notes) || null,
    status: SELF_REMINDER_STATUSES.includes(body.status) ? body.status : "Pending",
    created_by: user.id,
    updated_by: user.id,
  };

  const { data, error } = await supabase
    .from("client_meeting_reminders")
    .insert(payload)
    .select(SELF_REMINDER_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "self_reminder_created",
    entityType: "client_meeting_reminder",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ reminder: data }, { status: 201 });
}
