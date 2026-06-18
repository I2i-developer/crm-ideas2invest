"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

function formatTime(value) {
  return formatDateTimeDDMonYYYY(value, "-");
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  async function loadNotifications() {
    setLoading(true);
    const response = await authFetch("/api/notifications");
    const data = await response.json();
    if (response.ok) {
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    }
    setLoading(false);
  }

  async function markRead(notificationId) {
    await authFetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: notificationId }),
    });
    loadNotifications();
  }

  async function markAllRead() {
    await authFetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    loadNotifications();
  }

  async function openNotification(notification) {
    if (!notification.is_read) {
      await markRead(notification.id);
    }

    if (notification.link_url) {
      router.push(notification.link_url);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">{unreadCount} unread notification(s)</p>
        </div>
        <button onClick={markAllRead} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:bg-gray-300" disabled={!unreadCount}>
          Mark all read
        </button>
      </div>

      <div className="glass-card p-5 space-y-3">
        {loading ? (
          <p className="text-sm text-gray-500">Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-gray-500">No notifications.</p>
        ) : (
          notifications.map((notification) => (
            <div key={notification.id} className={`rounded-xl border bg-white p-4 ${notification.is_read ? "opacity-70" : "border-blue-200"}`}>
              <div className="flex justify-between gap-4">
                <button
                  type="button"
                  onClick={() => openNotification(notification)}
                  disabled={!notification.link_url}
                  className={`min-w-0 flex-1 text-left ${notification.link_url ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{notification.title}</span>
                    {notification.link_url && <ExternalLink size={14} className="text-blue-600" />}
                  </span>
                  <span className="mt-1 block text-sm text-gray-600">{notification.message}</span>
                  <span className="mt-2 block text-xs text-gray-400">{formatTime(notification.created_at)}</span>
                </button>
                <div className="flex flex-col gap-2 items-end">
                  {!notification.is_read && (
                    <button onClick={() => markRead(notification.id)} className="text-sm text-gray-600 hover:text-gray-900">
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
