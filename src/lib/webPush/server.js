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
  if (configured) return true;
  if (!isWebPushConfigured()) return false;

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
  const result = {
    configured: false,
    attempted: 0,
    sent: 0,
    failed: 0,
    disabled: 0,
    errors: [],
  };

  if (!notification?.user_id) return result;
  if (!configureWebPush()) return result;
  result.configured = true;

  const db = getTaskDataClient(supabase);
  const { data: subscriptions, error } = await db
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .eq("user_id", notification.user_id)
    .eq("enabled", true);

  if (error) {
    console.error("Web push subscription lookup failed:", error.message);
    result.errors.push(error.message);
    return result;
  }

  if (!subscriptions?.length) return result;

  const payload = buildPushPayload(notification);
  result.attempted = subscriptions.length;

  const deliveries = await Promise.allSettled(
    subscriptions.map(async (row) => {
      const pushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload, {
          TTL: 60 * 60 * 24,
          urgency: notification.notification_type === "chat_message" ? "high" : "normal",
        });
        await db
          .from("web_push_subscriptions")
          .update({
            last_push_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            failure_count: 0,
            failed_at: null,
          })
          .eq("id", row.id);
        return { sent: true };
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await disableSubscription(db, row.id, error);
          return { disabled: true, error: error?.message || "Subscription expired" };
        }

        await db
          .from("web_push_subscriptions")
          .update({
            failed_at: new Date().toISOString(),
            failure_count: Number(row.failure_count || 0) + 1,
          })
          .eq("id", row.id);
        console.error("Web push send failed:", error?.message || error);
        return { failed: true, error: error?.message || "Web push send failed" };
      }
    })
  );

  deliveries.forEach((delivery) => {
    if (delivery.status === "rejected") {
      result.failed += 1;
      result.errors.push(delivery.reason?.message || "Web push delivery rejected");
      return;
    }

    if (delivery.value?.sent) result.sent += 1;
    if (delivery.value?.disabled) result.disabled += 1;
    if (delivery.value?.failed) result.failed += 1;
    if (delivery.value?.error) result.errors.push(delivery.value.error);
  });

  return result;
}
