import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export const dynamic = "force-dynamic";

const STATUSES = ["Draft", "Submitted", "Reviewed"];
const CRM_TIME_ZONE = "Asia/Kolkata";

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateKey(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : todayKey();
}

function text(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function count(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Math.round(number), 9999);
}

function reportPayload(body, userId, existing = {}) {
  const requestedStatus = STATUSES.includes(body.status) ? body.status : existing.status || "Draft";
  const status = requestedStatus === "Reviewed" ? "Submitted" : requestedStatus;
  const now = new Date().toISOString();

  return {
    report_date: dateKey(body.report_date || existing.report_date),
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

async function getProfiles(db, ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data } = await db
    .from("profiles")
    .select("id, name, full_name, email, role")
    .in("id", uniqueIds);

  return new Map((data || []).map((profile) => [profile.id, {
    id: profile.id,
    name: profile.name || profile.full_name || profile.email || "CRM User",
    email: profile.email || "",
    role: profile.role || "",
  }]));
}

async function operationsUsers(db) {
  const { data } = await db
    .from("profiles")
    .select("id, name, full_name, email, role, is_active, status")
    .eq("role", "operations")
    .order("name", { ascending: true, nullsFirst: false });

  return (data || [])
    .filter((profile) => profile.is_active !== false && String(profile.status || "Active").toLowerCase() !== "inactive")
    .map((profile) => ({
      id: profile.id,
      name: profile.name || profile.full_name || profile.email || "CRM User",
      email: profile.email || "",
    }));
}

export async function GET(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  let query = db
    .from("operation_eod_reports")
    .select("*")
    .order("report_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(250);

  if (isOperations(role)) query = query.eq("created_by", user.id).is("operation_hidden_at", null);
  if (isAdmin(role) && searchParams.get("user_id")) query = query.eq("created_by", searchParams.get("user_id"));
  if (searchParams.get("status")) query = query.eq("status", searchParams.get("status"));
  if (searchParams.get("date_from")) query = query.gte("report_date", searchParams.get("date_from"));
  if (searchParams.get("date_to")) query = query.lte("report_date", searchParams.get("date_to"));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const search = String(searchParams.get("search") || "").trim().toLowerCase();
  const filtered = (data || []).filter((report) => {
    if (!search) return true;
    return [report.work_summary, report.completed_work, report.pending_work, report.blockers, report.tomorrow_plan, report.client_followups]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });

  const profileMap = await getProfiles(db, filtered.flatMap((report) => [report.created_by, report.reviewed_by]));
  const reports = filtered.map((report) => ({
    ...report,
    created_by_profile: profileMap.get(report.created_by) || null,
    reviewed_by_profile: profileMap.get(report.reviewed_by) || null,
  }));

  const summary = {
    total: reports.length,
    submitted: reports.filter((report) => report.status === "Submitted").length,
    reviewed: reports.filter((report) => report.status === "Reviewed").length,
    drafts: reports.filter((report) => report.status === "Draft").length,
    today_submitted: reports.filter((report) => report.report_date === todayKey() && report.status !== "Draft").length,
  };

  return NextResponse.json({
    reports,
    summary,
    users: isAdmin(role) ? await operationsUsers(db) : [],
    role,
    current_user_id: user.id,
    today: todayKey(),
  });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperations(role)) return NextResponse.json({ error: "Only operations users can submit EOD reports" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const reportDate = dateKey(body.report_date);
  const { data: existing, error: readError } = await db
    .from("operation_eod_reports")
    .select("*")
    .eq("created_by", user.id)
    .eq("report_date", reportDate)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const payload = reportPayload({ ...body, report_date: reportDate }, user.id, existing || {});
  if (!payload.completed_work) {
    return NextResponse.json({ error: "Completed work is required" }, { status: 400 });
  }

  const mutation = existing
    ? db.from("operation_eod_reports").update(payload).eq("id", existing.id).select().single()
    : db.from("operation_eod_reports").insert({ ...payload, created_by: user.id }).select().single();

  const { data, error } = await mutation;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: existing ? "operation_eod_report_updated" : "operation_eod_report_created",
    entityType: "operation_eod_report",
    entityId: data.id,
    newValue: data,
    request,
  });

  return NextResponse.json({ report: data }, { status: existing ? 200 : 201 });
}
