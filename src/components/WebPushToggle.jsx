"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellPlus, BellOff, Loader2, Send, Smartphone } from "lucide-react";
import toast from "react-hot-toast";
import CrmTooltip from "@/components/CrmTooltip";
import { authFetch } from "@/lib/authFetch";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function getDeviceLabel() {
  const userAgent = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS Safari";
  if (/Android/i.test(userAgent)) return "Android Browser";
  if (/Edg/i.test(userAgent)) return "Microsoft Edge";
  if (/Chrome/i.test(userAgent)) return "Chrome";
  if (/Safari/i.test(userAgent)) return "Safari";
  return "Browser";
}

function isIosBrowser() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

function isStandaloneApp() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function getUnsupportedReason() {
  if (typeof window === "undefined") return "Loading";
  if (!window.isSecureContext) return "Open the CRM on HTTPS. Mobile browsers do not allow web push on plain HTTP or a laptop LAN IP.";
  if (!("serviceWorker" in navigator)) return "Service workers are not supported in this browser.";
  if (!("PushManager" in window)) return "Push notifications are not supported in this browser.";
  if (!("Notification" in window)) return "Browser notifications are not supported.";
  if (isIosBrowser() && !isStandaloneApp()) {
    return "On iPhone/iPad, add the CRM to the Home Screen and open it from there to enable web push.";
  }
  return "";
}

export default function WebPushToggle({ profile = null }) {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [reason, setReason] = useState("");

  const permission = typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default";
  const tooltip = useMemo(() => {
    if (busy) return "Updating device alerts";
    if (!supported) return reason || "Device alerts unavailable";
    if (!configured) return "Web push keys are not configured";
    if (permission === "denied") return "Notifications are blocked in browser settings";
    return enabled ? "Device alerts enabled" : "Enable device alerts";
  }, [busy, configured, enabled, permission, reason, supported]);

  const refreshState = useCallback(async () => {
    const unsupportedReason = getUnsupportedReason();
    setSupported(!unsupportedReason);
    setReason(unsupportedReason);
    if (unsupportedReason) return;

    const keyResponse = await authFetch("/api/web-push/public-key");
    if (!keyResponse.ok) return;
    const keyData = await keyResponse.json();
    setConfigured(Boolean(keyData.configured && keyData.publicKey));
    setPublicKey(keyData.publicKey || "");

    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    setEnabled(Boolean(subscription));
  }, []);

  useEffect(() => {
    refreshState().catch(() => {
      setSupported(false);
      setReason("Could not check device alert support.");
    });
  }, [refreshState]);

  async function enablePush() {
    if (!supported || !configured || !publicKey) {
      toast.error(tooltip);
      return;
    }

    setBusy(true);
    try {
      const permissionResult = await Notification.requestPermission();
      if (permissionResult !== "granted") {
        toast.error("Notification permission was not granted");
        setBusy(false);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const response = await authFetch("/api/web-push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          platform: navigator.platform || null,
          device_label: getDeviceLabel(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not enable device alerts");

      setEnabled(true);
      toast.success("Device alerts enabled");
    } catch (error) {
      toast.error(error.message || "Device alerts failed");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await authFetch("/api/web-push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setEnabled(false);
      toast.success("Device alerts disabled");
    } catch (error) {
      toast.error(error.message || "Could not disable alerts");
    } finally {
      setBusy(false);
    }
  }

  async function sendTestPush(event) {
    event.stopPropagation();
    setBusy(true);
    try {
      const response = await authFetch("/api/web-push/test", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Test notification failed");
      toast.success("Test notification sent");
    } catch (error) {
      toast.error(error.message || "Test notification failed");
    } finally {
      setBusy(false);
    }
  }

  if (!profile?.id) return null;

  const Icon = busy ? Loader2 : enabled ? Smartphone : permission === "denied" ? BellOff : BellPlus;

  return (
    <CrmTooltip content={tooltip} side="bottom">
      <span className="inline-flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={enabled ? disablePush : enablePush}
          disabled={busy}
          aria-disabled={!enabled && (!supported || !configured || permission === "denied")}
          className={`inline-flex h-10 w-10 items-center justify-center transition sm:h-11 sm:w-11 ${
            enabled
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700"
          } ${!enabled && (!supported || !configured || permission === "denied") ? "opacity-60" : ""} disabled:cursor-wait disabled:opacity-70`}
          aria-label={enabled ? "Disable device alerts" : "Enable device alerts"}
        >
          <Icon size={19} className={busy ? "animate-spin" : ""} />
        </button>
        {enabled && (
          <button
            type="button"
            onClick={sendTestPush}
            disabled={busy}
            className="hidden h-10 w-9 items-center justify-center border-l border-gray-200 bg-white text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 sm:inline-flex sm:h-11"
            aria-label="Send test push notification"
          >
            <Send size={15} />
          </button>
        )}
      </span>
    </CrmTooltip>
  );
}
