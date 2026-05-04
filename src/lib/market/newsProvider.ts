import "server-only";
import {
  getEodhdKey,
  getFinnhubKey,
  getFmpKey,
  getPerigonKey,
} from "@/lib/market/providerStatus";
import type { NewsItem, ProviderId } from "@/lib/market/marketTypes";
import { briefingForSymbol, dedupeSymbols } from "@/lib/market/symbolContext";

const REVALIDATE_SECONDS = 60 * 5; // 5 min — news churns fast but we don't want to hammer

type FetchOpts = {
  symbol: string;
  watchlist: string[];
  limit?: number;
};

function makeId(provider: ProviderId, raw: string | number, fallbackUrl: string): string {
  return `${provider}:${String(raw || fallbackUrl).slice(0, 80)}`;
}

function safeIso(input: string | number | null | undefined): string {
  if (!input) return new Date().toISOString();
  if (typeof input === "number") {
    const ms = input < 1e12 ? input * 1000 : input;
    return new Date(ms).toISOString();
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ── FMP Ultimate ────────────────────────────────────────────────────────────
type FmpStockNews = {
  symbol?: string;
  publishedDate?: string;
  title?: string;
  text?: string;
  site?: string;
  url?: string;
  image?: string;
};

async function fetchFmpNews(opts: FetchOpts): Promise<NewsItem[]> {
  const apiKey = getFmpKey();
  if (!apiKey) return [];
  const briefing = briefingForSymbol(opts.symbol);
  const symbols = dedupeSymbols([opts.symbol, ...opts.watchlist, ...briefing.providerSymbols]).join(",");

  // Use the v3 stock_news endpoint — works for symbols (incl. forex/crypto formats supported on FMP).
  const params = new URLSearchParams({
    tickers: symbols,
    limit: String(opts.limit ?? 12),
    apikey: apiKey,
  });
  try {
    const res = await fetch(`https://financialmodelingprep.com/api/v3/stock_news?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["news:fmp", `news:${opts.symbol}`] },
    });
    if (!res.ok) return [];
    const arr = (await res.json()) as FmpStockNews[];
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, opts.limit ?? 12).map((n, i) => ({
      id: makeId("fmp", `${n.symbol ?? ""}-${n.publishedDate ?? i}`, n.url ?? `${i}`),
      title: n.title ?? "Untitled",
      summary: n.text ? n.text.slice(0, 320) : null,
      url: n.url ?? "",
      source: n.site ?? "FMP",
      publishedAt: safeIso(n.publishedDate),
      provider: "fmp",
      symbols: n.symbol ? [n.symbol] : undefined,
      imageUrl: n.image ?? null,
    }));
  } catch {
    return [];
  }
}

// ── Perigon ────────────────────────────────────────────────────────────────
type PerigonArticle = {
  articleId?: string;
  title?: string;
  description?: string;
  url?: string;
  pubDate?: string;
  source?: { domain?: string };
  topics?: Array<{ name?: string }>;
  sentiment?: { positive?: number; negative?: number; neutral?: number };
  imageUrl?: string;
};

async function fetchPerigonNews(opts: FetchOpts): Promise<NewsItem[]> {
  const apiKey = getPerigonKey();
  if (!apiKey) return [];
  const briefing = briefingForSymbol(opts.symbol);
  const keywords = dedupeSymbols([
    opts.symbol,
    ...opts.watchlist,
    ...briefing.keywords.map((k) => k.toUpperCase()),
  ]).join(" OR ");

  const params = new URLSearchParams({
    apiKey,
    q: keywords || opts.symbol,
    size: String(opts.limit ?? 12),
    sortBy: "date",
    language: "en",
    showReprints: "false",
  });
  try {
    const res = await fetch(`https://api.goperigon.com/v1/all?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["news:perigon", `news:${opts.symbol}`] },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { articles?: PerigonArticle[] };
    const arr = body.articles ?? [];
    return arr.slice(0, opts.limit ?? 12).map((n, i) => {
      const pos = n.sentiment?.positive ?? 0;
      const neg = n.sentiment?.negative ?? 0;
      const sentiment = pos === 0 && neg === 0 ? null : pos - neg;
      return {
        id: makeId("perigon", n.articleId ?? `${n.url ?? i}`, n.url ?? `${i}`),
        title: n.title ?? "Untitled",
        summary: n.description ?? null,
        url: n.url ?? "",
        source: n.source?.domain ?? "Perigon",
        publishedAt: safeIso(n.pubDate),
        provider: "perigon",
        sentiment,
        imageUrl: n.imageUrl ?? null,
      };
    });
  } catch {
    return [];
  }
}

// ── Finnhub ────────────────────────────────────────────────────────────────
type FinnhubArticle = {
  category?: string;
  datetime?: number;
  headline?: string;
  id?: number;
  image?: string;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
};

async function fetchFinnhubNews(opts: FetchOpts): Promise<NewsItem[]> {
  const apiKey = getFinnhubKey();
  if (!apiKey) return [];
  const params = new URLSearchParams({
    category: opts.symbol.toUpperCase().includes("BTC") || opts.symbol.toUpperCase().includes("ETH") ? "crypto" : "forex",
    token: apiKey,
  });
  try {
    const res = await fetch(`https://finnhub.io/api/v1/news?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["news:finnhub"] },
    });
    if (!res.ok) return [];
    const arr = (await res.json()) as FinnhubArticle[];
    return arr.slice(0, opts.limit ?? 12).map((n, i) => ({
      id: makeId("finnhub", n.id ?? i, n.url ?? `${i}`),
      title: n.headline ?? "Untitled",
      summary: n.summary ?? null,
      url: n.url ?? "",
      source: n.source ?? "Finnhub",
      publishedAt: safeIso(n.datetime ?? null),
      provider: "finnhub",
      symbols: n.related ? n.related.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      imageUrl: n.image ?? null,
    }));
  } catch {
    return [];
  }
}

// ── EODHD ──────────────────────────────────────────────────────────────────
type EodhdArticle = {
  date?: string;
  title?: string;
  content?: string;
  link?: string;
  symbols?: string[];
};

async function fetchEodhdNews(opts: FetchOpts): Promise<NewsItem[]> {
  const apiKey = getEodhdKey();
  if (!apiKey) return [];
  const sym = opts.symbol.toUpperCase();
  const params = new URLSearchParams({
    s: sym,
    api_token: apiKey,
    fmt: "json",
    limit: String(opts.limit ?? 12),
  });
  try {
    const res = await fetch(`https://eodhd.com/api/news?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["news:eodhd", `news:${opts.symbol}`] },
    });
    if (!res.ok) return [];
    const arr = (await res.json()) as EodhdArticle[];
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, opts.limit ?? 12).map((n, i) => ({
      id: makeId("eodhd", `${n.date ?? ""}-${n.title ?? i}`, n.link ?? `${i}`),
      title: n.title ?? "Untitled",
      summary: n.content ? n.content.slice(0, 320) : null,
      url: n.link ?? "",
      source: "EODHD",
      publishedAt: safeIso(n.date),
      provider: "eodhd",
      symbols: n.symbols,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns news from the first configured provider that returns items.
 * Order: FMP Ultimate → Perigon → Finnhub → EODHD. Empty array if none configured / all empty.
 */
export async function loadNews(opts: FetchOpts): Promise<NewsItem[]> {
  const providers: Array<() => Promise<NewsItem[]>> = [
    () => fetchFmpNews(opts),
    () => fetchPerigonNews(opts),
    () => fetchFinnhubNews(opts),
    () => fetchEodhdNews(opts),
  ];
  for (const provider of providers) {
    const items = await provider();
    if (items.length > 0) return items;
  }
  return [];
}
