"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AlertItem } from "@/types/domain";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { formatDateTimeShort } from "@/lib/formatDate";

type AlertsClientProps = {
  initialAlerts: AlertItem[];
};

const FILTERS = ["all", "price", "news", "risk"] as const;

export function AlertsClient({ initialAlerts }: AlertsClientProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return initialAlerts;
    return initialAlerts.filter((a) => a.type === filter);
  }, [filter, initialAlerts]);

  return (
    <>
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
              <div>
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
                <h2 className="mt-2 text-sm font-medium text-tos-text">
                  {a.title}
                </h2>
                {a.body ? (
                  <p className="mt-1 text-xs leading-relaxed text-tos-muted">
                    {a.body}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-tos-border pt-3">
              <time
                className="text-[10px] text-tos-dim"
                dateTime={a.createdAt}
              >
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
    </>
  );
}
