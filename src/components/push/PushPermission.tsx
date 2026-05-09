"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
    credentials: "include",
    body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
  });

  return res.ok;
}

type Status = "unknown" | "granted" | "denied" | "requesting";

type Platform = {
  isIos: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  pushSupported: boolean;
};

function detectPlatform(): Platform {
  if (typeof window === "undefined") {
    return { isIos: false, isAndroid: false, isStandalone: false, pushSupported: false };
  }
  const ua = navigator.userAgent || "";
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  // iOS reports standalone via navigator.standalone; Android/Chrome via media query.
  const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mqStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const isStandalone = navStandalone || mqStandalone;
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window;
  return { isIos, isAndroid, isStandalone, pushSupported };
}

export function PushPermission() {
  const [status, setStatus] = useState<Status>("unknown");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [testState, setTestState] = useState<"idle" | "sending" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Probe permission + subscription state in one pass. This runs asynchronously
  // off the render so we don't trip the React 19 set-state-in-effect rule.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = detectPlatform();
      if (!cancelled) setPlatform(p);

      if (!("Notification" in window)) {
        if (!cancelled) {
          setStatus("denied");
          setSubscribed(false);
        }
        return;
      }

      const perm = Notification.permission;
      let nextStatus: Status = "unknown";
      if (perm === "granted") nextStatus = "granted";
      else if (perm === "denied") nextStatus = "denied";

      let sub = false;
      if (perm === "granted" && "serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          sub = !!existing;
        } catch {
          sub = false;
        }
      }

      if (!cancelled) {
        setStatus(nextStatus);
        setSubscribed(sub);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = useCallback(async () => {
    if (!("Notification" in window)) return;
    setStatus("requesting");
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        const ok = await subscribeUser();
        if (!mounted.current) return;
        setStatus("granted");
        setSubscribed(ok);
      } else {
        if (!mounted.current) return;
        setStatus("denied");
      }
    } catch {
      if (!mounted.current) return;
      setStatus("denied");
    }
  }, []);

  const handleDisable = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } finally {
      if (mounted.current) setSubscribed(false);
    }
  }, []);

  const handleTest = useCallback(async () => {
    setTestState("sending");
    setTestMessage(null);
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        credentials: "include",
      });
      const data: { ok?: boolean; sent?: number; total?: number; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!mounted.current) return;
      if (res.ok && (data.sent ?? 0) > 0) {
        setTestState("ok");
        setTestMessage(`Sent to ${data.sent}/${data.total ?? data.sent} device${data.total === 1 ? "" : "s"}.`);
      } else if (res.ok) {
        setTestState("fail");
        setTestMessage("No active subscription found on this device. Try Subscribe again.");
      } else {
        setTestState("fail");
        setTestMessage(data.error ?? "Could not send test push.");
      }
    } catch (err) {
      if (!mounted.current) return;
      setTestState("fail");
      setTestMessage(err instanceof Error ? err.message : "Network error.");
    }
  }, []);

  // ── iOS guidance ──────────────────────────────────────────────────────────
  // iOS Safari (16.4+) only delivers web push when the user has installed the
  // PWA via "Add to Home Screen". If we detect iOS in the browser tab, point
  // the user at the install step before showing the enable button.
  if (platform?.isIos && !platform.isStandalone) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-tos-muted">
          iOS only sends push notifications to AXE when it&apos;s installed on
          your home screen. One-time setup:
        </p>
        <ol className="ml-4 list-decimal space-y-1 text-[11px] text-tos-muted">
          <li>
            Tap the share icon{" "}
            <span className="rounded border border-white/10 px-1 py-0.5 font-mono text-[10px] text-tos-text">
              ⎙
            </span>{" "}
            in Safari.
          </li>
          <li>Choose &quot;Add to Home Screen&quot;.</li>
          <li>Open AXE from the home screen, then come back to Settings.</li>
        </ol>
        <p className="text-[10px] text-tos-dim">
          Once installed, you can enable lock-screen alerts with sound and vibration here.
        </p>
      </div>
    );
  }

  if (!platform?.pushSupported) {
    return (
      <p className="text-xs text-tos-muted">
        This browser doesn&apos;t support web push notifications. Try Chrome on
        Android or install AXE on iOS via Safari → Add to Home Screen.
      </p>
    );
  }

  // ── Permission denied — no programmatic recovery ─────────────────────────
  if (status === "denied") {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-tos-muted">Push notifications are blocked in your system settings.</p>
        <p className="text-[10px] text-tos-dim">
          {platform?.isIos
            ? "Open Settings → Notifications → AXE Companion → Allow Notifications."
            : "Open browser site settings → Notifications → Allow this site."}
        </p>
      </div>
    );
  }

  // ── Granted + subscribed — show manage panel + test button ──────────────
  if (status === "granted" && subscribed) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-tos-text">Push notifications</p>
            <p className="mt-0.5 text-[10px] text-emerald-300/85">
              Active on this device · lock screen + sound + vibration
            </p>
          </div>
          <button
            type="button"
            onClick={handleDisable}
            className="rounded border border-white/10 px-2 py-1 text-[10px] font-medium text-tos-dim transition-colors hover:text-tos-short"
          >
            Turn off
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testState === "sending"}
            className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-100/95 transition-colors hover:bg-cyan-500/15 disabled:opacity-60"
          >
            {testState === "sending" ? "Sending…" : "Send test notification"}
          </button>
          {testMessage ? (
            <p
              className={`text-[10px] ${
                testState === "ok" ? "text-emerald-300/90" : "text-amber-200/85"
              }`}
            >
              {testMessage}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Granted but not subscribed (cleared cache, new install) ──────────────
  if (status === "granted" && subscribed === false) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-tos-text">Push notifications</p>
          <p className="mt-0.5 text-[10px] text-tos-muted">
            Permission granted — re-subscribe to receive alerts on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={handleEnable}
          className="rounded border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-100/95 transition-colors hover:bg-cyan-500/15"
        >
          Subscribe
        </button>
      </div>
    );
  }

  // ── Requesting (transient) ───────────────────────────────────────────────
  if (status === "requesting") {
    return <p className="text-xs text-tos-muted">Waiting for permission…</p>;
  }

  // ── Default: not yet asked ───────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-tos-muted">
        Get real-time alerts on this device — price alerts, AXE pings, position-risk
        and high-impact news. Notifications hit the lock screen with sound and
        vibration, even when the app isn&apos;t open.
      </p>
      <button
        type="button"
        onClick={handleEnable}
        className="w-full rounded border border-cyan-400/35 bg-cyan-500/10 py-2.5 text-xs font-semibold text-cyan-100/95 transition-colors hover:bg-cyan-500/18"
      >
        Enable push notifications
      </button>
      {platform?.isStandalone ? (
        <p className="text-[10px] text-tos-dim">
          Installed as an app — alerts behave like native notifications.
        </p>
      ) : platform?.isAndroid ? (
        <p className="text-[10px] text-tos-dim">
          Tip: install AXE from the browser menu (&quot;Install app&quot;) for the
          smoothest delivery on Android.
        </p>
      ) : null}
    </div>
  );
}
