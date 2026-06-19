"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ExecutionRequestCard } from "@/types/domain";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { TosNotice } from "@/components/ui/TosNotice";
import { Badge } from "@/components/ui/Badge";
import {
  approveExecutionRequestAction,
  rejectExecutionRequestAction,
} from "@/app/(app)/actions/actions";

type ExecutionCardProps = {
  card: ExecutionRequestCard;
  defaultVolume: number;
};

function statusBadge(status: ExecutionRequestCard["status"]) {
  switch (status) {
    case "pending_approval":
      return <Badge variant="warm">Pending approval</Badge>;
    case "approved":
      return <Badge variant="long">Approved</Badge>;
    case "executed":
      return <Badge variant="long">On MT5</Badge>;
    case "rejected":
      return <Badge variant="risk">Rejected</Badge>;
    case "draft":
      return <Badge>Draft</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function dirBadge(dir: ExecutionRequestCard["direction"]) {
  if (dir === "long") return <Badge variant="long">Long</Badge>;
  if (dir === "short") return <Badge variant="short">Short</Badge>;
  return <Badge>Flat</Badge>;
}

function formatOrderPreview(card: ExecutionRequestCard, defaultVolume: number): string {
  const lots = defaultVolume.toFixed(2);
  const isLong = card.direction === "long";
  const hasEntry = card.entry != null && Number.isFinite(Number(card.entry));
  if (hasEntry) {
    const side = isLong ? "buy limit" : "sell limit";
    return `${lots} lots · ${side} @ ${card.entry}`;
  }
  const side = isLong ? "market buy" : "market sell";
  return `${lots} lots · ${side}`;
}

export function ExecutionCard({ card, defaultVolume }: ExecutionCardProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const router = useRouter();

  const runApprove = () => {
    startTransition(async () => {
      const result = await approveExecutionRequestAction(card.id);
      if (!result.ok) {
        setFeedback({ kind: "err", text: result.message ?? "Something went wrong." });
        return;
      }
      if (result.message) setFeedback({ kind: "ok", text: result.message });
      router.refresh();
    });
  };

  const runReject = () => {
    startTransition(async () => {
      const result = await rejectExecutionRequestAction(card.id, rejectReason);
      if (!result.ok) {
        setFeedback({ kind: "err", text: result.message ?? "Something went wrong." });
        return;
      }
      setFeedback({ kind: "ok", text: result.message ?? "Draft rejected." });
      router.refresh();
    });
  };

  return (
    <GlassPanel className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-tos-text">
          {card.instrument}
        </span>
        {dirBadge(card.direction)}
        {statusBadge(card.status)}
      </div>

      {card.status === "pending_approval" ? (
        <p className="mt-2 font-mono text-[11px] text-cyan-300/85">
          {formatOrderPreview(card, defaultVolume)}
        </p>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-tos-dim">Entry</dt>
          <dd className="font-mono text-tos-text">{card.entry ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-tos-dim">Stop</dt>
          <dd className="font-mono text-tos-text">{card.stopLoss ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-tos-dim">Target</dt>
          <dd className="font-mono text-tos-text">{card.takeProfit ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-tos-dim">Risk</dt>
          <dd className="font-mono text-tos-text">
            {card.riskPercent != null ? `${card.riskPercent}%` : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-tos-muted">{card.rationale}</p>
      {card.warnings?.length ? (
        <ul className="mt-3 space-y-1 border-t border-tos-border pt-3 text-[11px] text-tos-risk">
          {card.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      ) : null}
      {feedback ? (
        <TosNotice
          accent={feedback.kind === "ok" ? "emerald" : "rose"}
          className="mt-3"
          title={feedback.text}
        />
      ) : null}
      {card.status === "pending_approval" ? (
        <div className="mt-4 space-y-2">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
              Why not? (optional — AXE remembers)
            </span>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. too early, risk too high, wrong session"
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white/90 outline-none placeholder:text-white/30 focus:border-cyan-400/30"
              maxLength={240}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={runReject}
              className="flex-1 rounded-xl border border-tos-short/30 bg-tos-short/10 py-2.5 text-xs font-medium text-tos-short transition-colors hover:bg-tos-short/18 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={runApprove}
              className="tos-btn-cyan flex-1 rounded-xl py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              {pending ? "Sending to MT5…" : "Place on MT5"}
            </button>
          </div>
        </div>
      ) : null}
    </GlassPanel>
  );
}
