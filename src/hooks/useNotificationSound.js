"use client";

import { useCallback, useEffect, useRef } from "react";
import { playNotificationSound, unlockNotificationAudio } from "@/lib/notifications/sound";

export function useNotificationSound(userId, enabled = true) {
  const allowed = useRef(enabled);
  useEffect(() => { allowed.current = enabled; }, [enabled]);
  useEffect(() => {
    if (!userId) return;
    const unlock = () => { if (allowed.current) void unlockNotificationAudio(); };
    const preference = (event) => { if (event.detail?.userId === userId) allowed.current = event.detail.enabled; };
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
    window.addEventListener("crm-notification-sound", preference);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      window.removeEventListener("crm-notification-sound", preference);
    };
  }, [userId]);
  return useCallback((notificationId) => {
    if (allowed.current) void playNotificationSound(userId, notificationId).catch(() => {});
  }, [userId]);
}
