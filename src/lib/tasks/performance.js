const DAY_MS = 24 * 60 * 60 * 1000;

export const TASK_STATUS_GROUPS = {
  completed: new Set(["completed"]),
  cancelled: new Set(["cancelled", "canceled"]),
  pending: new Set(["pending", "new", "assigned"]),
  inProgress: new Set(["in progress", "in-progress", "working"]),
  followUp: new Set(["follow-up", "follow up", "followup"]),
  waiting: new Set(["waiting for approval", "waiting for internal approval", "approval pending"]),
};

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function round(value, digits = 1) {
  return Number(Number(value || 0).toFixed(digits));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function isFollowUp(task) {
  return TASK_STATUS_GROUPS.followUp.has(normalized(task.status))
    || normalized(task.category).includes("follow")
    || (task.tags || []).some((tag) => normalized(tag).includes("follow"));
}

function isWaiting(task) {
  return TASK_STATUS_GROUPS.waiting.has(normalized(task.status))
    || normalized(task.category).includes("approval")
    || (task.tags || []).some((tag) => normalized(tag).includes("approval"));
}

export function getTaskLifecycle(task, activities = [], now = new Date()) {
  const status = normalized(task.status);
  const taskActivities = activities
    .filter((activity) => activity.task_id === task.id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const completionEvents = taskActivities.filter((activity) =>
    normalized(activity.action_type) === "status_changed_to_completed"
  );
  const completedAt = task.completed_at || completionEvents.at(-1)?.created_at || null;
  const completed = TASK_STATUS_GROUPS.completed.has(status);
  const cancelled = TASK_STATUS_GROUPS.cancelled.has(status);
  const dueAt = task.due_date ? new Date(`${task.due_date}T23:59:59`) : null;
  const reopenedFromHistory = taskActivities.some((activity, index) => {
    if (normalized(activity.action_type) !== "status_changed_to_completed") return false;
    return taskActivities.slice(index + 1).some((later) =>
      normalized(later.action_type).startsWith("status_changed_to_")
      && normalized(later.action_type) !== "status_changed_to_completed"
    );
  });
  const reopened = Number(task.reopened_count || 0) > 0 || reopenedFromHistory;
  const overdue = !completed && !cancelled && dueAt && dueAt < now;
  const onTime = completed && completedAt && dueAt ? new Date(completedAt) <= dueAt : false;
  const late = completed && completedAt && dueAt ? new Date(completedAt) > dueAt : false;
  const ageDays = Math.max(0, (now - new Date(task.created_at)) / DAY_MS);
  const completionDays = completedAt
    ? Math.max(0, (new Date(completedAt) - new Date(task.created_at)) / DAY_MS)
    : null;

  return {
    ...task,
    completedAt,
    completed,
    cancelled,
    pending: TASK_STATUS_GROUPS.pending.has(status),
    inProgress: TASK_STATUS_GROUPS.inProgress.has(status),
    followUp: !completed && !cancelled && isFollowUp(task),
    waiting: !completed && !cancelled && isWaiting(task),
    overdue: Boolean(overdue),
    onTime,
    late,
    reopened,
    ageDays,
    completionDays,
  };
}

function ageingBucket(days) {
  if (days <= 2) return "0-2 days";
  if (days <= 7) return "3-7 days";
  if (days <= 15) return "8-15 days";
  if (days <= 30) return "16-30 days";
  return "More than 30 days";
}

export function summarizeTasks(tasks) {
  const active = tasks.filter((task) => !task.cancelled);
  const completed = active.filter((task) => task.completed);
  const incomplete = active.filter((task) => !task.completed);
  const dueCompleted = completed.filter((task) => task.due_date && task.completedAt);
  const ageing = incomplete.reduce((result, task) => {
    const bucket = ageingBucket(task.ageDays);
    result[bucket] = (result[bucket] || 0) + 1;
    return result;
  }, {});

  return {
    assigned: active.length,
    completed: completed.length,
    pending: active.filter((task) => task.pending).length,
    in_progress: active.filter((task) => task.inProgress).length,
    follow_up: active.filter((task) => task.followUp).length,
    waiting: active.filter((task) => task.waiting).length,
    overdue: active.filter((task) => task.overdue).length,
    reopened: active.filter((task) => task.reopened).length,
    completed_on_time: completed.filter((task) => task.onTime).length,
    completed_late: completed.filter((task) => task.late).length,
    current_workload: incomplete.length,
    completion_rate: active.length ? round((completed.length / active.length) * 100) : 0,
    on_time_rate: dueCompleted.length
      ? round((completed.filter((task) => task.onTime).length / dueCompleted.length) * 100)
      : 0,
    overdue_rate: active.length ? round((active.filter((task) => task.overdue).length / active.length) * 100) : 0,
    average_completion_days: round(average(completed.map((task) => task.completionDays).filter(Number.isFinite))),
    average_pending_age_days: round(average(incomplete.map((task) => task.ageDays))),
    ageing,
  };
}

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function buildPerformanceReport({ tasks, assignments, activities, users, selfTasks, filters = {} }) {
  const now = new Date();
  const filteredAssignments = assignments.filter((assignment) => {
    if (filters.user_id && assignment.user_id !== filters.user_id) return false;
    if (filters.assigned_by && assignment.assigned_by !== filters.assigned_by) return false;
    if (filters.date_from && (!assignment.assigned_at || dateKey(assignment.assigned_at) < filters.date_from)) return false;
    if (filters.date_to && (!assignment.assigned_at || dateKey(assignment.assigned_at) > filters.date_to)) return false;
    return true;
  });
  const assignmentsByTask = new Map();
  for (const assignment of filteredAssignments) {
    const rows = assignmentsByTask.get(assignment.task_id) || [];
    rows.push(assignment);
    assignmentsByTask.set(assignment.task_id, rows);
  }

  const lifecycleTasks = tasks.map((task) => ({
    ...getTaskLifecycle(task, activities, now),
    assignments: assignmentsByTask.get(task.id) || [],
  }));

  const filtered = lifecycleTasks.filter((task) => {
    const assignedRows = task.assignments;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.client_id && task.client_id !== filters.client_id) return false;
    if (filters.due_from && (!task.due_date || task.due_date < filters.due_from)) return false;
    if (filters.due_to && (!task.due_date || task.due_date > filters.due_to)) return false;
    if (filters.completed_from && (!task.completedAt || dateKey(task.completedAt) < filters.completed_from)) return false;
    if (filters.completed_to && (!task.completedAt || dateKey(task.completedAt) > filters.completed_to)) return false;
    return assignedRows.length > 0;
  });

  const uniqueTasks = [...new Map(filtered.map((task) => [task.id, task])).values()];
  const operationsUsers = users.filter((user) => normalized(user.role) === "operations");
  const userRows = operationsUsers.map((user) => {
    const userTasks = filtered.filter((task) => task.assignments.some((assignment) => assignment.user_id === user.id));
    return {
      id: user.id,
      name: user.name || user.full_name || user.email || "Unnamed user",
      designation: user.designation || "Operations",
      ...summarizeTasks(userTasks),
      tasks: userTasks,
      self_activity: {
        total: selfTasks.filter((task) => task.created_by === user.id && !task.is_archived).length,
        done: selfTasks.filter((task) => task.created_by === user.id && task.status === "Done" && !task.is_archived).length,
      },
      recent_activity: activities
        .filter((activity) => activity.performed_by === user.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 8),
    };
  });

  const statusDistribution = uniqueTasks.reduce((result, task) => {
    result[task.status || "Not set"] = (result[task.status || "Not set"] || 0) + 1;
    return result;
  }, {});
  const completionTrend = uniqueTasks.filter((task) => task.completedAt).reduce((result, task) => {
    const key = dateKey(task.completedAt);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});

  return {
    summary: summarizeTasks(uniqueTasks),
    users: userRows,
    charts: {
      status_distribution: statusDistribution,
      assigned_by_user: Object.fromEntries(userRows.map((user) => [user.name, user.assigned])),
      completed_by_user: Object.fromEntries(userRows.map((user) => [user.name, user.completed])),
      overdue_by_user: Object.fromEntries(userRows.map((user) => [user.name, user.overdue])),
      workload_by_user: Object.fromEntries(userRows.map((user) => [user.name, user.current_workload])),
      completion_trend: completionTrend,
      on_time_late: {
        "On time": uniqueTasks.filter((task) => task.onTime).length,
        Late: uniqueTasks.filter((task) => task.late).length,
      },
      ageing: summarizeTasks(uniqueTasks).ageing,
    },
  };
}
