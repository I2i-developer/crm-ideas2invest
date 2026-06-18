import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

export async function DELETE(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Only admin can delete audit history" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];

  if (!ids.length) {
    return NextResponse.json({ error: "Audit log id is required" }, { status: 400 });
  }

  const { data: deletedLogs, error } = await supabase
    .from("audit_logs")
    .delete()
    .in("id", ids)
    .select("id, action, entity_type, entity_id, created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "audit_logs_deleted",
    entityType: "audit_log",
    metadata: {
      deleted_count: deletedLogs?.length || 0,
      deleted_logs: deletedLogs || [],
    },
    request,
  });

  return NextResponse.json({ deleted: deletedLogs?.length || 0 });
}
