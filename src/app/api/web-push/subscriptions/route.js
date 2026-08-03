import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { getAuthContext } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/logger";
import { getTaskDataClient } from "@/lib/tasks/assignees";

export const dynamic = "force-dynamic";

function getKeys(subscription) {
  return subscription?.keys || {};
}

export async function GET(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await db
    .from("web_push_subscriptions")
    .select("id, endpoint, enabled, platform, device_label, last_seen_at, last_push_at, created_at")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .order("last_seen_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    subscriptions: data || [],
    configured: Boolean(
      process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY &&
        process.env.WEB_PUSH_VAPID_PRIVATE_KEY &&
        process.env.WEB_PUSH_CONTACT_EMAIL
    ),
  });
}

export async function POST(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const subscription = body.subscription;
  const keys = getKeys(subscription);

  if (!subscription?.endpoint || !keys.p256dh || !keys.auth) {
    return NextResponse.json({ error: "Invalid web push subscription" }, { status: 400 });
  }

  const payload = {
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: request.headers.get("user-agent") || null,
    platform: body.platform || null,
    device_label: body.device_label || null,
    enabled: true,
    failure_count: 0,
    failed_at: null,
    last_seen_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("web_push_subscriptions")
    .upsert(payload, { onConflict: "endpoint" })
    .select("id, endpoint, enabled, platform, device_label, last_seen_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "web_push_subscribed",
    entityType: "web_push_subscription",
    entityId: data.id,
    metadata: { platform: payload.platform, device_label: payload.device_label },
    request,
  });

  return NextResponse.json({ subscription: data }, { status: 201 });
}

export async function DELETE(request) {
  const supabase = await createClient(request);
  const db = getTaskDataClient(supabase);
  const { user, profile } = await getAuthContext(supabase);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const endpoint = body.endpoint;
  if (!endpoint) return NextResponse.json({ error: "Subscription endpoint is required" }, { status: 400 });

  const { data: existing } = await db
    .from("web_push_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("endpoint", endpoint)
    .maybeSingle();

  const { error } = await db
    .from("web_push_subscriptions")
    .update({ enabled: false, last_seen_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor: user,
    profile,
    action: "web_push_unsubscribed",
    entityType: "web_push_subscription",
    entityId: existing?.id,
    request,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
