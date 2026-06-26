"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { AxeWordmark } from "@/components/brand/AxeWordmark";
import { AxeTriangle } from "@/components/brand/AxeTriangle";
import {
  getLiveStatus,
  subscribeLiveStatus,
  type LiveStatus,
} from "@/lib/liveStatusBus";
import { useEffect, useState } from "react";

const INTEL_PARAM = "intel";

function useLiveTone() {
  const [status, setStatus] = useState<LiveStatus>(() => getLiveStatus());
  useEffect(() => subscribeLiveStatus(setStatus), []);

  if (status.severity === "blocking") return "red";
  if (status.severity === "inactive") return "idle";
  if (status.severity === "degraded") return "amber";
  if (status.severity === "fresh" || status.allLive === true) return "green";
  if (status.allLive === false) return "amber";
  return "idle";
}

function StatusDot({ tone }: { tone: "green" | "red" | "amber" | "idle" }) {
  const dotClass =
    tone === "green"
      ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
      : tone === "red"
        ? "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]"
        : tone === "amber"
          ? "bg-amber-300/85"
          : "bg-white/22";

  return (
    <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
      {tone === "green" || tone === "red" ? (
        <span
          className={`absolute inset-0 rounded-full animate-ping ${tone === "red" ? "bg-rose-400/70" : "bg-emerald-400/70"}`}
          aria-hidden
        />
      ) : null}
      <span
        className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotClass}`}
        aria-hidden
      />
    </span>
  );
}

export function useChatIntelMode() {
  const searchParams = useSearchParams();
  return searchParams.get(INTEL_PARAM) === "1";
}

export function ChatHeaderSwitch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isChat = pathname === "/chat" || pathname.startsWith("/chat/");
  const intelMode = useChatIntelMode();
  const tone = useLiveTone();

  const title = useMemo(() => {
    const parts: string[] = [];
    parts.push(intelMode ? "AXE Intelligence — live intel mode" : "AXE — chat mode");
    parts.push("Tap to switch");
    return parts.join(" · ");
  }, [intelMode]);

  const toggle = useCallback(() => {
    if (!isChat) return;
    const params = new URLSearchParams(searchParams.toString());
    if (intelMode) {
      params.delete(INTEL_PARAM);
    } else {
      params.set(INTEL_PARAM, "1");
    }
    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    router.replace(newUrl, { scroll: false });
  }, [isChat, intelMode, pathname, router, searchParams]);

  if (!isChat) return <AxeWordmark size="xs" />;

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 select-none rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.05]"
      title={title}
      aria-label={title}
    >
      <StatusDot tone={tone} />
      {intelMode ? (
        <span className="inline-flex items-center gap-1.5">
          <AxeTriangle size={18} />
          <span
            className="font-extrabold uppercase tracking-[0.18em] text-[11px]"
            style={{ color: "#00d4f5" }}
          >
            AXE Intelligence
          </span>
        </span>
      ) : (
        <AxeWordmark size="xs" />
      )}
    </button>
  );
}
