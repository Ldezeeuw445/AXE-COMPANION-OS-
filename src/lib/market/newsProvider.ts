import "server-only";
import {
  getEodhdKey,
  getFinnhubKey,
  getPerigonKey,
  getPolygonKey,
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

// ── Polygon.io ─────────────────────────────────────────────────────────────
// Polygon's `/v2/reference/news` endpoint returns curated articles with
// publisher metadata, sentiment-style descriptions and ticker tags. The
// user pays for this so we surface it as the primary feed when present —
// 5-min Next cache + per-symbol tags keeps credit usage bounded even
// when several panes ask for the same symbol.
type PolygonArticle = {
  id?: string;
  title?: string;
  description?: string;
  article_url?: string;
  published_utc?: string;
  publisher?: { name?: string; homepage_url?: string };
  tickers?: string[];
  image_url?: string;
};

/** Map our display symbol to a Polygon-friendly ticker query for news. */
function polygonTickerForSymbol(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  // Crypto pairs use the `X:` prefix (e.g. X:BTCUSD).
  if (/^(BTC|ETH|SOL|XRP|DOGE|LTC|BCH|ADA|AVAX)USD$/.test(upper)) {
    return `X:${upper}`;
  }
  // Forex pairs use `C:` prefix (e.g. C:EURUSD).
  if (/^[A-Z]{3}[A-Z]{3}$/.test(upper) && !upper.startsWith("XAU") && !upper.startsWith("XAG")) {
    return `C:${upper}`;
  }
  // Indices map to their main ETF proxy so we still get news.
  if (upper === "NAS100" || upper === "US100") return "QQQ";
  if (upper === "SPX500" || upper === "US500") return "SPY";
  if (upper === "US30") return "DIA";
  if (upper === "GER40") return "EWG";
  if (upper === "WTI") return "USO";
  if (upper === "XAUUSD") return "GLD";
  if (upper === "XAGUSD") return "SLV";
  return null;
}

async function fetchPolygonNews(opts: FetchOpts): Promise<NewsItem[]> {
  const apiKey = getPolygonKey();
  if (!apiKey) return [];

  const ticker = polygonTickerForSymbol(opts.symbol);
  const limit = String(opts.limit ?? 12);
  // First pass: with ticker filter (best signal for that symbol).
  // If the symbol can't be mapped we fall back to general latest news,
  // which still adds value as macro context.
  const params = new URLSearchParams({
    apiKey,
    limit,
    order: "desc",
    sort: "published_utc",
  });
  if (ticker) params.set("ticker", ticker);

  try {
    const res = await fetch(`https://api.polygon.io/v2/reference/news?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["news:polygon", `news:${opts.symbol}`] },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: PolygonArticle[] };
    const arr = body.results ?? [];
    if (arr.length === 0 && ticker) {
      // Retry without ticker filter so the user sees recent macro news
      // instead of a blank pane when Polygon doesn't index that symbol.
      const fallback = new URLSearchParams({
        apiKey,
        limit,
        order: "desc",
        sort: "published_utc",
      });
      const res2 = await fetch(`https://api.polygon.io/v2/reference/news?${fallback.toString()}`, {
        next: { revalidate: REVALIDATE_SECONDS, tags: ["news:polygon"] },
      });
      if (!res2.ok) return [];
      const body2 = (await res2.json()) as { results?: PolygonArticle[] };
      return mapPolygonArticles(body2.results ?? [], opts.limit ?? 12);
    }
    return mapPolygonArticles(arr, opts.limit ?? 12);
  } catch {
    return [];
  }
}

function mapPolygonArticles(arr: PolygonArticle[], limit: number): NewsItem[] {
  return arr.slice(0, limit).map((n, i) => ({
    id: makeId("polygon", n.id ?? `${n.article_url ?? i}`, n.article_url ?? `${i}`),
    title: n.title ?? "Untitled",
    summary: n.description ?? null,
    url: n.article_url ?? "",
    source: n.publisher?.name ?? "Polygon",
    publishedAt: safeIso(n.published_utc),
    provider: "polygon",
    symbols: n.tickers,
    imageUrl: n.image_url ?? null,
  }));
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

// ── Google News RSS (no-key fallback) ──────────────────────────────────────
// Public RSS endpoint, no API key required. We use it as a graceful fallback
// when none of the keyed providers above are configured / return data, so
// fresh deployments always have *something* to show on the Market page.
async function fetchGoogleNews(opts: FetchOpts): Promise<NewsItem[]> {
  const briefing = briefingForSymbol(opts.symbol);
  const queryTerms = dedupeSymbols([opts.symbol, ...briefing.keywords]).slice(0, 4);
  const query = queryTerms.length ? queryTerms.join(" OR ") : opts.symbol;

  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });

  try {
    const res = await fetch(`https://news.google.com/rss/search?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["news:gnews", `news:${opts.symbol}`] },
      headers: { "User-Agent": "Mozilla/5.0 AXE/1.0 (+axecompanion.com)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssToItems(xml).slice(0, opts.limit ?? 12);
  } catch {
    return [];
  }
}

/** Tiny RSS parser — Google News returns clean RSS 2.0, no need for a lib. */
function parseRssToItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/g;
  const matches = xml.match(itemRegex) ?? [];
  for (let i = 0; i < matches.length; i += 1) {
    const block = matches[i];
    const title = decodeXml(stripCdata(matchTag(block, "title")));
    const link = stripCdata(matchTag(block, "link"));
    const description = decodeXml(stripCdata(matchTag(block, "description")));
    const pubDate = matchTag(block, "pubDate");
    const sourceTag = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const source = sourceTag ? decodeXml(stripCdata(sourceTag[1])) : "Google News";
    if (!title || !link) continue;
    items.push({
      id: makeId("demo", `${pubDate ?? ""}-${title}`.slice(0, 80), link),
      title: title.replace(/\s*-\s*[^-]*$/, ""),
      summary: description ? description.replace(/<[^>]+>/g, "").slice(0, 240) : null,
      url: link,
      source,
      publishedAt: safeIso(pubDate || null),
      provider: "demo",
      imageUrl: null,
    });
  }
  return items;
}

function matchTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Returns news from the first provider that returns items.
 * Order: Polygon (paid) → Perigon → Finnhub → EODHD → Google News fallback.
 * Each request is cached for 5 minutes per symbol, so repeated panel opens
 * during the same session never hit the upstream API again. FMP was
 * removed — its keys repeatedly returned empty/forbidden on the user's
 * plan and Unusual Whales now covers smart-money signal on the Intel page.
 */
export async function loadNews(opts: FetchOpts): Promise<NewsItem[]> {
  const providers: Array<() => Promise<NewsItem[]>> = [
    () => fetchPolygonNews(opts),
    () => fetchPerigonNews(opts),
    () => fetchFinnhubNews(opts),
    () => fetchEodhdNews(opts),
    () => fetchGoogleNews(opts),
  ];
  for (const provider of providers) {
    const items = await provider();
    if (items.length > 0) return items;
  }
  return [];
}
