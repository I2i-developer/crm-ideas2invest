import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations, canAccessClient } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";

export const dynamic = "force-dynamic";

const MEETING_SELECT = `
  *,
  client:clients(id, full_name, email, mobile, kyc_status, tax_status, risk_category),
  reminders:client_meeting_reminders(*)
`;

async function getMeeting(supabase, id) {
  const { data, error } = await supabase
    .from("client_meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return { meeting: data, error };
}

async function canUpdateMeeting(supabase, user, role, meeting) {
  if (!meeting) return false;
  if (isAdmin(role)) return true;
  if (!isOperations(role)) return false;
  if (meeting.status === "Finalized") return false;
  if (meeting.created_by === user.id) return true;
  return meeting.client_id ? canAccessClient(supabase, user.id, role, meeting.client_id) : false;
}

async function canDeleteMeeting(role) {
  return isAdmin(role);
}

export async function PATCH(request, context) {
  const { id } = await context.params;
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meeting, error: meetingError } = await getMeeting(supabase, id);
  if (meetingError) return NextResponse.json({ error: meetingError.message }, { status: 500 });
  if (!meeting) return NextResponse.json({ error: "Meeting note not found" }, { status: 404 });

  if (!(await canUpdateMeeting(supabase, user, role, meeting))) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_meeting_update",
      entityType: "client_meeting",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  if (body.action === "delete_summary") {
    const { data, error } = await supabase
      .from("client_meetings")
      .update({
        summary_json: {},
        overview: null,
        major_discussion: null,
        detected_pans: [],
        important_figures: [],
        sentiment: "Neutral",
        priority: "Medium",
        status: "Draft",
        updated_by: user.id,
      })
      .eq("id", id)
      .select(MEETING_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "meeting_summary_deleted",
      entityType: "client_meeting",
      entityId: id,
      oldValue: {
        overview: meeting.overview,
        detected_pans: meeting.detected_pans,
        important_figures: meeting.important_figures,
      },
      request,
    });

    return NextResponse.json({ meeting: data }, { status: 200 });
  }

  const nextStatus = body.status || meeting.status;
  const payload = {
    title: body.title !== undefined ? String(body.title || "").trim() : meeting.title,
    meeting_type: body.meeting_type || meeting.meeting_type,
    meeting_datetime: body.meeting_datetime || meeting.meeting_datetime,
    raw_notes: body.raw_notes !== undefined ? String(body.raw_notes || "").trim() : meeting.raw_notes,
    summary_json: body.summary_json || meeting.summary_json || {},
    overview: body.overview || body.summary_json?.overview || meeting.overview,
    major_discussion: body.major_discussion || (body.summary_json?.major_discussion_points || []).join("\n") || meeting.major_discussion,
    detected_pans: body.detected_pans || body.summary_json?.detected_pans || meeting.detected_pans || [],
    important_figures: body.important_figures || body.summary_json?.important_figures || meeting.important_figures || [],
    sentiment: body.sentiment || body.summary_json?.sentiment || meeting.sentiment || "Neutral",
    priority: body.priority || body.summary_json?.priority || meeting.priority || "Medium",
    status: nextStatus,
    finalized_at: nextStatus === "Finalized" ? new Date().toISOString() : meeting.finalized_at,
    updated_by: user.id,
  };

  if (!payload.title) return NextResponse.json({ error: "Meeting title is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("client_meetings")
    .update(payload)
    .eq("id", id)
    .select(MEETING_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: nextStatus === "Finalized" ? "meeting_note_finalized" : "meeting_note_updated",
    entityType: "client_meeting",
    entityId: id,
    newValue: { title: data.title, status: data.status },
    request,
  });

  return NextResponse.json({ meeting: data }, { status: 200 });
}

export async function DELETE(request, context) {
  const { id } = await context.params;
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meeting, error: meetingError } = await getMeeting(supabase, id);
  if (meetingError) return NextResponse.json({ error: meetingError.message }, { status: 500 });
  if (!meeting) return NextResponse.json({ error: "Meeting note not found" }, { status: 404 });

  if (!(await canDeleteMeeting(role))) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_meeting_delete",
      entityType: "client_meeting",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Only admin can delete full meeting notes" }, { status: 403 });
  }

  const { data: reminders } = await supabase
    .from("client_meeting_reminders")
    .select("id")
    .eq("meeting_id", id);

  const reminderIds = (reminders || []).map((reminder) => reminder.id);
  if (reminderIds.length) {
    await supabase
      .from("task_notifications")
      .delete()
      .eq("entity_type", "client_meeting_reminder")
      .in("entity_id", reminderIds);
  }

  await supabase
    .from("task_notifications")
    .delete()
    .eq("entity_type", "client_meeting")
    .eq("entity_id", id);

  const { error } = await supabase
    .from("client_meetings")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "meeting_note_deleted",
    entityType: "client_meeting",
    entityId: id,
    oldValue: {
      title: meeting.title,
      client_id: meeting.client_id,
      status: meeting.status,
      meeting_datetime: meeting.meeting_datetime,
    },
    request,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
