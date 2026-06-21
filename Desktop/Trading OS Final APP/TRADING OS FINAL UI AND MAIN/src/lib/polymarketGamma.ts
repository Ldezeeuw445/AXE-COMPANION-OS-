export type GammaSearchMarket = {
  id?: string | number;
  slug?: string;
  question?: string;
  title?: string;
  volume?: number | string;
  liquidity?: number | string;
  endDate?: string;
  closeTime?: string;
  outcomePrices?: Array<number | string>;
  outcomes?: string[];
  // unknown additional fields
  [k: string]: unknown;
};

type FetchJsonOptions = {
  signal?: AbortSignal;
};

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickProbability(m: GammaSearchMarket): number {
  const prices = Array.isArray(m.outcomePrices) ? m.outcomePrices : [];
  const outcomes = Array.isArray(m.outcomes) ? m.outcomes : [];
  if (!prices.length) return 0;

  // If we can find "Yes" outcome, use that.
  const yesIdx = outcomes.findIndex((o) => String(o).toLowerCase() === 'yes');
  const raw = yesIdx >= 0 ? prices[yesIdx] : prices[0];
  const p = num(raw);
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(1, p));
}

export function formatTimeRemaining(endIso: string | undefined): string {
  if (!endIso) return '—';
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(end)) return '—';
  const mins = Math.max(0, Math.round((end - Date.now()) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (!d) parts.push(`${m}m`);
  return parts.join(' ');
}

async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    signal: opts.signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Gamma API ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function gammaBase() {
  // In dev we proxy to avoid CORS. In prod we go direct (public API).
  return import.meta.env.DEV ? '/__polymarket_gamma' : 'https://gamma-api.polymarket.com';
}

export async function gammaPublicSearch(q: string, limit = 12, opts: FetchJsonOptions = {}) {
  const base = gammaBase();
  const url = `${base}/public-search?q=${encodeURIComponent(q)}&limit=${limit}`;
  return await fetchJson<{ markets?: GammaSearchMarket[]; events?: unknown[] }>(url, opts);
}

export function normalizeSearchMarkets(markets: GammaSearchMarket[] | undefined) {
  const list = Array.isArray(markets) ? markets : [];
  return list.map((m, idx) => {
    const question = (m.question || m.title || m.slug || `Market ${idx + 1}`) as string;
    const probability = pickProbability(m);
    const volume = num(m.volume);
    const endDate = (m.endDate || m.closeTime) as string | undefined;
    return { question, probability, volume, endDate, raw: m };
  });
}

