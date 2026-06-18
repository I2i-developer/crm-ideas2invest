export async function writeAuditLog(
  supabase,
  {
    actor,
    profile,
    action,
    entityType,
    entityId,
    oldValue = null,
    newValue = null,
    metadata = {},
    request = null,
  }
) {
  const userAgent = request?.headers?.get("user-agent") || null;
  const forwardedFor = request?.headers?.get("x-forwarded-for");
  const realIp = request?.headers?.get("x-real-ip");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || realIp || null;

  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actor?.id || null,
    actor_email: actor?.email || profile?.email || null,
    actor_role: profile?.role || null,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    old_value: oldValue,
    new_value: newValue,
    metadata,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  if (error) {
    console.error("Audit log failed:", error);
  }
}
