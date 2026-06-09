/**
 * SnapshotBuffer — collects the latest bid/ask for every symbol and
 * flushes to Supabase `chart_live_snapshots` every 3 seconds.
 *
 * This gives the Quotes page (and any other server-rendered page) access
 * to near-real-time prices without the browser needing a live chart open.
 */

const FLUSH_INTERVAL_MS = 3_000;

type PriceEntry = {
  display: string;
  broker: string;
  bid: number | null;
  ask: number | null;
  price: number | null;
  time: string | null;
};

function log(level: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  const prefix = `[snapshot-buffer ${ts}] ${level.toUpperCase()}:`;
  if (level === "error" || level === "warn") {
    console.error(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

export class SnapshotBuffer {
  private buffer: Map<string, PriceEntry> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushCount = 0;

  constructor(
    private readonly userId: string,
    private readonly accountId: string,
  ) {}

  /** Record the latest price for a symbol. Called on every tick. */
  record(
    display: string,
    broker: string,
    bid: number | null,
    ask: number | null,
    price: number | null,
    time: string | null,
  ): void {
    this.buffer.set(display.toUpperCase(), { display, broker, bid, ask, price, time });
  }

  /** Start the periodic flush timer. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    log("info", `Started for account ${this.accountId} (every ${FLUSH_INTERVAL_MS}ms)`);
  }

  /** Stop the flush timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Flush buffered prices to Supabase. */
  private async flush(): Promise<void> {
    if (this.buffer.size === 0) return;

    const entries = [...this.buffer.values()];
    // Don't clear buffer — keep latest prices for next flush in case no new ticks arrive
    // (This means the Quotes page always shows the most recent known price)

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    const now = new Date().toISOString();
    const rows = entries.map((e) => ({
      user_id: this.userId,
      account_id: this.accountId,
      display_symbol: e.display.toUpperCase(),
      broker_symbol: e.broker,
      timeframe: "quote",
      last_price: e.price,
      last_bid: e.bid,
      last_ask: e.ask,
      last_tick_at: e.time ?? now,
      status: "live",
      source: "metaapi_mt5",
      updated_at: now,
    }));

    try {
      const res = await fetch(
        `${url}/rest/v1/chart_live_snapshots?on_conflict=user_id,account_id,display_symbol,timeframe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(rows),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        log("warn", `Flush failed (${res.status}): ${text.slice(0, 200)}`);
      } else {
        this.flushCount++;
        // Log every 20th flush (~60s) to avoid spam
        if (this.flushCount % 20 === 1) {
          log("info", `Flushed ${rows.length} symbols to Supabase (flush #${this.flushCount})`);
        }
      }
    } catch (e) {
      log("warn", "Flush error:", e);
    }
  }
}
