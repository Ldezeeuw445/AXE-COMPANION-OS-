"use client";

/**
 * ChartNewsDrawer
 *
 * Slide-out news panel for the chart page. Calls the same authenticated
 * `/api/market/context` route the Market page uses, so the result is
 * Next-cached for 5 minutes per (symbol, provider) — that means a
 * trader who toggles the panel ten times in a row only ever pays for
 * the first request, even with paid providers like Polygon in the mix.
 *
 * The drawer also surfaces:
 *   – Provider state chips so the user can see at a glance which feeds
 *     are connected (Polygon, Perigon, Finnhub, EODHD, Google fallback).
 *   – A tiny "Open Intel page →" link as a discoverability hook for the
 *     full smart-money view on /intel — keeps this drawer focused on
 *     news without duplicating the intel proxy traffic.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Newspaper, RefreshCcw, Target, X } from "lucide-react";
import type {
  MarketContext,
  NewsItem,
  ProviderStatus,
} from "@/lib/market/marketTypes";

type Props = {
  open: boolean;
  onClose: () => void;
  symbol: string;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function sentimentDot(score: number | null | undefined): { className: string; label: string } | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score > 0.15) return { className: "bg-cyan-300", label: "positive" };
  if (score < -0.15) return { className: "bg-rose-300", label: "negative" };
  return { className: "bg-white/35", label: "neutral" };
}

export function ChartNewsDrawer({ open, onClose, symbol }: Props) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/market/context", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setError("Sign in to see live news for this symbol.");
        } else if (res.status === 503) {
          setError("News service not configured yet.");
        } else {
          setError("News could not be loaded.");
        }
        return;
      }
      const ctx = (await res.json()) as MarketContext;
      setNews(Array.isArray(ctx.news) ? ctx.news : []);
      setProviders(Array.isArray(ctx.providers) ? ctx.providers : []);
      setGeneratedAt(ctx.generatedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "News request failed.");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  // Fetch only when the drawer first opens — and again whenever the
  // active symbol changes while it's open. Keeps cost predictable.
  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  // Close on ESC.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Show only news-relevant providers — the intel page covers Unusual
  // Whales separately, and FRED is a macro feed not a news feed.
  const newsProviders = providers.filter(
    (p) => p.id === "polygon" || p.id === "perigon" || p.id === "finnhub" || p.id === "eodhd",
  );
  // Which providers actually delivered fresh items in this fetch — used so
  // the chip palette reflects "is this feed working right now" instead of
  // "is the env var set". Last fetch lit them all up even when only one
  // returned data, which read like a healthy 4-feed pipeline when it
  // wasn't.
  const deliveringProviders = new Set(news.map((n) => n.provider));

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close news"
          onClick={onClose}
          className="fixed inset-0 z-[44] bg-black/45 backdrop-blur-[2px]"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-[3.25rem] z-[45] flex h-[calc(100dvh-3.25rem)] w-[92vw] max-w-[420px] flex-col border-r border-white/10 bg-[#030810]/96 shadow-[0_24px_72px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
              <Newspaper className="h-3.5 w-3.5 text-cyan-200" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-[12px] font-bold uppercase tracking-wider text-tos-text">
                {symbol} · News
              </p>
              <p className="text-[9px] uppercase tracking-[0.2em] text-tos-dim">
                AXE Intel · cached 5 min
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/55 text-tos-muted hover:text-cyan-200"
              aria-label="Refresh news"
              title="Refresh"
              disabled={loading}
            >
              <RefreshCcw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                aria-hidden
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/55 text-tos-muted hover:text-cyan-200"
              aria-label="Close news"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {/* AXE source chips — three states:
              fresh    → key configured AND delivered items in this fetch (cyan)
              ready    → key configured but no items returned (dim cyan ring)
              off      → no key configured                       (grey muted)
        */}
        {newsProviders.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/[0.05] px-3 py-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-tos-dim">
              AXE sources
            </span>
            {newsProviders.map((p) => {
              const configured = p.state === "live";
              const delivered = deliveringProviders.has(p.id);
              const tone =
                configured && delivered
                  ? "border-cyan-400/40 bg-cyan-400/12 text-cyan-100"
                  : configured
                    ? "border-white/10 bg-white/[0.025] text-tos-muted"
                    : "border-white/10 bg-white/[0.02] text-tos-dim";
              const suffix = configured && delivered ? "" : configured ? " · idle" : " · off";
              return (
                <span
                  key={p.id}
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tone}`}
                  title={
                    configured && delivered
                      ? `${p.label} delivered fresh items`
                      : configured
                        ? `${p.label} is connected but had no fresh items for ${symbol}`
                        : p.description
                  }
                >
                  {p.label}
                  {suffix}
                </span>
              );
            })}
            {generatedAt ? (
              <span className="ml-auto text-[9px] uppercase tracking-wider text-tos-dim">
                {timeAgo(generatedAt)}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && news.length === 0 ? (
            <div className="space-y-2 px-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-xl border border-white/[0.04] bg-white/[0.025]"
                />
              ))}
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-[12px] text-tos-muted">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-cyan-400/25 bg-cyan-400/8 px-3 py-1.5 text-[11px] font-semibold text-cyan-100/95 hover:bg-cyan-400/14"
              >
                Try again
              </button>
            </div>
          ) : news.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-[12px] text-tos-muted">
                No news yet for {symbol}. The feed will retry quietly without
                burning provider credit.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {news.map((n) => (
                <li key={n.id} className="px-3 py-2">
                  <NewsRow item={n} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/[0.05] px-3 py-2">
          <Link
            href={`/intel?symbol=${encodeURIComponent(symbol)}`}
            className="flex items-center justify-between gap-2 rounded-xl border border-cyan-400/22 bg-cyan-400/8 px-3 py-2 text-[11px] font-semibold text-cyan-100/95 hover:bg-cyan-400/14"
            onClick={onClose}
          >
            <span className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
              Smart-money intel for {symbol}
            </span>
            <ExternalLink className="h-3 w-3 text-cyan-300/85" aria-hidden />
          </Link>
        </div>
      </aside>
    </>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  const dot = sentimentDot(item.sentiment ?? null);
  return (
    <a
      href={item.url || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg p-1 transition hover:bg-white/[0.025]"
    >
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-tos-dim">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {dot ? (
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot.className}`}
              aria-label={dot.label}
            />
          ) : null}
          <span className="truncate">{item.source || item.provider}</span>
        </span>
        <span className="shrink-0 font-mono text-[9.5px] text-tos-dim">
          {timeAgo(item.publishedAt)}
        </span>
      </div>
      <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-tos-text">
        {item.title}
      </p>
      {item.summary ? (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-tos-muted">
          {item.summary}
        </p>
      ) : null}
    </a>
  );
}
