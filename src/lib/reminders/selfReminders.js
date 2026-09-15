import { createNotification } from "@/lib/notifications/service";

export const SELF_REMINDER_SELECT = `
  *,
  client:clients(id, full_name, email, mobile),
  meeting:client_meetings(id, title)
`;

export const SELF_REMINDER_STATUSES = ["Pending", "Completed", "Snoozed", "Cancelled"];
export const SELF_REMINDER_PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export function effectiveReminderAt(reminder) {
  if (reminder?.status === "Snoozed" && reminder.snoozed_until) return reminder.snoozed_until;
  return reminder?.reminder_at;
}

export function reminderLink(reminder) {
  if (reminder?.meeting_id) return `/admin/meeting-notes?meeting_id=${reminder.meeting_id}`;
  return "/admin/reminders";
}

export async function generateDueSelfReminderNotifications(supabase, userId) {
  if (!userId) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("notifications")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.notifications?.self_reminders === false) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const { data: reminders, error } = await supabase
    .from("client_meeting_reminders")
    .select("id, title, reminder_at, priority, client_id, meeting_id, status, snoozed_until, last_notification_at")
    .eq("user_id", userId)
    .in("status", ["Pending", "Snoozed"])
    .limit(200);

  if (error) {
    console.error("Self reminder notification scan failed:", error.message || error);
    return;
  }

  for (const reminder of reminders || []) {
    const dueAt = effectiveReminderAt(reminder);
    if (!dueAt || dueAt > nowIso) continue;
    if (reminder.last_notification_at && reminder.last_notification_at >= oneHourAgo) continue;

    await createNotification(supabase, {
      userId,
      title: "Self reminder due",
      message: reminder.title,
      type: "self_reminder_due",
      entityType: "client_meeting_reminder",
      entityId: reminder.id,
      linkUrl: reminderLink(reminder),
      metadata: { ...reminder, effective_reminder_at: dueAt },
      dedupeKey: `self_reminder_due:${reminder.id}:${nowIso.slice(0, 13)}`,
    });

    await supabase
      .from("client_meeting_reminders")
      .update({ last_notification_at: nowIso })
      .eq("id", reminder.id);
  }
}
