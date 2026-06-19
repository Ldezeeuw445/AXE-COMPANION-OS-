"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import Link from "next/link";
import { WorkflowActionLink } from "@/components/workflows/WorkflowActionLink";
import { WorkflowIcon } from "@/components/workflows/WorkflowIcon";
import { resolveFavoriteActions, type ResolvedWorkflowAction } from "@/lib/workflows/catalog";
import { STATUS_LABEL } from "@/lib/workflows/status";
import type { WorkflowRuntime } from "@/lib/workflows/status";

const baseBtn =
  "inline-flex items-center justify-center border bg-black/78 text-white/85 shadow-[0_4px_14px_rgba(0,0,0,0.4)] backdrop-blur active:scale-[0.97] transition-transform";

export function ChartWorkflowFavorites({
  favoriteIds,
  runtime,
  compact = false,
}: {
  favoriteIds: string[];
  runtime: WorkflowRuntime;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const actions = resolveFavoriteActions(favoriteIds, runtime);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (actions.length === 0) return null;

  const size = compact ? "h-7 w-7" : "h-8 w-8";
  const icon = compact ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${baseBtn} ${size} rounded-md border-cyan-400/25 bg-cyan-400/[0.10] text-cyan-100 hover:border-cyan-400/40`}
        aria-label="Favorite actions"
        title="Quick actions"
        aria-expanded={open}
      >
        <Star className={`${icon} fill-cyan-400/20`} />
      </button>

      {open ? (
        <div className="absolute left-1/2 top-[calc(100%+8px)] z-[80] w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/[0.10] bg-[#0a0b0e]/98 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="border-b border-white/[0.06] px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-300/85">
              Quick actions
            </p>
          </div>
          <ul className="max-h-[min(16rem,50vh)] overflow-y-auto p-1.5">
            {actions.map((action) => (
              <FavoriteRow key={action.id} action={action} onNavigate={() => setOpen(false)} />
            ))}
          </ul>
          <div className="border-t border-white/[0.06] px-3 py-2">
            <Link
              href="/settings"
              className="text-[9px] font-semibold uppercase tracking-wider text-white/45 hover:text-white/70"
              onClick={() => setOpen(false)}
            >
              Edit favorites →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FavoriteRow({
  action,
  onNavigate,
}: {
  action: ResolvedWorkflowAction;
  onNavigate: () => void;
}) {
  return (
    <li>
      <WorkflowActionLink
        action={action}
        onNavigate={onNavigate}
        className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
      >
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-black/40 text-white/55">
          <WorkflowIcon iconKey={action.iconKey} className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium text-white/90">{action.title}</span>
          <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-white/35">
            {STATUS_LABEL[action.status]}
          </span>
        </span>
      </WorkflowActionLink>
    </li>
  );
}
