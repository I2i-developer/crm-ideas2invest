import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

export const dynamic = "force-dynamic";

export async function PATCH(request, context) {
  const { id } = await context.params;
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: reminder } = await supabase
    .from("client_meeting_reminders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!reminder) return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  if (!isAdmin(role) && reminder.user_id !== user.id && reminder.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const status = body.status || reminder.status;
  const payload = {
    title: body.title !== undefined ? String(body.title || "").trim() : reminder.title,
    reminder_at: body.reminder_at || reminder.reminder_at,
    priority: body.priority || reminder.priority,
    notes: body.notes !== undefined ? String(body.notes || "").trim() || null : reminder.notes,
    status,
    completed_at: status === "Completed" ? new Date().toISOString() : reminder.completed_at,
    snoozed_until: body.snoozed_until || reminder.snoozed_until,
    updated_by: user.id,
  };

  if (!payload.title) return NextResponse.json({ error: "Reminder title is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("client_meeting_reminders")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: status === "Completed" ? "meeting_reminder_completed" : "meeting_reminder_updated",
    entityType: "client_meeting_reminder",
    entityId: id,
    newValue: data,
    request,
  });

  return NextResponse.json({ reminder: data }, { status: 200 });
}
