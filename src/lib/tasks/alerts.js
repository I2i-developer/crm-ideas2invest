import { createNotification } from "@/lib/notifications/service";

function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function generateTaskDateNotifications(supabase, userId = null) {
  const today = toDateKey();

  let query = supabase
    .from("tasks")
    .select("id, title, task_number, due_date, status, task_assignments(user_id)")
    .neq("status", "Completed")
    .not("due_date", "is", null)
    .lte("due_date", today);

  if (userId) {
    query = query.eq("task_assignments.user_id", userId);
  }

  const { data: tasks } = await query;

  for (const task of tasks || []) {
    const notificationType = task.due_date < today ? "task_overdue" : "task_due_today";
    const title = task.due_date < today ? "Task overdue" : "Task due today";

    for (const assignment of task.task_assignments || []) {
      await createNotification(supabase, {
        userId: assignment.user_id,
        taskId: task.id,
        title,
        message: `${task.task_number || "Task"}: ${task.title}`,
        type: notificationType,
        entityType: "task",
        entityId: task.id,
        linkUrl: `/dashboard/tasks/${task.id}`,
        metadata: { due_date: task.due_date, status: task.status },
        dedupeKey: `${notificationType}:${task.id}:${today}`,
      });
    }
  }
}
