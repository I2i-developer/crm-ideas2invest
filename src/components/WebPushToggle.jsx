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
  if (isIosBrowser()) return "iOS Safari";
  if (/Android/i.test(userAgent)) return "Android Browser";
  if (/Edg/i.test(userAgent)) return "Microsoft Edge";
  if (/Chrome/i.test(userAgent)) return "Chrome";
  if (/Safari/i.test(userAgent)) return "Safari";
  return "Browser";
}

function isIosBrowser() {
  const userAgent = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function getIosPushInstallReason() {
  return "On iPhone/iPad, open Safari, tap Share, choose Add to Home Screen, then open the CRM from that Home Screen icon to enable push alerts.";
}

function getUnsupportedReason() {
  if (typeof window === "undefined") return "Loading";
  if (!window.isSecureContext) return "Open the CRM on HTTPS. Mobile browsers do not allow web push on plain HTTP or a laptop LAN IP.";
  if (!("serviceWorker" in navigator)) return "Service workers are not supported in this browser.";
  if (isIosBrowser() && !isStandaloneApp()) {
    return getIosPushInstallReason();
  }
  if (!("PushManager" in window)) {
    if (isIosBrowser()) {
      return "This iPhone/iPad does not expose web push here. Use iOS/iPadOS 16.4 or later and open the CRM from its Home Screen icon.";
    }
    return "Push notifications are not supported in this browser.";
  }
  if (!("Notification" in window)) {
    if (isIosBrowser()) {
      return "This iPhone/iPad does not expose notification permission here. Use iOS/iPadOS 16.4 or later and open the CRM from its Home Screen icon.";
    }
    return "Browser notifications are not supported.";
  }
  return "";
}

export default function WebPushToggle({ profile = null, variant = "icon" }) {
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
  const blocked = !enabled && (!supported || !configured || permission === "denied");

  if (variant === "settings") {
    return (
      <div className="w-full min-w-0 rounded-2xl border border-gray-100 bg-white/70 p-4">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              enabled ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
            }`}>
              <Icon size={20} className={busy ? "animate-spin" : ""} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-gray-800">Device push alerts</p>
              <p className="mt-1 break-words text-sm leading-5 text-gray-500">
                Receive CRM notifications on this browser even when the CRM is not open.
              </p>
              <p className={`mt-2 break-words text-xs font-semibold ${blocked ? "text-amber-700" : enabled ? "text-emerald-700" : "text-slate-500"}`}>
                {enabled ? "Enabled on this device" : blocked ? tooltip : "Ready to enable on this device"}
              </p>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
            <button
              type="button"
              onClick={enabled ? disablePush : enablePush}
              disabled={busy}
              aria-disabled={blocked}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:w-auto ${
                enabled
                  ? "border border-red-100 bg-white text-red-600 hover:bg-red-50"
                  : "bg-blue-700 text-white hover:bg-blue-800"
              } ${blocked ? "opacity-75" : ""} disabled:cursor-wait disabled:opacity-70`}
            >
              <Icon size={16} className={busy ? "animate-spin" : ""} />
              {enabled ? "Disable alerts" : "Enable alerts"}
            </button>
            {enabled && (
              <button
                type="button"
                onClick={sendTestPush}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 sm:w-auto"
              >
                <Send size={15} />
                Send test
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <CrmTooltip content={tooltip} side="bottom">
      <span className="inline-flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={enabled ? disablePush : enablePush}
          disabled={busy}
          aria-disabled={blocked}
          className={`inline-flex h-10 w-10 items-center justify-center transition sm:h-11 sm:w-11 ${
            enabled
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700"
          } ${blocked ? "opacity-60" : ""} disabled:cursor-wait disabled:opacity-70`}
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
