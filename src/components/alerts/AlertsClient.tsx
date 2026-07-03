"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AlertItem } from "@/types/domain";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { formatDateTimeShort } from "@/lib/formatDate";
import {
  createManualAlertAction,
  deleteAlertAction,
  type AlertMutationResult,
} from "@/app/actions/alerts";

type AlertsClientProps = {
  initialAlerts: AlertItem[];
};

const FILTERS = ["all", "price", "news", "risk", "system"] as const;

export function AlertsClient({ initialAlerts }: AlertsClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [pending, startTransition] = useTransition();
  const [createState, createAction, createPending] = useActionState<
    AlertMutationResult | undefined,
    FormData
  >(createManualAlertAction, undefined);

  useEffect(() => {
    if (createState?.ok === true) {
      router.refresh();
    }
  }, [createState, router]);

  const filtered = useMemo(() => {
    if (filter === "all") return initialAlerts;
    return initialAlerts.filter((a) => a.type === filter);
  }, [filter, initialAlerts]);

  async function onDelete(id: string) {
    if (!confirm("This alert will be removed permanently.")) return;
    startTransition(async () => {
      const r = await deleteAlertAction(id);
      if (!r.ok) alert(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pb-4">
      <GlassPanel className="mb-4 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-tos-dim">
          New alert
        </p>
        <p className="mt-1 text-xs text-tos-muted">
          Set your own reminders or price hooks. AXE can also create alerts from chat.
        </p>
        <form action={createAction} className="mt-3 space-y-2">
          <label className="sr-only" htmlFor="alert-title">
            Title
          </label>
          <input
            id="alert-title"
            name="title"
            required
            maxLength={200}
            placeholder="Title"
            className="w-full rounded-xl border border-white/10 bg-[#0c0d0e]/90 px-3 py-2 text-sm text-tos-text placeholder:text-tos-dim focus:border-tos-accent-cyan/40 focus:outline-none"
          />
          <label className="sr-only" htmlFor="alert-body">
            Detail
          </label>
          <textarea
            id="alert-body"
            name="body"
            rows={2}
            maxLength={2000}
            placeholder="Detail (optional)"
            className="w-full resize-none rounded-xl border border-white/10 bg-[#0c0d0e]/90 px-3 py-2 text-sm text-tos-text placeholder:text-tos-dim focus:border-tos-accent-cyan/40 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="alert-type" className="text-[11px] text-tos-dim">
              Type
            </label>
            <select
              id="alert-type"
              name="type"
              className="rounded-lg border border-white/10 bg-[#0c0d0e]/90 px-2 py-1.5 text-xs text-tos-text"
            >
              <option value="system">Reminder / general</option>
              <option value="price">Price</option>
              <option value="news">News</option>
              <option value="risk">Risk</option>
            </select>
            <button
              type="submit"
              disabled={createPending || pending}
              className="ml-auto rounded-xl bg-tos-accent-cyan/90 px-4 py-2 text-xs font-semibold text-[#06070a] disabled:opacity-40"
            >
              {createPending ? "Saving…" : "Add alert"}
            </button>
          </div>
        </form>
        {createState?.ok === false ? (
          <p className="mt-2 text-[11px] text-tos-risk">{createState.error}</p>
        ) : null}
      </GlassPanel>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium capitalize transition-colors ${
              filter === f
                ? "border-tos-warm/40 bg-tos-warm-soft/25 text-tos-warm"
                : "border-tos-border text-tos-dim hover:text-tos-muted"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {filtered.map((a) => (
          <GlassPanel key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      a.type === "risk"
                        ? "risk"
                        : a.type === "news"
                          ? "news"
                          : a.type === "price"
                            ? "price"
                            : "neutral"
                    }
                  >
                    {a.type}
                  </Badge>
                  {!a.read ? (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        a.type === "risk"
                          ? "bg-tos-risk"
                          : a.type === "news"
                            ? "bg-tos-news"
                            : a.type === "price"
                              ? "bg-tos-price"
                              : "bg-tos-warm"
                      }`}
                    />
                  ) : null}
                </div>
                <h2 className="mt-2 text-sm font-medium text-tos-text">{a.title}</h2>
                {a.body ? (
                  <p className="mt-1 text-xs leading-relaxed text-tos-muted">{a.body}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void onDelete(a.id)}
                disabled={pending}
                className="shrink-0 rounded-lg border border-red-500/30 px-2 py-1 text-[10px] font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              >
                Delete
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-tos-border pt-3">
              <time className="text-[10px] text-tos-dim" dateTime={a.createdAt}>
                {formatDateTimeShort(a.createdAt)}
              </time>
              {a.relatedRefType === "vault_item" && a.relatedRefId ? (
                <Link
                  href="/vault"
                  className="text-[10px] font-medium text-[color:var(--icon-vault)] hover:underline"
                >
                  Open vault
                </Link>
              ) : null}
              {a.relatedRefType === "execution_request" ? (
                <Link
                  href="/actions"
                  className="text-[10px] font-medium text-[color:var(--icon-actions)] hover:underline"
                >
                  Review action
                </Link>
              ) : null}
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
