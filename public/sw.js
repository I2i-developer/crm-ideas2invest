self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "CRM notification",
      body: event.data?.text() || "You have a new CRM update.",
    };
  }

  const title = payload.title || "CRM notification";
  const options = {
    body: payload.body || "You have a new CRM update.",
    icon: payload.icon || "/images/logo/logo.png",
    badge: payload.badge || "/images/logo/logo.png",
    tag: payload.tag || payload.notificationId || "crm-notification",
    data: {
      url: payload.url || "/notifications",
      notificationId: payload.notificationId || null,
      type: payload.type || "system",
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url === targetUrl) return client.focus();
      }

      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
