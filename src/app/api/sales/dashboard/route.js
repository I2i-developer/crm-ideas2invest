import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { istDate } from "@/lib/sales/rules";

export const dynamic = "force-dynamic";

async function rows(query) {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().order("id").range(offset, offset + 499);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < 500) return all;
  }
}

function statuses(records) {
  return records.reduce((map, row) => ({ ...map, [row.status]: (map[row.status] || 0) + 1 }), {});
}

export async function GET(request) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  try {
    // Scope every service-client query to the authenticated user, including admins.
    const uid = ctx.user.id, now = new Date().toISOString(), today = istDate();
    const [assignments, leads, followups, meetings, reminders, daily, history] = await Promise.all([
      rows(() => ctx.db.from("task_assignments").select("id,task_id").eq("user_id", uid)),
      rows(() => ctx.db.from("sales_leads").select("id,name,status,source_id,updated_at").contains("assigned_user_ids", [uid]).is("archived_at", null)),
      rows(() => ctx.db.from("sales_followups").select("id,lead_id,title,due_at,lead:sales_leads!inner(name,source_id,assigned_to,assigned_user_ids,archived_at)").contains("lead.assigned_user_ids", [uid]).eq("status", "Pending").is("lead.archived_at", null)),
      rows(() => ctx.db.from("sales_meetings").select("id,lead_id,starts_at,lead:sales_leads!inner(name,source_id,assigned_to,assigned_user_ids,archived_at)").contains("lead.assigned_user_ids", [uid]).eq("status", "Scheduled").gte("ends_at", now).is("lead.archived_at", null)),
      rows(() => ctx.db.from("client_meeting_reminders").select("id,title,status,reminder_at,snoozed_until").eq("user_id", uid).in("status", ["Pending", "Snoozed"])),
      ctx.supabase.rpc("sales_daily_eod", { p_date: today, p_user: uid }),
      ctx.db.from("operation_eod_reports").select("id", { count: "exact", head: true }).eq("created_by", uid).is("operation_hidden_at", null),
    ]);
    if (daily.error) throw daily.error;
    if (history.error) throw history.error;
    const ids = [...new Set(assignments.map((row) => row.task_id))];
    const tasks = [];
    for (let i = 0; i < ids.length; i += 100) tasks.push(...await rows(() => ctx.db.from("tasks").select("id,title,status,due_date,created_at").in("id", ids.slice(i, i + 100))));
    const pending = tasks.filter((task) => !["completed", "cancelled", "canceled"].includes(String(task.status).toLowerCase()));
    const dueKey = (task) => !task.due_date ? "" : /^\d{4}-\d{2}-\d{2}$/.test(task.due_date) ? task.due_date : istDate(new Date(task.due_date));
    const dueAt = (reminder) => reminder.status === "Snoozed" ? reminder.snoozed_until || reminder.reminder_at : reminder.reminder_at;
    return salesJson({
      current_user: { id: uid, name: ctx.profile.name || ctx.profile.full_name || ctx.user.email },
      metrics: {
        assigned_tasks: tasks.length, pending_tasks: pending.length,
        overdue_tasks: pending.filter((task) => dueKey(task) && dueKey(task) < today).length,
        due_today_tasks: pending.filter((task) => dueKey(task) === today).length,
        my_leads: leads.length, pending_followups: followups.length,
        overdue_followups: followups.filter((row) => row.due_at <= now).length,
        upcoming_meetings: meetings.length, self_reminders: reminders.length,
        calls_today: Number(daily.data?.[0]?.dialed || 0), historical_eod_reports: history.count || 0,
      },
      tasks_by_status: statuses(tasks), leads_by_status: statuses(leads),
      recent_tasks: tasks.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
      followups: followups.sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 6),
      meetings: meetings.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 6),
      reminders: reminders.sort((a, b) => dueAt(a).localeCompare(dueAt(b))).slice(0, 6),
    });
  } catch (error) { return salesError(error); }
}
