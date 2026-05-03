"use client";

import { useState, useEffect } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

async function subscribeUser(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  const reg = await navigator.serviceWorker.ready;

  // Get VAPID public key
  const vapidRes = await fetch("/api/push/vapid");
  if (!vapidRes.ok) return false;
  const { publicKey } = await vapidRes.json();

  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const sub = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: sub.keys,
    }),
  });

  return res.ok;
}

type Status = "unknown" | "granted" | "denied" | "requesting";

export function PushPermission() {
  const [status, setStatus] = useState<Status>("unknown");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!("Notification" in window)) return;
    const perm = Notification.permission;
    if (perm === "granted") {
      setStatus("granted");
      // Check if we have a subscription
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.pushManager.getSubscription().then((sub) => {
            setSubscribed(!!sub);
          });
        });
      }
    } else if (perm === "denied") {
      setStatus("denied");
    } else {
      setStatus("unknown");
    }
  }, []);

  async function handleEnable() {
    if (!("Notification" in window)) return;
    setStatus("requesting");
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      const ok = await subscribeUser();
      setStatus("granted");
      setSubscribed(ok);
    } else {
      setStatus("denied");
    }
  }

  async function handleDisable() {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setSubscribed(false);
  }

  // Already granted + subscribed — show manage option
  if (status === "granted" && subscribed) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-tos-text">Push notifications</p>
          <p className="text-[10px] text-tos-muted mt-0.5">Active on this device</p>
        </div>
        <button
          onClick={handleDisable}
          className="text-[10px] font-medium text-tos-dim hover:text-tos-short transition-colors px-2 py-1 rounded border border-white/10"
        >
          Turn off
        </button>
      </div>
    );
  }

  // Granted but not subscribed (e.g. cleared cache)
  if (status === "granted" && !subscribed) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-tos-text">Push notifications</p>
          <p className="text-[10px] text-tos-muted mt-0.5">Permission granted — re-subscribe to receive alerts</p>
        </div>
        <button
          onClick={handleEnable}
          className="text-[10px] font-medium text-[color:var(--color-teal)] hover:opacity-80 transition-opacity px-2 py-1 rounded border border-[color:var(--color-teal)]/30"
        >
          Subscribe
        </button>
      </div>
    );
  }

  // Denied — can't do anything programmatically
  if (status === "denied") {
    return (
      <div>
        <p className="text-xs text-tos-muted">Push notifications are blocked in your browser settings.</p>
        <p className="text-[10px] text-tos-dim mt-1">
          Open browser settings → Site permissions → Notifications → Allow this site.
        </p>
      </div>
    );
  }

  // Requesting
  if (status === "requesting") {
    return (
      <div>
        <p className="text-xs text-tos-muted">Waiting for permission...</p>
      </div>
    );
  }

  // Default: not yet asked
  return (
    <div className="space-y-3">
      <p className="text-xs text-tos-muted">
        Get real-time alerts on this device — price alerts, AXE notifications, and high-impact news.
        Works like WhatsApp: instant, even when the tab is in the background.
      </p>
      <button
        onClick={handleEnable}
        className="w-full rounded border border-[color:var(--color-teal)]/40 bg-[color:var(--color-teal)]/10 py-2 text-xs font-medium text-[color:var(--color-teal)] hover:bg-[color:var(--color-teal)]/20 transition-colors"
      >
        Enable push notifications
      </button>
      <p className="text-[10px] text-tos-dim">
        On iPhone: add this app to your home screen first (share icon → &quot;Add to Home Screen&quot;), then enable notifications here.
      </p>
    </div>
  );
}
