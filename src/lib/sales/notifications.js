import { createNotification } from "@/lib/notifications/service";

export async function dispatchSalesReminders(db, userId = null) {
  let q = db.from("sales_followups").select("id,lead_id,user_id,title,due_at,kind,lead:sales_leads!inner(assigned_user_ids,archived_at)")
    .eq("status", "Pending").is("lead.archived_at", null).is("notified_at", null).lte("due_at", new Date().toISOString()).order("due_at").limit(200);
  if (userId) q = q.contains("lead.assigned_user_ids", [userId]);
  const { data, error } = await q;
  if (error) throw error;
  let sent = 0;
  for (const item of data || []) {
    const recipients = [...new Set(item.lead?.assigned_user_ids || [item.user_id])];
    if (!recipients.length) continue;
    const { data: profiles, error: profileError } = await db.from("profiles").select("id,role,is_active,status").in("id", recipients);
    if (profileError) throw profileError;
    const active = (profiles || []).filter((p) => ["sales", "admin"].includes(p.role) && p.is_active !== false && String(p.status).toLowerCase() !== "inactive");
    let deliveredAll = active.length > 0;
    for (const profile of active) {
      // Keep legacy keys for the coordinator to avoid resending existing reminders.
      const dedupeKey = `sales:${item.id}:${item.due_at}${profile.id === item.user_id ? "" : `:${profile.id}`}`;
      let delivered = await createNotification(db, {
        userId: profile.id, title: item.kind === "meeting" ? "Sales meeting reminder" : "Sales follow-up due",
        message: item.title, type: "sales_followup_due", entityType: "sales_lead", entityId: item.lead_id,
        linkUrl: `/sales?lead=${item.lead_id}`, dedupeKey,
      });
      if (!delivered) {
        const result = await db.from("task_notifications").select("id").eq("dedupe_key", dedupeKey).eq("user_id", profile.id).maybeSingle();
        if (result.error) throw result.error;
        delivered = result.data;
      }
      deliveredAll = deliveredAll && Boolean(delivered);
    }
    if (deliveredAll) {
      const { error: updateError } = await db.from("sales_followups").update({ notified_at: new Date().toISOString() }).eq("id", item.id).eq("status", "Pending").eq("due_at", item.due_at);
      if (updateError) throw updateError;
      sent++;
    }
  }
  return { scanned: (data || []).length, sent };
}
