"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { ChevronDown } from "lucide-react";
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

function IntelStatusMark({ intelMode }: { intelMode: boolean }) {
  if (intelMode) {
    return (
      <span className="relative inline-flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden>
        <span className="absolute inset-0 flex items-center justify-center animate-ping opacity-50">
          <AxeTriangle size={10} />
        </span>
        <AxeTriangle size={10} />
      </span>
    );
  }
  return null;
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
    const qs = params.toString();
    router.replace(qs ? `/chat?${qs}` : "/chat", { scroll: false });
  }, [isChat, intelMode, router, searchParams]);

  if (!isChat)
    return (
      <Link href="/chat" className="inline-flex items-center" aria-label="Open AXE chat">
        <AxeWordmark size="xs" />
      </Link>
    );

  return (
    <button
      type="button"
      onClick={toggle}
      className="group inline-flex items-center gap-1 select-none rounded px-1 py-0.5 transition-colors hover:bg-white/[0.03]"
      title={title}
      aria-label={title}
    >
      {intelMode ? <IntelStatusMark intelMode /> : <StatusDot tone={tone} />}
      {intelMode ? (
        <span
          className="select-none text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#00d4f5]"
          style={{ textShadow: "0 0 10px rgba(0,212,245,0.35)" }}
        >
          AXE
        </span>
      ) : (
        <AxeWordmark size="xs" />
      )}
      <ChevronDown className="h-3 w-3 text-white/30" />
    </button>
  );
}
