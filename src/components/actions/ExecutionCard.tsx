"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ExecutionRequestCard } from "@/types/domain";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import {
  approveExecutionRequestAction,
  rejectExecutionRequestAction,
} from "@/app/(app)/actions/actions";

type ExecutionCardProps = {
  card: ExecutionRequestCard;
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

export function ExecutionCard({ card }: ExecutionCardProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  const run = (action: "approve" | "reject") => {
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveExecutionRequestAction(card.id)
          : await rejectExecutionRequestAction(card.id);
      if (!result.ok) {
        setFeedback({ kind: "err", text: result.message ?? "Something went wrong." });
        return;
      }
      if (result.message) {
        setFeedback({ kind: "ok", text: result.message });
      }
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
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-tos-dim">Entry</dt>
          <dd className="font-mono text-tos-text">
            {card.entry ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-tos-dim">Stop</dt>
          <dd className="font-mono text-tos-text">
            {card.stopLoss ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-tos-dim">Target</dt>
          <dd className="font-mono text-tos-text">
            {card.takeProfit ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-tos-dim">Risk</dt>
          <dd className="font-mono text-tos-text">
            {card.riskPercent != null ? `${card.riskPercent}%` : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-tos-muted">
        {card.rationale}
      </p>
      {card.warnings?.length ? (
        <ul className="mt-3 space-y-1 border-t border-tos-border pt-3 text-[11px] text-tos-risk">
          {card.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      ) : null}
      {feedback ? (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
            feedback.kind === "ok"
              ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-100/90"
              : "border-rose-400/25 bg-rose-400/[0.08] text-rose-100/90"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
      {card.status === "pending_approval" ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run("reject")}
            className="flex-1 rounded-xl border border-tos-short/30 bg-tos-short/10 py-2.5 text-xs font-medium text-tos-short transition-colors hover:bg-tos-short/18 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("approve")}
            className="tos-btn-cyan flex-1 rounded-xl py-2.5 text-xs font-semibold disabled:opacity-50"
          >
            {pending ? "Sending to MT5…" : "Place on MT5"}
          </button>
        </div>
      ) : null}
    </GlassPanel>
  );
}
