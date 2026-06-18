const PROFILE_SELECT = "id, name, full_name, email, avatar_url, designation, role";

function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

function normalizeProfile(profile) {
  if (!profile) return null;
  return {
    ...profile,
    name: profile.name || profile.full_name || profile.email || "Unknown",
  };
}

async function fetchRows(taskDb, table, select, column, values, order) {
  if (values && values.length === 0) return [];

  let query = taskDb.from(table).select(select);
  if (column && values) query = query.in(column, values);
  if (order) query = query.order(order.column, { ascending: order.ascending });

  const { data, error } = await query;
  if (error) {
    console.error(`Task hydration failed for ${table}:`, error);
    return [];
  }
  return data || [];
}

async function fetchProfiles(taskDb, ids) {
  const profileIds = uniqueIds(ids);
  if (profileIds.length === 0) return new Map();

  const rows = await fetchRows(taskDb, "profiles", PROFILE_SELECT, "id", profileIds);
  return new Map(rows.map((profile) => [profile.id, normalizeProfile(profile)]));
}

async function fetchClients(taskDb, ids) {
  const clientIds = uniqueIds(ids);
  if (clientIds.length === 0) return new Map();

  const rows = await fetchRows(taskDb, "clients", "id, full_name, email, mobile", "id", clientIds);
  return new Map(rows.map((client) => [client.id, client]));
}

export async function hydrateTaskList(taskDb, tasks) {
  if (!tasks || tasks.length === 0) return [];

  const taskIds = tasks.map((task) => task.id);
  const [assignments, checklist, clientMap] = await Promise.all([
    fetchRows(taskDb, "task_assignments", "id, task_id, user_id, assigned_by, assigned_at", "task_id", taskIds),
    fetchRows(taskDb, "task_checklist", "id, task_id, item_text, is_completed, created_by, created_at", "task_id", taskIds),
    fetchClients(taskDb, tasks.map((task) => task.client_id)),
  ]);

  const profileMap = await fetchProfiles(taskDb, [
    ...tasks.map((task) => task.created_by),
    ...assignments.map((assignment) => assignment.user_id),
    ...assignments.map((assignment) => assignment.assigned_by),
  ]);

  const assignmentsByTask = new Map();
  for (const assignment of assignments) {
    const enriched = {
      ...assignment,
      assignee: profileMap.get(assignment.user_id) || null,
    };
    const current = assignmentsByTask.get(assignment.task_id) || [];
    current.push(enriched);
    assignmentsByTask.set(assignment.task_id, current);
  }

  const checklistByTask = new Map();
  for (const item of checklist) {
    const current = checklistByTask.get(item.task_id) || [];
    current.push(item);
    checklistByTask.set(item.task_id, current);
  }

  return tasks.map((task) => ({
    ...task,
    created_by: profileMap.get(task.created_by) || null,
    client: task.client_id ? clientMap.get(task.client_id) || null : null,
    task_assignments: assignmentsByTask.get(task.id) || [],
    task_checklist: checklistByTask.get(task.id) || [],
  }));
}

export async function hydrateTaskDetail(taskDb, task) {
  if (!task) return null;

  const taskIds = [task.id];
  const [assignments, checklist, comments, attachments, activityLogs, clientMap] = await Promise.all([
    fetchRows(taskDb, "task_assignments", "id, task_id, user_id, assigned_by, assigned_at", "task_id", taskIds),
    fetchRows(taskDb, "task_checklist", "id, task_id, item_text, is_completed, created_by, created_at", "task_id", taskIds),
    fetchRows(taskDb, "task_comments", "id, task_id, user_id, comment, created_at, updated_at", "task_id", taskIds, {
      column: "created_at",
      ascending: false,
    }),
    fetchRows(taskDb, "task_attachments", "id, task_id, file_url, file_name, file_type, file_size, uploaded_by, uploaded_at", "task_id", taskIds),
    fetchRows(taskDb, "task_activity_logs", "id, task_id, action_type, metadata, created_at, performed_by", "task_id", taskIds, {
      column: "created_at",
      ascending: false,
    }),
    fetchClients(taskDb, [task.client_id]),
  ]);

  const profileMap = await fetchProfiles(taskDb, [
    task.created_by,
    ...assignments.map((assignment) => assignment.user_id),
    ...assignments.map((assignment) => assignment.assigned_by),
    ...checklist.map((item) => item.created_by),
    ...comments.map((comment) => comment.user_id),
    ...attachments.map((attachment) => attachment.uploaded_by),
    ...activityLogs.map((activity) => activity.performed_by),
  ]);

  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));

  return {
    ...task,
    created_by: profileMap.get(task.created_by) || null,
    client: task.client_id ? clientMap.get(task.client_id) || null : null,
    task_assignments: assignments.map((assignment) => ({
      ...assignment,
      assignee: profileMap.get(assignment.user_id) || null,
    })),
    task_checklist: checklist,
    task_comments: comments.map((comment) => ({
      ...comment,
      user: profileMap.get(comment.user_id) || null,
    })),
    task_attachments: attachments.map((attachment) => ({
      ...attachment,
      uploader: profileMap.get(attachment.uploaded_by) || null,
    })),
    task_activity_logs: activityLogs.map((activity) => ({
      ...activity,
      metadata: {
        ...(activity.metadata || {}),
        remark:
          activity.metadata?.remark ||
          commentsById.get(activity.metadata?.comment_id)?.comment ||
          undefined,
      },
      performer: profileMap.get(activity.performed_by) || null,
    })),
  };
}
