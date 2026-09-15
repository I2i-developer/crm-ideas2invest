import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, canAccessClient } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import {
  SELF_REMINDER_PRIORITIES,
  SELF_REMINDER_SELECT,
  SELF_REMINDER_STATUSES,
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

async function loadReminder(supabase, id) {
  const { data, error } = await supabase
    .from("client_meeting_reminders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function canManageReminder(reminder, user, role) {
  return isAdmin(role) || reminder.user_id === user.id || reminder.created_by === user.id;
}

export async function PATCH(request, context) {
  const { id } = await context.params;
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await loadReminder(supabase, id);
  if (!existing) return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  if (!canManageReminder(existing, user, role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const status = body.status && SELF_REMINDER_STATUSES.includes(body.status) ? body.status : existing.status;
  const updates = { updated_by: user.id };

  if (body.title !== undefined) updates.title = normalizeText(body.title);
  if (body.notes !== undefined) updates.notes = normalizeText(body.notes) || null;
  if (body.priority !== undefined) {
    updates.priority = SELF_REMINDER_PRIORITIES.includes(body.priority) ? body.priority : existing.priority;
  }
  if (body.reminder_at !== undefined) {
    const reminderAt = normalizeDateTime(body.reminder_at);
    if (!reminderAt) return NextResponse.json({ error: "Valid reminder date/time is required" }, { status: 400 });
    updates.reminder_at = reminderAt;
  }
  if (body.client_id !== undefined) {
    const clientId = body.client_id || null;
    if (clientId && !(await canAccessClient(supabase, user.id, role, clientId))) {
      return NextResponse.json({ error: "You cannot link this reminder to that client" }, { status: 403 });
    }
    updates.client_id = clientId;
  }

  updates.status = status;
  if (status === "Completed") updates.completed_at = new Date().toISOString();
  if (status === "Pending") {
    updates.completed_at = null;
    updates.snoozed_until = null;
  }
  if (status === "Cancelled") updates.snoozed_until = null;
  if (body.snoozed_until !== undefined) {
    const snoozedUntil = normalizeDateTime(body.snoozed_until);
    if (!snoozedUntil && status === "Snoozed") {
      return NextResponse.json({ error: "Valid snooze date/time is required" }, { status: 400 });
    }
    updates.snoozed_until = snoozedUntil || null;
  }
  if (body.snooze_minutes) {
    updates.status = "Snoozed";
    updates.snoozed_until = new Date(Date.now() + Number(body.snooze_minutes) * 60 * 1000).toISOString();
  }

  if (updates.title !== undefined && !updates.title) {
    return NextResponse.json({ error: "Reminder title is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_meeting_reminders")
    .update(updates)
    .eq("id", id)
    .select(SELF_REMINDER_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: updates.status === "Completed" ? "self_reminder_completed" : "self_reminder_updated",
    entityType: "client_meeting_reminder",
    entityId: id,
    oldValue: existing,
    newValue: updates,
    request,
  });

  return NextResponse.json({ reminder: data }, { status: 200 });
}

export async function DELETE(request, context) {
  const { id } = await context.params;
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await loadReminder(supabase, id);
  if (!existing) return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  if (!canManageReminder(existing, user, role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("client_meeting_reminders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "self_reminder_deleted",
    entityType: "client_meeting_reminder",
    entityId: id,
    oldValue: existing,
    request,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
