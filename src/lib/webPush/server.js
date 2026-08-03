import webpush from "web-push";
import { getTaskDataClient } from "@/lib/tasks/assignees";

let configured = false;

export function isWebPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY &&
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY &&
      process.env.WEB_PUSH_CONTACT_EMAIL
  );
}

export function configureWebPush() {
  if (configured || !isWebPushConfigured()) return false;

  webpush.setVapidDetails(
    `mailto:${process.env.WEB_PUSH_CONTACT_EMAIL}`,
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

function buildPushPayload(notification) {
  return JSON.stringify({
    title: notification.title || "CRM notification",
    body: notification.message || "You have a new CRM update.",
    icon: "/images/logo/logo.png",
    badge: "/images/logo/logo.png",
    tag: notification.dedupe_key || notification.id || notification.notification_type || "crm-notification",
    url: notification.link_url || "/notifications",
    notificationId: notification.id || null,
    type: notification.notification_type || "system",
    createdAt: notification.created_at || new Date().toISOString(),
    data: {
      entityType: notification.entity_type || null,
      entityId: notification.entity_id || null,
      metadata: notification.metadata || {},
    },
  });
}

async function disableSubscription(db, subscriptionId, error) {
  await db
    .from("web_push_subscriptions")
    .update({
      enabled: false,
      failed_at: new Date().toISOString(),
      failure_count: 1,
    })
    .eq("id", subscriptionId);

  console.warn("Web push subscription disabled:", error?.message || error);
}

export async function sendWebPushForNotification(supabase, notification) {
  if (!notification?.user_id || !configureWebPush()) return;

  const db = getTaskDataClient(supabase);
  const { data: subscriptions, error } = await db
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", notification.user_id)
    .eq("enabled", true);

  if (error) {
    console.error("Web push subscription lookup failed:", error.message);
    return;
  }

  if (!subscriptions?.length) return;

  const payload = buildPushPayload(notification);

  await Promise.allSettled(
    subscriptions.map(async (row) => {
      const pushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
        await db
          .from("web_push_subscriptions")
          .update({
            last_push_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            failure_count: 0,
            failed_at: null,
          })
          .eq("id", row.id);
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await disableSubscription(db, row.id, error);
          return;
        }

        await db
          .from("web_push_subscriptions")
          .update({
            failed_at: new Date().toISOString(),
            failure_count: 1,
          })
          .eq("id", row.id);
        console.error("Web push send failed:", error?.message || error);
      }
    })
  );
}
