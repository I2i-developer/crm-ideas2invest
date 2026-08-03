import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations, canAccessClient } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { createNotification } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

const MEETING_SELECT = `
  *,
  client:clients(id, full_name, email, mobile, kyc_status, tax_status, risk_category),
  reminders:client_meeting_reminders(*)
`;

function normalizeMeetingPayload(body, userId) {
  return {
    client_id: body.client_id || null,
    title: String(body.title || "").trim(),
    meeting_type: body.meeting_type || "Review meeting",
    meeting_datetime: body.meeting_datetime || new Date().toISOString(),
    raw_notes: String(body.raw_notes || "").trim(),
    summary_json: body.summary_json || {},
    overview: body.overview || body.summary_json?.overview || null,
    major_discussion: body.major_discussion || (body.summary_json?.major_discussion_points || []).join("\n") || null,
    detected_pans: body.detected_pans || body.summary_json?.detected_pans || [],
    important_figures: body.important_figures || body.summary_json?.important_figures || [],
    sentiment: body.sentiment || body.summary_json?.sentiment || "Neutral",
    priority: body.priority || body.summary_json?.priority || "Medium",
    status: body.status || "Draft",
    created_by: userId,
    updated_by: userId,
  };
}

async function canManageMeetingClient(supabase, user, role, clientId) {
  if (!clientId) return isAdmin(role) || isOperations(role);
  return canAccessClient(supabase, user.id, role, clientId);
}

async function generateDueReminderNotifications(supabase, userId) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const { data: reminders } = await supabase
    .from("client_meeting_reminders")
    .select("id, title, reminder_at, priority, client_id, meeting_id, last_notification_at")
    .eq("user_id", userId)
    .in("status", ["Pending", "Snoozed"])
    .lte("reminder_at", now.toISOString())
    .or(`last_notification_at.is.null,last_notification_at.lt.${oneHourAgo}`);

  for (const reminder of reminders || []) {
    await createNotification(supabase, {
      userId,
      title: "Meeting reminder due",
      message: reminder.title,
      type: "meeting_reminder_due",
      entityType: "client_meeting_reminder",
      entityId: reminder.id,
      linkUrl: reminder.meeting_id ? `/admin/meeting-notes?meeting_id=${reminder.meeting_id}` : "/admin/meeting-notes",
      metadata: reminder,
      dedupeKey: `meeting_reminder_due:${reminder.id}:${now.toISOString().slice(0, 13)}`,
    });

    await supabase
      .from("client_meeting_reminders")
      .update({ last_notification_at: now.toISOString() })
      .eq("id", reminder.id);
  }
}

export async function GET(request) {
  const supabase = await createClient(request);
  const { user, role } = await getAuthContext(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await generateDueReminderNotifications(supabase, user.id);

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const meetingId = searchParams.get("meeting_id");
  const search = searchParams.get("search");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

  let query = supabase
    .from("client_meetings")
    .select(MEETING_SELECT)
    .order("meeting_datetime", { ascending: false })
    .limit(limit);

  if (meetingId) query = query.eq("id", meetingId);
  if (clientId) query = query.eq("client_id", clientId);
  if (status) query = query.eq("status", status);
  if (search) {
    const safe = search.replaceAll(",", " ");
    query = query.or(`title.ilike.%${safe}%,raw_notes.ilike.%${safe}%,overview.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ meetings: data || [], role }, { status: 200 });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const payload = normalizeMeetingPayload(body, user.id);
  if (!payload.title) return NextResponse.json({ error: "Meeting title is required" }, { status: 400 });
  if (!payload.raw_notes && payload.status !== "Draft") {
    return NextResponse.json({ error: "Meeting notes are required before finalizing" }, { status: 400 });
  }
  if (!(await canManageMeetingClient(supabase, user, role, payload.client_id))) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_meeting_create",
      entityType: "client_meeting",
      metadata: { client_id: payload.client_id },
      request,
    });
    return NextResponse.json({ error: "You cannot create a meeting note for this client" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("client_meetings")
    .insert(payload)
    .select(MEETING_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "meeting_note_created",
    entityType: "client_meeting",
    entityId: data.id,
    newValue: { title: data.title, client_id: data.client_id, status: data.status },
    request,
  });

  return NextResponse.json({ meeting: data }, { status: 201 });
}
