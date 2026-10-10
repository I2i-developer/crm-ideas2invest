import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext, isAdmin, isOperations } from "@/lib/auth/permissions";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export const dynamic = "force-dynamic";

const CRM_TIME_ZONE = "Asia/Kolkata";

function usageDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function cleanSessionKey(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, 120);
}

function boundedDelta(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(Math.round(seconds), 90);
}

export async function POST(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, role } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(role) && !isOperations(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const sessionKey = cleanSessionKey(body.session_key);
  if (!sessionKey) return NextResponse.json({ error: "Session key is required" }, { status: 400 });

  const now = new Date();
  const nowIso = now.toISOString();
  const usageDate = usageDateKey(now);
  const delta = boundedDelta(body.active_seconds_delta);
  const pageViews = body.page_view ? 1 : 0;
  const currentPage = String(body.page_path || "").slice(0, 300) || null;
  const userAgent = request.headers.get("user-agent") || null;

  const { data: existingSession, error: sessionReadError } = await db
    .from("crm_usage_sessions")
    .select("id, active_seconds, heartbeat_count, page_views")
    .eq("session_key", sessionKey)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionReadError) return NextResponse.json({ error: sessionReadError.message }, { status: 500 });

  let newSession = false;
  if (existingSession) {
    const { error } = await db
      .from("crm_usage_sessions")
      .update({
        last_seen_at: nowIso,
        ended_at: null,
        active_seconds: Number(existingSession.active_seconds || 0) + delta,
        heartbeat_count: Number(existingSession.heartbeat_count || 0) + 1,
        page_views: Number(existingSession.page_views || 0) + pageViews,
        current_page: currentPage,
      })
      .eq("id", existingSession.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    newSession = true;
    const { error } = await db.from("crm_usage_sessions").insert({
      session_key: sessionKey,
      user_id: user.id,
      started_at: nowIso,
      last_seen_at: nowIso,
      active_seconds: delta,
      heartbeat_count: 1,
      page_views: Math.max(pageViews, 1),
      current_page: currentPage,
      user_agent: userAgent,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: existingDaily, error: dailyReadError } = await db
    .from("crm_user_usage_daily")
    .select("id, active_seconds, heartbeat_count, page_views, session_count, first_seen_at")
    .eq("user_id", user.id)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (dailyReadError) return NextResponse.json({ error: dailyReadError.message }, { status: 500 });

  if (existingDaily) {
    const { error } = await db
      .from("crm_user_usage_daily")
      .update({
        active_seconds: Number(existingDaily.active_seconds || 0) + delta,
        heartbeat_count: Number(existingDaily.heartbeat_count || 0) + 1,
        page_views: Number(existingDaily.page_views || 0) + pageViews,
        session_count: Number(existingDaily.session_count || 0) + (newSession ? 1 : 0),
        first_seen_at: existingDaily.first_seen_at || nowIso,
        last_seen_at: nowIso,
      })
      .eq("id", existingDaily.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db.from("crm_user_usage_daily").insert({
      user_id: user.id,
      usage_date: usageDate,
      active_seconds: delta,
      heartbeat_count: 1,
      page_views: Math.max(pageViews, 1),
      session_count: 1,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, active_seconds_delta: delta, usage_date: usageDate });
}
