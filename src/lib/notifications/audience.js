export const SALES_NOTIFICATION_TYPES = [
  "sales_followup_due", "sales_meeting_reminder", "sales_meeting_scheduled",
  "task_assigned", "task_due_today", "task_overdue", "task_status_changed", "task_comment_added",
  "chat_message", "self_reminder_due", "meeting_reminder", "eod_reviewed", "eod_review_reply",
  "web_push_test",
];

export const SALES_NOTIFICATION_FILTER = `notification_type.in.(${SALES_NOTIFICATION_TYPES.join(",")}),and(notification_type.is.null,task_id.not.is.null),and(notification_type.eq.system,task_id.not.is.null)`;

export function canReceiveNotification(role, notification) {
  if (role !== "sales") return true;
  const type = notification.notification_type || "";
  return SALES_NOTIFICATION_TYPES.includes(type) || ((!type || type === "system") && Boolean(notification.task_id));
}

// Also protects sends to accounts whose role changed after a notification was created.
export async function canDeliverNotification(db, notification) {
  if (canReceiveNotification("sales", notification)) return true;
  const { data: recipient, error } = await db.from("profiles").select("role").eq("id", notification.user_id).maybeSingle();
  if (error) throw error;
  return Boolean(recipient) && canReceiveNotification(recipient.role, notification);
}
