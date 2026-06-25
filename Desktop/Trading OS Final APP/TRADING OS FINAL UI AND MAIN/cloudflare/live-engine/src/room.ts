import type {
  LiveEngineClientMessage,
  LiveEngineMessage,
  SubscribeMessage,
  UnsubscribeMessage,
} from '../../../src/lib/realtime/liveEngineTypes';

type SubKey = `${string}__${string}`;

function subKey(symbol: string, timeframe: string): SubKey {
  return `${symbol}__${timeframe}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCanonicalSymbol(input: string): string {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function polygonSymbolFor(canonicalUiSymbol: string): string {
  // UI expects e.g. "XAU/USD" (canonical UI); normalize to XAUUSD.
  const c = normalizeCanonicalSymbol(canonicalUiSymbol);
  if (c === 'XAUUSD') return 'C:XAUUSD';
  return c;
}

function polygonForexPairFor(polygonSymbol: string): string {
  // Polygon REST uses "C:XAUUSD". Forex WS uses pairs like "XAU-USD" (Massive docs).
  const s = String(polygonSymbol || '').trim().toUpperCase();
  const c = s.startsWith('C:') ? s.slice(2) : s;
  if (/^[A-Z0-9]{6}$/.test(c)) return `${c.slice(0, 3)}-${c.slice(3)}`;
  return c.replace('/', '-');
}

function firstKey(env: { POLYGON_API_KEY?: string; POLYGON_API_KEYS?: string }): string {
  const list = String(env.POLYGON_API_KEYS ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (list.length > 0) return list[0]!;
  return String(env.POLYGON_API_KEY ?? '').trim();
}

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

function isIntradayTf(tf: string): boolean {
  const t = String(tf || '').toUpperCase();
  return t === '1M' || t === '5M' || t === '15M' || t === '30M' || t === '1H' || t === '4H';
}

function dayOpenIso(tsMs: number): string {
  const d = new Date(tsMs);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function tickOutlierThresholdPct(uiSymbol: string, timeframe: string): number {
  const sym = normalizeCanonicalSymbol(uiSymbol); // e.g. XAU/USD -> XAUUSD
  const tf = String(timeframe || '').toUpperCase();

  // XAUUSD intraday: tighter guardrail to prevent vertical fake candles.
  if (sym === 'XAUUSD' && isIntradayTf(tf)) {
    if (tf === '1M' || tf === '5M') return 0.004; // 0.4%
    if (tf === '15M' || tf === '30M') return 0.006; // 0.6%
    if (tf === '1H' || tf === '4H') return 0.008; // 0.8%
    return 0.006;
  }

  return 0.015; // 1.5% default
}

type TickBucketAction = 'seed' | 'patch' | 'append' | 'ignore_stale' | 'reject_outlier';

function updateCandleFromTick(input: {
  uiSymbol: string;
  timeframe: string;
  tickTsMs: number;
  tickPrice: number;
  lastCandle?: Candle;
}): { next?: Candle; action: TickBucketAction; tickBucketTime: string } {
  const tickBucketTime = bucketStartIso(input.tickTsMs, input.timeframe);
  const last = input.lastCandle;

  // If we have no context, seed a candle in this bucket.
  if (!last) {
    return {
      action: 'seed',
      tickBucketTime,
      next: {
        time: tickBucketTime,
        open: input.tickPrice,
        high: input.tickPrice,
        low: input.tickPrice,
        close: input.tickPrice,
      },
    };
  }

  const lastTimeMs = new Date(last.time).getTime();
  const bucketMs = new Date(tickBucketTime).getTime();

  if (!Number.isFinite(lastTimeMs) || !Number.isFinite(bucketMs)) {
    return { action: 'ignore_stale', tickBucketTime };
  }

  // If tick belongs to an older bucket than our last candle, ignore as stale/out-of-order.
  if (bucketMs < lastTimeMs) {
    return { action: 'ignore_stale', tickBucketTime };
  }

  const lastClose = Number(last.close);
  const price = input.tickPrice;
  const threshold = tickOutlierThresholdPct(input.uiSymbol, input.timeframe);
  const pctJump = lastClose ? Math.abs(price - lastClose) / lastClose : 0;

  // Outlier guard: never allow a single tick to yank the candle far away from last close.
  if (Number.isFinite(lastClose) && lastClose > 0 && pctJump > threshold) {
    return { action: 'reject_outlier', tickBucketTime };
  }

  // Same bucket: patch close/high/low only.
  if (bucketMs === lastTimeMs) {
    return {
      action: 'patch',
      tickBucketTime,
      next: {
        ...last,
        high: Math.max(last.high, price),
        low: Math.min(last.low, price),
        close: price,
      },
    };
  }

  // New bucket: append a new candle, opening at previous close (not tick price).
  return {
    action: 'append',
    tickBucketTime,
    next: {
      time: tickBucketTime,
      open: last.close,
      high: Math.max(last.close, price),
      low: Math.min(last.close, price),
      close: price,
    },
  };
}

function bucketStartIso(tsMs: number, timeframe: string): string {
  const tf = String(timeframe || '').toUpperCase();
  const d = new Date(tsMs);

  const floorMs = (ms: number, bucketMs: number) => Math.floor(ms / bucketMs) * bucketMs;

  if (tf === '1M') return new Date(floorMs(tsMs, 60_000)).toISOString();
  if (tf === '5M') return new Date(floorMs(tsMs, 5 * 60_000)).toISOString();
  if (tf === '15M') return new Date(floorMs(tsMs, 15 * 60_000)).toISOString();
  if (tf === '30M') return new Date(floorMs(tsMs, 30 * 60_000)).toISOString();

  if (tf === '1H') return new Date(floorMs(tsMs, 60 * 60_000)).toISOString();
  if (tf === '2H') return new Date(floorMs(tsMs, 2 * 60 * 60_000)).toISOString();
  if (tf === '4H') return new Date(floorMs(tsMs, 4 * 60 * 60_000)).toISOString();

  if (tf === '1D' || tf === '3D') return dayOpenIso(tsMs);

  if (tf === '1W') {
    // Monday 00:00 UTC start-of-week
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    d.setUTCDate(d.getUTCDate() - dow);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }

  if (tf === '1MO') {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }

  // Fallback to daily bucket for unknown tf
  return dayOpenIso(tsMs);
}

export class LiveEngineRoom implements DurableObject {
  private sessions = new Set<WebSocket>();
  private subsBySocket = new Map<WebSocket, Set<SubKey>>();

  private upstream: WebSocket | null = null;
  private upstreamReady = false;
  private upstreamPair: string | null = null; // e.g. XAU-USD
  private upstreamUiSymbol: string | null = null; // e.g. XAU/USD
  private upstreamProviderSymbol: string | null = null; // e.g. C:XAUUSD
  private candlesBySub = new Map<SubKey, Candle>();
  private lastTickBySub = new Map<SubKey, { ts: string; price: number; bid?: number; ask?: number }>();
  private flushTimers = new Map<SubKey, number>();

  constructor(
    private state: DurableObjectState,
    private env: { POLYGON_API_KEY?: string; POLYGON_API_KEYS?: string },
  ) {}

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') return new Response('Expected websocket', { status: 426 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.sessions.add(server);
    this.subsBySocket.set(server, new Set());

    server.addEventListener('message', (evt) => {
      let msg: LiveEngineClientMessage | null = null;
      try {
        msg = JSON.parse(String(evt.data)) as LiveEngineClientMessage;
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.type === 'subscribe') this.onSubscribe(server, msg);
      else if (msg.type === 'unsubscribe') this.onUnsubscribe(server, msg);
      else if (msg.type === 'ping') {
        this.send(server, { type: 'heartbeat', ts: nowIso(), serverTime: nowIso() });
      }
    });

    const cleanup = () => {
      this.sessions.delete(server);
      this.subsBySocket.delete(server);
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    // NOTE: v1 skeleton:
    // - upstream provider connection is established on first subscribe
    this.send(server, { type: 'heartbeat', ts: nowIso(), serverTime: nowIso() });

    return new Response(null, { status: 101, webSocket: client });
  }

  private onSubscribe(ws: WebSocket, msg: SubscribeMessage) {
    const set = this.subsBySocket.get(ws);
    if (!set) return;
    set.add(subKey(msg.symbol, msg.timeframe));

    const providerSymbol = polygonSymbolFor(msg.symbol);
    const key = firstKey(this.env);
    if (!key) {
      this.send(ws, {
        type: 'provider_status',
        ts: nowIso(),
        provider: 'polygon',
        status: 'down',
        reason: 'provider_not_connected',
        symbol: msg.symbol,
        timeframe: msg.timeframe,
        providerSymbol,
      });
      return;
    }

    // Fire-and-forget: ensure upstream is connected and subscribed.
    // v1: only prove XAU/USD; one upstream pair at a time.
    void this.ensurePolygonUpstream({
      apiKey: key,
      subSymbol: msg.symbol,
      subTimeframe: msg.timeframe,
      providerSymbol,
    });
  }

  private onUnsubscribe(ws: WebSocket, msg: UnsubscribeMessage) {
    const set = this.subsBySocket.get(ws);
    if (!set) return;
    set.delete(subKey(msg.symbol, msg.timeframe));
  }

  private send(ws: WebSocket, msg: LiveEngineMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }

  private broadcast(key: SubKey, msg: LiveEngineMessage) {
    for (const ws of this.sessions) {
      const subs = this.subsBySocket.get(ws);
      if (subs?.has(key)) this.send(ws, msg);
    }
  }

  private allActiveSubsForSymbol(uiSymbol: string): Array<{ key: SubKey; timeframe: string }> {
    const out: Array<{ key: SubKey; timeframe: string }> = [];
    const seen = new Set<SubKey>();
    for (const subs of this.subsBySocket.values()) {
      for (const k of subs) {
        if (seen.has(k)) continue;
        const [sym, tf] = k.split('__');
        if (sym === uiSymbol && tf) {
          seen.add(k);
          out.push({ key: k, timeframe: tf });
        }
      }
    }
    return out;
  }

  private status(subKey0: SubKey, payload: Omit<Extract<LiveEngineMessage, { type: 'provider_status' }>, 'type' | 'ts'>) {
    this.broadcast(subKey0, { type: 'provider_status', ts: nowIso(), ...payload } as LiveEngineMessage);
  }

  private statusAll(uiSymbol: string, payload: Omit<Extract<LiveEngineMessage, { type: 'provider_status' }>, 'type' | 'ts'>) {
    for (const { key } of this.allActiveSubsForSymbol(uiSymbol)) {
      this.broadcast(key, { type: 'provider_status', ts: nowIso(), ...payload } as LiveEngineMessage);
    }
  }

  private async ensurePolygonUpstream(input: {
    apiKey: string;
    subSymbol: string;
    subTimeframe: string;
    providerSymbol: string;
  }): Promise<void> {
    const key = subKey(input.subSymbol, input.subTimeframe);
    const pair = polygonForexPairFor(input.providerSymbol);

    if (this.upstreamReady && this.upstream && this.upstreamPair === pair && this.upstream.readyState === WebSocket.OPEN) {
      this.status(key, {
        provider: 'polygon',
        status: 'healthy',
        symbol: input.subSymbol,
        timeframe: input.subTimeframe,
        providerSymbol: input.providerSymbol,
      });
      return;
    }

    // Close existing upstream if switching pairs.
    if (this.upstream) {
      try {
        this.upstream.close();
      } catch {
        // ignore
      }
      this.upstream = null;
      this.upstreamReady = false;
      this.upstreamPair = null;
    }

    this.upstreamUiSymbol = input.subSymbol;
    this.upstreamProviderSymbol = input.providerSymbol;
    this.statusAll(input.subSymbol, {
      provider: 'polygon',
      status: 'degraded',
      reason: 'network',
      symbol: input.subSymbol,
      timeframe: input.subTimeframe,
      providerSymbol: input.providerSymbol,
    });

    const upstream = new WebSocket('wss://socket.polygon.io/forex');
    this.upstream = upstream;
    this.upstreamPair = pair;

    upstream.addEventListener('open', () => {
      try {
        upstream.send(JSON.stringify({ action: 'auth', params: input.apiKey }));
        // Quotes (BBO) + minute aggregates (OHLC) for bar building.
        upstream.send(JSON.stringify({ action: 'subscribe', params: `C.${pair}` }));
        upstream.send(JSON.stringify({ action: 'subscribe', params: `CA.${pair}` }));
      } catch {
        // ignore
      }
    });

    upstream.addEventListener('message', (evt) => {
      let data: unknown;
      try {
        data = JSON.parse(String(evt.data));
      } catch {
        return;
      }
      const msgs = Array.isArray(data) ? data : [data];
      for (const m of msgs) this.onPolygonMessage(m as any);
    });

    upstream.addEventListener('close', () => {
      this.upstreamReady = false;
      if (this.upstreamUiSymbol) {
        this.statusAll(this.upstreamUiSymbol, {
          provider: 'polygon',
          status: 'down',
          reason: 'network',
          symbol: this.upstreamUiSymbol,
          timeframe: input.subTimeframe,
          providerSymbol: input.providerSymbol,
        });
      }
    });

    upstream.addEventListener('error', () => {
      this.upstreamReady = false;
      if (this.upstreamUiSymbol) {
        this.statusAll(this.upstreamUiSymbol, {
          provider: 'polygon',
          status: 'down',
          reason: 'network',
          symbol: this.upstreamUiSymbol,
          timeframe: input.subTimeframe,
          providerSymbol: input.providerSymbol,
        });
      }
    });
  }

  private onPolygonMessage(msg: any) {
    const uiSymbol = this.upstreamUiSymbol;
    const providerSymbol = this.upstreamProviderSymbol;
    if (!uiSymbol || !providerSymbol) return;

    // Polygon status messages usually include `ev: "status"`.
    if (msg?.ev === 'status') {
      const status = String(msg?.status ?? '').toLowerCase();
      if (status.includes('auth') && status.includes('success')) {
        this.upstreamReady = true;
        this.statusAll(uiSymbol, { provider: 'polygon', status: 'healthy', symbol: uiSymbol, providerSymbol });
      }
      if (status.includes('subscribed')) {
        this.upstreamReady = true;
        this.statusAll(uiSymbol, { provider: 'polygon', status: 'healthy', symbol: uiSymbol, providerSymbol });
      }
      if (status.includes('error') || status.includes('failed')) {
        this.upstreamReady = false;
        this.statusAll(uiSymbol, { provider: 'polygon', status: 'down', reason: 'unknown', symbol: uiSymbol, providerSymbol });
      }
      return;
    }

    // Forex quote (BBO) — Massive docs: ev="C", p pair, a ask, b bid, t ms
    if (msg?.ev === 'C') {
      const t = Number(msg?.t ?? Date.now());
      const bid = Number(msg?.b);
      const ask = Number(msg?.a);
      const price = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : Number.isFinite(ask) ? ask : bid;
      if (!Number.isFinite(price)) return;

      const tsIso = new Date(t).toISOString();
      for (const { key, timeframe } of this.allActiveSubsForSymbol(uiSymbol)) {
        this.lastTickBySub.set(key, {
          ts: tsIso,
          price,
          bid: Number.isFinite(bid) ? bid : undefined,
          ask: Number.isFinite(ask) ? ask : undefined,
        });
        // For intraday timeframes, update candle strictly by bucket (patch/append/ignore-stale).
        if (isIntradayTf(timeframe)) {
          const prev = this.candlesBySub.get(key);
          const { next, action, tickBucketTime } = updateCandleFromTick({
            uiSymbol,
            timeframe,
            tickTsMs: t,
            tickPrice: price,
            lastCandle: prev,
          });
          if (next) this.candlesBySub.set(key, next);

          // Only log when we *reject* or *append/seed* to debug bucket alignment issues.
          if (action !== 'patch') {
            console.log('[live-engine] tick_bucket_debug', {
              symbol: uiSymbol,
              timeframe,
              tickTime: tsIso,
              tickBucketTime,
              lastCandleTime: prev?.time ?? null,
              lastClose: prev?.close ?? null,
              tickPrice: price,
              action,
            });
          }
        }
        this.scheduleTickFlush(key, uiSymbol);
      }
      return;
    }

    // Minute aggregates — Massive docs: ev="CA", o/h/l/c/v, s start ms
    if (msg?.ev === 'CA') {
      const s = Number(msg?.s ?? Date.now());
      const o = Number(msg?.o);
      const h = Number(msg?.h);
      const l = Number(msg?.l);
      const c = Number(msg?.c);
      const v = Number(msg?.v ?? 0);
      if (![o, h, l, c].every(Number.isFinite)) return;

      for (const { key, timeframe } of this.allActiveSubsForSymbol(uiSymbol)) {
        const barTime = bucketStartIso(s, timeframe);
        const prev = this.candlesBySub.get(key);
        const next: Candle =
          prev && prev.time === barTime
            ? {
                ...prev,
                high: Math.max(prev.high, h),
                low: Math.min(prev.low, l),
                close: c,
                volume: (prev.volume ?? 0) + (Number.isFinite(v) ? v : 0),
              }
            : {
                time: barTime,
                open: o,
                high: h,
                low: l,
                close: c,
                volume: Number.isFinite(v) ? v : 0,
              };
        this.candlesBySub.set(key, next);

        this.broadcast(key, {
          type: 'bar_update',
          ts: nowIso(),
          symbol: uiSymbol,
          timeframe,
          bar: next,
          isFinal: false,
          provider: 'polygon',
        } as LiveEngineMessage);
      }
    }
  }

  private scheduleTickFlush(subKey0: SubKey, uiSymbol: string) {
    if (this.flushTimers.has(subKey0)) return;
    const handle = setTimeout(() => {
      this.flushTimers.delete(subKey0);
      const t = this.lastTickBySub.get(subKey0);
      if (!t) return;
      const [, timeframe] = subKey0.split('__');
      this.broadcast(subKey0, {
        type: 'tick',
        ts: t.ts,
        symbol: uiSymbol,
        price: t.price,
        bid: t.bid,
        ask: t.ask,
        provider: 'polygon',
      } as LiveEngineMessage);

      // For intraday TFs, also emit bar_update built from tick bucket candle.
      if (timeframe && isIntradayTf(timeframe)) {
        const candle = this.candlesBySub.get(subKey0);
        if (candle) {
          this.broadcast(subKey0, {
            type: 'bar_update',
            ts: nowIso(),
            symbol: uiSymbol,
            timeframe,
            bar: candle,
            isFinal: false,
            provider: 'polygon',
          } as LiveEngineMessage);
        }
      }
    }, 75) as unknown as number; // ~13 updates/sec max
    this.flushTimers.set(subKey0, handle);
  }

  // Placeholder for future upstream integration
  // (we use `broadcast()` above)
}

