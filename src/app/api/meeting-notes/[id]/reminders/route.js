import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations, canAccessClient } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

export const dynamic = "force-dynamic";

export async function POST(request, context) {
  const { id } = await context.params;
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: meeting } = await supabase
    .from("client_meetings")
    .select("id, client_id, created_by")
    .eq("id", id)
    .maybeSingle();

  if (!meeting) return NextResponse.json({ error: "Meeting note not found" }, { status: 404 });
  const allowed = isAdmin(role) || meeting.created_by === user.id || (meeting.client_id && await canAccessClient(supabase, user.id, role, meeting.client_id));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Reminder title is required" }, { status: 400 });
  if (!body.reminder_at) return NextResponse.json({ error: "Reminder date/time is required" }, { status: 400 });

  const payload = {
    meeting_id: id,
    client_id: meeting.client_id,
    user_id: user.id,
    title,
    reminder_at: body.reminder_at,
    priority: body.priority || "Medium",
    notes: String(body.notes || "").trim() || null,
    status: "Pending",
    created_by: user.id,
    updated_by: user.id,
  };

  const { data, error } = await supabase
    .from("client_meeting_reminders")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "meeting_reminder_created",
    entityType: "client_meeting_reminder",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ reminder: data }, { status: 201 });
}
