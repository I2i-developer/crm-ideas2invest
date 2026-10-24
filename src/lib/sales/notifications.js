import { createNotification } from "@/lib/notifications/service";

export async function dispatchSalesReminders(db, userId = null) {
  let q = db.from("sales_followups").select("id,lead_id,user_id,title,due_at,kind")
    .eq("status", "Pending").is("notified_at", null).lte("due_at", new Date().toISOString()).order("due_at").limit(200);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  let sent = 0;
  for (const item of data || []) {
    const { data: profile } = await db.from("profiles").select("role,is_active,status").eq("id", item.user_id).maybeSingle();
    if (!profile || !["sales", "admin"].includes(profile.role) || profile.is_active === false || profile.status === "Inactive") continue;
    const dedupeKey = `sales:${item.id}:${item.due_at}`;
    const notification = await createNotification(db, {
      userId: item.user_id, title: item.kind === "meeting" ? "Sales meeting reminder" : "Sales follow-up due",
      message: item.title, type: "sales_followup_due", entityType: "sales_lead", entityId: item.lead_id,
      linkUrl: `/sales?lead=${item.lead_id}`, dedupeKey,
    });
    let delivered = notification;
    if (!delivered) {
      const result = await db.from("task_notifications").select("id").eq("dedupe_key", dedupeKey).eq("user_id", item.user_id).maybeSingle();
      delivered = result.data;
    }
    if (delivered) {
      const { error: updateError } = await db.from("sales_followups").update({ notified_at: new Date().toISOString() }).eq("id", item.id).eq("status", "Pending").eq("due_at", item.due_at);
      if (updateError) throw updateError;
      sent++;
    }
  }
  return { scanned: (data || []).length, sent };
}
