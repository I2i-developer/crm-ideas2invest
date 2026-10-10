"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { authFetch } from "@/lib/authFetch";

const HEARTBEAT_MS = 15_000;
const IDLE_LIMIT_MS = 2 * 60_000;
const SESSION_KEY = "crm_usage_session_key";

function createSessionKey() {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `crm:${randomPart}`;
}

function getSessionKey() {
  if (typeof window === "undefined") return "";
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = createSessionKey();
  window.sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

export default function UsageSessionTracker() {
  const pathname = usePathname();
  const sessionKeyRef = useRef("");
  const lastActivityRef = useRef(Date.now());
  const lastSentAtRef = useRef(Date.now());
  const pendingRef = useRef(false);
  const queuedRef = useRef(false);

  const sendHeartbeat = useCallback(async ({ pageView = false, forceDelta = null } = {}) => {
    if (!sessionKeyRef.current) return;
    if (pendingRef.current) {
      queuedRef.current = true;
      return;
    }

    const now = Date.now();
    const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
    const isRecentlyActive = now - lastActivityRef.current <= IDLE_LIMIT_MS;
    const shouldCountTime = isVisible && isRecentlyActive;
    const elapsedSeconds = shouldCountTime ? Math.max(0, Math.round((now - lastSentAtRef.current) / 1000)) : 0;
    const delta = forceDelta ?? Math.min(elapsedSeconds, Math.round(HEARTBEAT_MS / 1000));

    if (!pageView && delta <= 0 && !shouldCountTime) {
      lastSentAtRef.current = now;
      return;
    }

    pendingRef.current = true;
    try {
      await authFetch("/api/usage-sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_key: sessionKeyRef.current,
          page_path: pathname || "",
          page_view: pageView,
          active_seconds_delta: delta,
        }),
        keepalive: true,
      });
      lastSentAtRef.current = now;
    } catch {
      // Usage tracking should never interrupt CRM work.
    } finally {
      pendingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        window.setTimeout(() => sendHeartbeat(), 250);
      }
    }
  }, [pathname]);

  useEffect(() => {
    sessionKeyRef.current = getSessionKey();

    function markActivity() {
      lastActivityRef.current = Date.now();
    }

    const activityEvents = ["pointerdown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity));
    };
  }, []);

  useEffect(() => {
    if (!sessionKeyRef.current) sessionKeyRef.current = getSessionKey();
    sendHeartbeat({ pageView: true, forceDelta: 0 });
  }, [pathname, sendHeartbeat]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        lastActivityRef.current = Date.now();
        sendHeartbeat({ forceDelta: 0 });
      } else {
        sendHeartbeat();
      }
    }

    function handleUsageFlush() {
      sendHeartbeat();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleUsageFlush);
    window.addEventListener("beforeunload", handleUsageFlush);
    window.addEventListener("crm:usage-flush", handleUsageFlush);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleUsageFlush);
      window.removeEventListener("beforeunload", handleUsageFlush);
      window.removeEventListener("crm:usage-flush", handleUsageFlush);
    };
  }, [sendHeartbeat]);

  return null;
}
