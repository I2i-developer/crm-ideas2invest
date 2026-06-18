import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { writeAuditLog } from "@/lib/audit/logger";

export const dynamic = "force-dynamic";

export async function DELETE(request) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role)) return NextResponse.json({ error: "Only admin can delete SIP events" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const ids = [...new Set((body.ids || []).filter(Boolean))];
  if (ids.length === 0) return NextResponse.json({ error: "No SIP events selected" }, { status: 400 });

  const { data: existing, error: existingError } = await taskDb
    .from("sip_events")
    .select("*")
    .in("id", ids);

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const { error } = await taskDb.from("sip_events").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "sip_events_bulk_deleted",
    entityType: "sip_event",
    oldValue: existing || [],
    metadata: { ids, deleted_count: existing?.length || 0 },
    request,
  });

  return NextResponse.json({ ok: true, deleted_count: existing?.length || 0 });
}
