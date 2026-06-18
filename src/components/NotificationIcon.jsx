"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Check, CheckCheck, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import CrmTooltip from "@/components/CrmTooltip";
import { formatDateTimeDDMonYYYY } from "@/lib/dateFormat";

export default function NotificationIcon() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const seenToastIds = useRef(new Set());
  const toastEnabledRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    const response = await authFetch("/api/notifications?recent_days=2");
    if (!response.ok) return;
    const data = await response.json();
    setNotifications(data.notifications || []);
    setUnreadCount(data.unread_count || 0);
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    let channel;
    let mounted = true;

    async function subscribe() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted || !user?.id) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("notifications")
        .eq("id", user.id)
        .maybeSingle();

      toastEnabledRef.current = profile?.notifications?.real_time_toasts !== false;

      channel = supabase
        .channel(`task-notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "task_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            fetchNotifications();

            if (
              toastEnabledRef.current &&
              payload.eventType === "INSERT" &&
              payload.new?.id &&
              !seenToastIds.current.has(payload.new.id)
            ) {
              seenToastIds.current.add(payload.new.id);
              toast(payload.new.title || "New notification", { duration: 5000 });
            }
          }
        )
        .subscribe();
    }

    subscribe();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  async function markAllRead() {
    await authFetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setUnreadCount(0);
    fetchNotifications();
  }

  async function markRead(notificationId) {
    await authFetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: notificationId }),
    });
    fetchNotifications();
  }

  async function openNotification(notification) {
    if (!notification.is_read) {
      await markRead(notification.id);
    }

    if (notification.link_url) {
      setOpen(false);
      router.push(notification.link_url);
    }
  }

  function renderNotificationMessage(notification) {
    if (notification.notification_type === "client_birthday_today" && notification.metadata?.person_name) {
      return (
        <>
          <span className="font-semibold text-blue-700">{notification.metadata.person_name}</span>
          <span> has a birthday today.</span>
        </>
      );
    }

    if (notification.notification_type?.startsWith("insurance_renewal") && notification.metadata?.client_name) {
      return (
        <>
          <span className="font-semibold text-blue-700">{notification.metadata.client_name}</span>
          <span>{notification.message?.replace(notification.metadata.client_name, "")}</span>
        </>
      );
    }

    return notification.message;
  }

  return (
    <div className="relative shrink-0">
      <CrmTooltip content="Notifications" side="bottom">
        <button
          type="button"
          aria-label="Notifications"
          onClick={() => setOpen((current) => !current)}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-sky-50 text-blue-700 shadow-sm transition hover:bg-white hover:text-blue-700 sm:h-11 sm:w-11"
        >
          <BellRing size={20} />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </CrmTooltip>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-3 right-3 top-[4.25rem] z-50 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[min(400px,calc(100vw-2rem))]">
            <div className="border-b border-gray-100 bg-gradient-to-br from-white via-blue-50 to-emerald-50 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                    <BellRing size={19} />
                  </span>
                  <div>
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                    <p className="text-xs text-gray-500">Recent activity from the last 2 days</p>
                  </div>
                </div>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-white"
                >
                  <CheckCheck size={14} />
                  Mark all read
                </button>
              )}
            </div>
            <div className="space-y-2 overflow-y-auto bg-slate-50/70 p-3" style={{ maxHeight: "min(22rem, calc(100vh - 11rem))" }}>
              {notifications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center">
                  <Bell size={22} className="mx-auto text-gray-400" />
                  <p className="mt-2 text-sm font-medium text-gray-700">No recent notifications</p>
                  <p className="mt-1 text-xs text-gray-500">New tasks, documents, birthdays, and SIP alerts will appear here.</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`rounded-2xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      notification.is_read
                        ? "border-gray-100 bg-white"
                        : "border-blue-200 bg-gradient-to-br from-blue-50 to-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.is_read ? "bg-gray-300" : "bg-blue-600"}`} />
                      <button
                        type="button"
                        onClick={() => openNotification(notification)}
                        disabled={!notification.link_url}
                        className={`min-w-0 flex-1 text-left ${notification.link_url ? "cursor-pointer" : "cursor-default"}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{notification.title}</span>
                          {notification.link_url && <ExternalLink size={13} className="shrink-0 text-blue-600" />}
                        </span>
                        <span className="mt-1 block text-sm leading-5 text-gray-600">{renderNotificationMessage(notification)}</span>
                        <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                          {formatDateTimeDDMonYYYY(notification.created_at, "-")}
                        </span>
                      </button>

                      {!notification.is_read && (
                        <CrmTooltip content="Mark as read" side="left">
                          <button
                            type="button"
                            onClick={() => markRead(notification.id)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm hover:bg-blue-100"
                            aria-label="Mark notification as read"
                          >
                            <Check size={15} />
                          </button>
                        </CrmTooltip>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-gray-100 p-3">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="block rounded-2xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                See all notifications
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
