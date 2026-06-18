/**
 * Task Notifications API
 * GET, PUT /api/tasks/notifications
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { generateTaskDateNotifications } from "@/lib/tasks/alerts";

export async function GET(request) {
  const supabase = await createClient(request);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await generateTaskDateNotifications(supabase, user.id);

  const { data: notifications, error } = await supabase
    .from("task_notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await supabase
    .from("task_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return NextResponse.json({ notifications, unread_count: count }, { status: 200 });
}

export async function PUT(request) {
  const supabase = await createClient(request);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { notification_id, all } = body;

  if (all) {
    await supabase
      .from("task_notifications")
      .update({ is_read: true })
      .eq("user_id", user.id);
  } else if (notification_id) {
    await supabase
      .from("task_notifications")
      .update({ is_read: true })
      .eq("id", notification_id)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
