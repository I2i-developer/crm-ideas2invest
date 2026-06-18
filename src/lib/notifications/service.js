export async function createNotification(
  supabase,
  {
    userId,
    taskId = null,
    title,
    message,
    type = "system",
    entityType = null,
    entityId = null,
    linkUrl = null,
    metadata = {},
    dedupeKey = null,
  }
) {
  if (!userId || !title) return null;

  const payload = {
    user_id: userId,
    task_id: taskId,
    title,
    message,
    notification_type: type,
    entity_type: entityType,
    entity_id: entityId,
    link_url: linkUrl,
    metadata,
    dedupe_key: dedupeKey,
  };

  const { data, error } = await supabase
    .from("task_notifications")
    .insert(payload)
    .select()
    .single();

  const errorText = error ? JSON.stringify(error) : "";
  if (error && !`${error.message || ""} ${errorText}`.includes("duplicate key")) {
    console.error("Notification creation failed:", error.message || errorText || error);
  }

  return data;
}

export async function notifyUsers(supabase, userIds, notification) {
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];

  await Promise.all(
    uniqueUserIds.map((userId) =>
      createNotification(supabase, {
        ...notification,
        userId,
      })
    )
  );
}

export async function getAdminUserIds(supabase) {
  const { data } = await supabase.from("profiles").select("id").eq("role", "admin");
  return (data || []).map((profile) => profile.id);
}
