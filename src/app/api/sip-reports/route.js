import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin } from "@/lib/auth/permissions";
import { getTaskDataClient } from "@/lib/tasks/assignees";
import { parseReportDate } from "@/lib/crm/sipReports";

export const dynamic = "force-dynamic";

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function currentWeekBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: todayKey(start),
    end: todayKey(end),
  };
}

function matchesSearch(event, search) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [
    event.investor_name,
    event.mobile,
    event.email,
    event.phone,
    event.pan_number,
    event.sip_flag,
    event.folio_no,
    event.scheme,
    event.fund,
    event.clients?.full_name,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function rawValue(rawRow, candidates) {
  if (!rawRow) return null;
  const normalizedCandidates = candidates.map((candidate) =>
    String(candidate).replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  );
  const entry = Object.entries(rawRow).find(([key, value]) =>
    value !== null &&
    value !== undefined &&
    normalizedCandidates.includes(String(key).split(",")[0].replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
  );
  return entry ? entry[1] : null;
}

function correctedEventDates(event) {
  return {
    start_date: parseReportDate(rawValue(event.raw_row, ["STARTDATE", "FROMDATE"])) || event.start_date,
    end_date: parseReportDate(rawValue(event.raw_row, ["ENDDATE", "TODATE"])) || event.end_date,
    termination_date: parseReportDate(rawValue(event.raw_row, ["TERMDATE", "CEASE_DATE"])) || event.termination_date,
    sip_registration_date: parseReportDate(rawValue(event.raw_row, ["SIPREGDT", "REGDATE"])) || event.sip_registration_date,
  };
}

function sipEventDate(event) {
  return event.termination_date || event.end_date || event.start_date || event.sip_registration_date;
}

function filterVisibleEvents(events, admin) {
  if (admin) return events;
  return events;
}

function buildSummary(events, userId) {
  const week = currentWeekBounds();
  const isThisWeek = (event) => {
    const eventDate = sipEventDate(event);
    return Boolean(eventDate) && eventDate >= week.start && eventDate <= week.end;
  };
  const unresolved = (event) => event.follow_up_status !== "resolved";
  const startsThisWeek = (event) =>
    Boolean(event.start_date) && event.start_date >= week.start && event.start_date <= week.end;

  return {
    active_this_week: events.filter((event) => event.event_type === "active" && startsThisWeek(event)).length,
    terminated_this_week: events.filter((event) => event.event_type === "terminated" && isThisWeek(event)).length,
    paused_this_week: events.filter((event) => event.event_type === "paused" && isThisWeek(event)).length,
    rejected_this_week: events.filter((event) => event.event_type === "rejected" && isThisWeek(event)).length,
    closed_this_week: events.filter((event) => event.event_type === "closed" && isThisWeek(event)).length,
    expiring_this_week: events.filter((event) => event.event_type === "expiring" && isThisWeek(event)).length,
    unoperational_this_week: events.filter((event) => event.event_type === "unoperational" && isThisWeek(event)).length,
    total_active: events.filter((event) => event.event_type === "active" && unresolved(event)).length,
    total_terminated: events.filter((event) => event.event_type === "terminated" && unresolved(event)).length,
    total_rejected: events.filter((event) => event.event_type === "rejected" && unresolved(event)).length,
    total_closed: events.filter((event) => event.event_type === "closed" && unresolved(event)).length,
    total_expiring: events.filter((event) => event.event_type === "expiring" && unresolved(event)).length,
    total_unoperational: events.filter((event) => event.event_type === "unoperational" && unresolved(event)).length,
    total_resolved: events.filter((event) => event.follow_up_status === "resolved").length,
    pending_followups: events.filter((event) => event.follow_up_status === "pending").length,
    matched_records: events.filter((event) => event.matched_status === "matched").length,
    unmatched_records: events.filter((event) => event.matched_status === "unmatched").length,
    assigned_to_me: events.filter((event) => event.assigned_to === userId).length,
    my_pending_followups: events.filter(
      (event) => event.assigned_to === userId && event.follow_up_status === "pending"
    ).length,
  };
}

export async function GET(request) {
  const supabase = await createClient(request);
  const taskDb = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = isAdmin(role);
  const { searchParams } = new URL(request.url);
  const eventType = searchParams.get("event_type");
  const followUpStatus = searchParams.get("follow_up_status");
  const matchedStatus = searchParams.get("matched_status");
  const assignedUser = searchParams.get("assigned_user");
  const clientId = searchParams.get("client_id");
  const fund = searchParams.get("fund");
  const scheme = searchParams.get("scheme");
  const reportRta = searchParams.get("report_rta");
  const reportType = searchParams.get("report_type");
  const transactionType = searchParams.get("transaction_type");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const search = searchParams.get("search");

  const buildQuery = () => {
    let query = taskDb
      .from("sip_events")
      .select(
        "*, clients(id, full_name, mobile, email), tasks(id, title, status, due_date)"
      )
      .order("created_at", { ascending: false });

    if (eventType && eventType !== "all") query = query.eq("event_type", eventType);
    if (followUpStatus && followUpStatus !== "all") query = query.eq("follow_up_status", followUpStatus);
    if (matchedStatus && matchedStatus !== "all") query = query.eq("matched_status", matchedStatus);
    if (clientId) query = query.eq("client_id", clientId);
    if (fund) query = query.ilike("fund", `%${fund}%`);
    if (scheme) query = query.ilike("scheme", `%${scheme}%`);
    if (reportRta && reportRta !== "all") query = query.eq("report_rta", reportRta);
    if (reportType && reportType !== "all") query = query.eq("report_type", reportType);
    if (transactionType && transactionType !== "all") query = query.ilike("sip_flag", transactionType);
    if (admin && assignedUser && assignedUser !== "all") query = query.eq("assigned_to", assignedUser);

    return query;
  };

  const maxRows = clientId ? 50 : 5000;
  const pageSize = clientId ? 50 : 1000;
  let data = [];
  let error = null;

  for (let start = 0; start < maxRows; start += pageSize) {
    const end = Math.min(start + pageSize - 1, maxRows - 1);
    const { data: batch, error: batchError } = await buildQuery().range(start, end);
    if (batchError) {
      error = batchError;
      break;
    }
    data = [...data, ...(batch || [])];
    if (!batch || batch.length < pageSize) break;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let events = filterVisibleEvents(data || [], admin).map((event) => ({
    ...event,
    ...correctedEventDates(event),
  }));

  if (dateFrom) events = events.filter((event) => {
    const eventDate = sipEventDate(event);
    return eventDate && eventDate >= dateFrom;
  });
  if (dateTo) events = events.filter((event) => {
    const eventDate = sipEventDate(event);
    return eventDate && eventDate <= dateTo;
  });
  events = events.filter((event) => matchesSearch(event, search));

  const assigneeIds = [...new Set(events.map((event) => event.assigned_to).filter(Boolean))];
  const { data: profiles = [] } = assigneeIds.length
    ? await taskDb.from("profiles").select("id, name, full_name, email, role").in("id", assigneeIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  events = events.map((event) => ({
    ...event,
    assigned_profile: profileMap.get(event.assigned_to) || null,
  }));

  return NextResponse.json({
    events,
    summary: buildSummary(events, user.id),
  });
}
