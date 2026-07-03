"use client";

import { useCallback, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { WORKFLOW_CATEGORY_DEFS, WORKFLOW_DEFINITIONS } from "@/lib/workflows/definitions";
import { MAX_FAVORITE_WORKFLOWS, normalizeFavoriteWorkflowIds } from "@/lib/workflows/favorites";

export function FavoriteWorkflowsPicker({ initialIds }: { initialIds: string[] }) {
  const [selected, setSelected] = useState<string[]>(() => normalizeFavoriteWorkflowIds(initialIds));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const persist = useCallback(async (next: string[]) => {
    const normalized = normalizeFavoriteWorkflowIds(next);
    setSelected(normalized);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/preferences/favorite-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteIds: normalized }),
        credentials: "include",
      });
      setSaved(true);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const has = selectedSet.has(id);
      if (has && selected.length <= 1) return;
      if (!has && selected.length >= MAX_FAVORITE_WORKFLOWS) return;
      const next = has ? selected.filter((s) => s !== id) : [...selected, id];
      void persist(next);
    },
    [persist, selected, selectedSet],
  );

  const byCategory = useMemo(() => {
    return WORKFLOW_CATEGORY_DEFS.map((cat) => ({
      ...cat,
      actions: WORKFLOW_DEFINITIONS.filter((w) => w.categoryId === cat.id),
    })).filter((c) => c.actions.length > 0);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] leading-relaxed text-tos-muted">
        Pick up to <strong className="font-medium text-white/80">{MAX_FAVORITE_WORKFLOWS}</strong> actions
        for the chart quick menu. Selected: {selected.length}/{MAX_FAVORITE_WORKFLOWS}.
      </p>

      {byCategory.map((cat) => (
        <div key={cat.id}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-tos-dim">{cat.title}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {cat.actions.map((action) => {
              const on = selectedSet.has(action.id);
              const full = !on && selected.length >= MAX_FAVORITE_WORKFLOWS;
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={full}
                  onClick={() => toggle(action.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-45 ${
                    on
                      ? "border-cyan-400/40 bg-cyan-400/[0.08]"
                      : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                  }`}
                  aria-pressed={on}
                >
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${on ? "text-cyan-100" : "text-white/85"}`}>
                      {action.title}
                    </p>
                    <p className="truncate text-[10px] text-white/40">{action.description}</p>
                  </div>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                      on
                        ? "border-cyan-400/50 bg-cyan-400/20 text-cyan-200"
                        : "border-white/12 text-white/25"
                    }`}
                    aria-hidden
                  >
                    <Star className={`h-3 w-3 ${on ? "fill-current" : ""}`} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-[10px] text-tos-dim">
        {saving ? "Saving…" : saved ? "Saved — chart quick menu updated." : "Syncs across devices."}
      </p>
    </div>
  );
}
