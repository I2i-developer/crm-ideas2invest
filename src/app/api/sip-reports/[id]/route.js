import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { createSipFollowupTask, resolveSipAssignee, SIP_FOLLOW_UP_STATUSES } from "@/lib/crm/sipReports";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { writeAuditLog } from "@/lib/audit/logger";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { data: existing, error: existingError } = await taskDb
    .from("sip_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "SIP event not found" }, { status: 404 });
  }

  const admin = isAdmin(role);
  const operations = isOperations(role);
  if (!admin && !operations) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_sip_event_update",
      entityType: "sip_event",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const updates = {};

  if (body.follow_up_status !== undefined) {
    if (!SIP_FOLLOW_UP_STATUSES.includes(body.follow_up_status)) {
      return NextResponse.json({ error: "Invalid follow-up status" }, { status: 400 });
    }
    updates.follow_up_status = body.follow_up_status;
  }

  if (body.internal_remarks !== undefined) {
    updates.internal_remarks = String(body.internal_remarks || "").trim() || null;
  }

  if (body.client_id !== undefined) {
    if (!admin) {
      return NextResponse.json({ error: "Only admin can match SIP events to clients" }, { status: 403 });
    }

    if (body.client_id) {
      const { data: client, error: clientError } = await taskDb
        .from("clients")
        .select("id, full_name, operations_owner")
        .eq("id", body.client_id)
        .maybeSingle();

      if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 });
      if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

      updates.client_id = client.id;
      updates.matched_status = "matched";
      updates.match_confidence = "high";
      updates.match_reason = "Manually matched in SIP Tracker";
      updates.assigned_to = await resolveSipAssignee(taskDb, client);
    } else {
      updates.client_id = null;
      updates.matched_status = "unmatched";
      updates.match_confidence = null;
      updates.match_reason = "Manual match removed";
      updates.assigned_to = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid SIP event updates provided" }, { status: 400 });
  }

  const { data: event, error } = await taskDb
    .from("sip_events")
    .update(updates)
    .eq("id", id)
    .select("*, clients(id, full_name), tasks(id, title, status, due_date)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (updates.client_id !== undefined && existing.task_id) {
    await taskDb.from("tasks").update({ client_id: updates.client_id }).eq("id", existing.task_id);
  }

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "sip_event_updated",
    entityType: "sip_event",
    entityId: id,
    oldValue: existing,
    newValue: updates,
    request,
  });

  return NextResponse.json({ event });
}

export async function POST(request, { params }) {
  const supabase = await createClient(request);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = isAdmin(role);
  const body = await request.json().catch(() => ({}));

  if (body.action !== "create_task") {
    return NextResponse.json({ error: "Unsupported SIP event action" }, { status: 400 });
  }

  if (!admin) {
    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "permission_denied_sip_task_create",
      entityType: "sip_event",
      entityId: id,
      request,
    });
    return NextResponse.json({ error: "Only admin can create SIP follow-up tasks manually" }, { status: 403 });
  }

  try {
    const result = await createSipFollowupTask({
      supabase,
      actor: user,
      profile,
      eventId: id,
      request,
    });

    return NextResponse.json(result, { status: result.alreadyExists ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Only admin can delete SIP events" }, { status: 403 });
  }

  const { id } = await params;
  const { data: existing, error: existingError } = await taskDb
    .from("sip_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "SIP event not found" }, { status: 404 });

  const { error } = await taskDb.from("sip_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "sip_event_deleted",
    entityType: "sip_event",
    entityId: id,
    oldValue: existing,
    request,
  });

  return NextResponse.json({ ok: true });
}
