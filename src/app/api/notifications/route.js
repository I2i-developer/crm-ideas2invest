import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext } from "@/lib/auth/permissions";
import { createNotification } from "@/lib/notifications/service";
import { generateTaskDateNotifications } from "@/lib/tasks/alerts";
import { generateInsuranceRenewalNotifications } from "@/lib/insurance/alerts";
import { getTaskDataClient } from "@/lib/tasks/assignees";

async function generateBirthdayNotifications(request, supabase, userId) {
  const response = await fetch(new URL("/api/birthdays?days=1", request.url), {
    headers: {
      authorization: request.headers.get("authorization") || "",
      cookie: request.headers.get("cookie") || "",
    },
  });

  if (!response.ok) return;

  const data = await response.json();
  const today = new Date().toISOString().slice(0, 10);

  for (const birthday of data.today || []) {
    await createNotification(supabase, {
      userId,
      title: "Client birthday today",
      message: `${birthday.person_name} has a birthday today.`,
      type: "client_birthday_today",
      entityType: "client",
      entityId: birthday.client_id || null,
      linkUrl: birthday.client_id ? `/admin/clients/${birthday.client_id}` : "/admin/birthdays",
      metadata: birthday,
      dedupeKey: `birthday_today:${birthday.id}:${today}`,
    });
  }
}

export async function GET(request) {
  const supabase = await createClient(request);
  const notificationDb = getTaskDataClient(supabase);
  const { user } = await getAuthContext(supabase);
  const { searchParams } = new URL(request.url);
  const recentDays = Number(searchParams.get("recent_days") || 0);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await generateTaskDateNotifications(supabase, user.id);
  await generateInsuranceRenewalNotifications(supabase, user.id);
  await generateBirthdayNotifications(request, supabase, user.id);

  let notificationsQuery = notificationDb
    .from("task_notifications")
    .select("*")
    .eq("user_id", user.id)
    .or("notification_type.is.null,notification_type.neq.upcoming_birthday")
    .order("created_at", { ascending: false })
    .limit(50);

  if (recentDays > 0) {
    const since = new Date();
    since.setDate(since.getDate() - recentDays);
    notificationsQuery = notificationsQuery.gte("created_at", since.toISOString());
  }

  const { data: notifications, error } = await notificationsQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await notificationDb
    .from("task_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .or("notification_type.is.null,notification_type.neq.upcoming_birthday")
    .eq("is_read", false);

  return NextResponse.json({ notifications, unread_count: count || 0 }, { status: 200 });
}

export async function PUT(request) {
  const supabase = await createClient(request);
  const notificationDb = getTaskDataClient(supabase);
  const { user } = await getAuthContext(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { notification_id, all } = body;

  let query = notificationDb
    .from("task_notifications")
    .update({ is_read: true })
    .eq("user_id", user.id);

  if (!all && notification_id) {
    query = query.eq("id", notification_id);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
