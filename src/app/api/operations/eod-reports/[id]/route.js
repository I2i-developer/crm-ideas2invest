import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

const STATUSES = ["Draft", "Submitted", "Reviewed"];

function text(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function count(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Math.round(number), 9999);
}

function operationPayload(body, userId, existing) {
  const status = STATUSES.includes(body.status) && body.status !== "Reviewed" ? body.status : existing.status;
  const now = new Date().toISOString();
  return {
    work_summary: text(body.work_summary ?? existing.work_summary),
    completed_work: text(body.completed_work ?? existing.completed_work),
    pending_work: text(body.pending_work ?? existing.pending_work) || null,
    blockers: text(body.blockers ?? existing.blockers) || null,
    tomorrow_plan: text(body.tomorrow_plan ?? existing.tomorrow_plan) || null,
    client_followups: text(body.client_followups ?? existing.client_followups) || null,
    documents_processed: count(body.documents_processed ?? existing.documents_processed),
    tasks_completed: count(body.tasks_completed ?? existing.tasks_completed),
    tasks_pending: count(body.tasks_pending ?? existing.tasks_pending),
    status,
    submitted_at: status === "Submitted" ? (existing.submitted_at || now) : null,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    operation_hidden_at: null,
    operation_hidden_by: null,
    updated_by: userId,
  };
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: existing, error: readError } = await db
    .from("operation_eod_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "EOD report not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  let payload;
  let action;

  if (isAdmin(role)) {
    payload = {
      status: body.status === "Reviewed" ? "Reviewed" : existing.status,
      review_note: text(body.review_note ?? existing.review_note, 2500) || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_by: user.id,
    };
    action = "operation_eod_report_reviewed";
  } else {
    if (existing.created_by !== user.id) return NextResponse.json({ error: "You can update only your own EOD report" }, { status: 403 });
    payload = operationPayload(body, user.id, existing);
    if (!payload.completed_work) {
      return NextResponse.json({ error: "Completed work is required" }, { status: 400 });
    }
    action = "operation_eod_report_updated";
  }

  const { data, error } = await db
    .from("operation_eod_reports")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action,
    entityType: "operation_eod_report",
    entityId: data.id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ report: data });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: existing, error: readError } = await db
    .from("operation_eod_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "EOD report not found" }, { status: 404 });

  if (isAdmin(role)) {
    const { error } = await db
      .from("operation_eod_reports")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actor: user,
      profile,
      action: "operation_eod_report_permanently_deleted",
      entityType: "operation_eod_report",
      entityId: existing.id,
      oldValue: existing,
      request,
    });

    return NextResponse.json({ ok: true, permanent: true });
  }

  if (existing.created_by !== user.id) return NextResponse.json({ error: "You can hide only your own EOD report" }, { status: 403 });

  const { data, error } = await db
    .from("operation_eod_reports")
    .update({
      operation_hidden_at: new Date().toISOString(),
      operation_hidden_by: user.id,
      updated_by: user.id,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "operation_eod_report_hidden",
    entityType: "operation_eod_report",
    entityId: data.id,
    oldValue: existing,
    newValue: data,
    request,
  });

  return NextResponse.json({ ok: true, hidden: true });
}
