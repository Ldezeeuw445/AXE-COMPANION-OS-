"use client";

import Link from "next/link";
import { MessageSquare, Star } from "lucide-react";
import { WorkflowActionLink } from "@/components/workflows/WorkflowActionLink";
import { WorkflowIcon } from "@/components/workflows/WorkflowIcon";
import {
  buildWorkflowCatalog,
  resolveFavoriteActions,
  type ResolvedWorkflowAction,
} from "@/lib/workflows/catalog";
import { STATUS_CLASS, STATUS_LABEL, type WorkflowRuntime } from "@/lib/workflows/status";

type Props = {
  runtime: WorkflowRuntime;
  favoriteIds?: string[];
};

export function AxeWorkflowsHub({ runtime, favoriteIds = [] }: Props) {
  const categories = buildWorkflowCatalog(runtime);
  const favorites = resolveFavoriteActions(favoriteIds, runtime);
  const favoriteSet = new Set(favoriteIds);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
            AXE Quick workflows
          </p>
          <p className="mt-0.5 text-xs text-tos-muted">
            One-tap intelligence — pin up to 5 favorites in Settings for chart quick access.
          </p>
        </div>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-tos-muted hover:border-white/[0.12] hover:text-tos-text"
        >
          <MessageSquare className="h-3 w-3" />
          Open Chat
        </Link>
      </div>

      {favorites.length > 0 ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/85">
              <Star className="h-3 w-3 fill-cyan-400/30 text-cyan-300/80" aria-hidden />
              Your favorites
            </h3>
            <Link href="/settings" className="text-[10px] text-tos-dim hover:text-tos-muted">
              Edit in Settings →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.map((a) => (
              <ActionTile key={`fav-${a.id}`} action={a} isFavorite />
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-5">
        {categories.map((cat) => (
          <div key={cat.id}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">{cat.title}</h3>
              <span className="text-[10.5px] text-tos-dim/85">{cat.subtitle}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cat.actions.map((a) => (
                <ActionTile key={a.id} action={a} isFavorite={favoriteSet.has(a.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionTile({
  action,
  isFavorite,
}: {
  action: ResolvedWorkflowAction;
  isFavorite?: boolean;
}) {
  const blocked = action.status !== "ready";
  return (
    <WorkflowActionLink
      action={action}
      className="group flex w-full flex-col gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.05]"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-[#0e0f12]/95 text-white/60">
          <WorkflowIcon iconKey={action.iconKey} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-tos-text">{action.title}</span>
        {isFavorite ? (
          <Star className="h-3 w-3 shrink-0 fill-cyan-400/25 text-cyan-300/75" aria-label="Favorite" />
        ) : null}
      </div>
      <p className="line-clamp-2 text-[10.5px] text-tos-muted">{action.description}</p>
      <div className="mt-1 flex items-center justify-between">
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${STATUS_CLASS[action.status]}`}
        >
          {STATUS_LABEL[action.status]}
        </span>
        {blocked ? null : <span className="text-[9px] text-tos-dim/80 group-hover:text-white/60">Run →</span>}
      </div>
    </WorkflowActionLink>
  );
}
