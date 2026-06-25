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
    normalizedCandidates.includes(String(key).replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
  );
  return entry ? entry[1] : null;
}

function correctedEventDates(event) {
  return {
    start_date: parseReportDate(rawValue(event.raw_row, ["STARTDATE"])) || event.start_date,
    end_date: parseReportDate(rawValue(event.raw_row, ["ENDDATE"])) || event.end_date,
    termination_date: parseReportDate(rawValue(event.raw_row, ["TERMDATE"])) || event.termination_date,
    sip_registration_date: parseReportDate(rawValue(event.raw_row, ["SIPREGDT"])) || event.sip_registration_date,
  };
}

function filterVisibleEvents(events, admin) {
  if (admin) return events;
  return events;
}

function buildSummary(events, userId) {
  const week = currentWeekBounds();
  const isThisWeek = (event) =>
    Boolean(event.termination_date) &&
    event.termination_date >= week.start &&
    event.termination_date <= week.end;

  return {
    terminated_this_week: events.filter((event) => event.event_type === "terminated" && isThisWeek(event)).length,
    paused_this_week: events.filter((event) => event.event_type === "paused" && isThisWeek(event)).length,
    rejected_this_week: events.filter((event) => event.event_type === "rejected" && isThisWeek(event)).length,
    total_terminated: events.filter((event) => event.event_type === "terminated").length,
    total_rejected: events.filter((event) => event.event_type === "rejected").length,
    total_resolved: events.filter((event) => event.follow_up_status === "resolved").length,
    pending_followups: events.filter((event) => event.follow_up_status === "pending").length,
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
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const search = searchParams.get("search");

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
  if (admin && assignedUser && assignedUser !== "all") query = query.eq("assigned_to", assignedUser);

  const { data, error } = await query.limit(clientId ? 50 : 500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let events = filterVisibleEvents(data || [], admin).map((event) => ({
    ...event,
    ...correctedEventDates(event),
  }));

  if (dateFrom) events = events.filter((event) => event.termination_date && event.termination_date >= dateFrom);
  if (dateTo) events = events.filter((event) => event.termination_date && event.termination_date <= dateTo);
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
