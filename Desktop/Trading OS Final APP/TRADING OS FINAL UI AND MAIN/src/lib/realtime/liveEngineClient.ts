import type {
  LiveEngineClientMessage,
  LiveEngineMessage,
  SubscribeMessage,
  UnsubscribeMessage,
} from './liveEngineTypes';

type SubscriptionKey = `${string}__${string}`; // symbol__timeframe

function keyOf(symbol: string, timeframe: string): SubscriptionKey {
  return `${symbol}__${timeframe}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface LiveEngineClientOptions {
  /** e.g. wss://<worker-domain>/ws */
  url: string;
  /** max outbound message rate to UI (ms). */
  uiThrottleMs?: number;
  /** reconnect backoff cap. */
  maxReconnectMs?: number;
}

export class LiveEngineClient {
  private url: string;
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private readonly maxReconnectMs: number;

  private readonly subscriptions = new Set<SubscriptionKey>();
  private listeners = new Set<(msg: LiveEngineMessage) => void>();

  // UI throttling (batch dispatch)
  private readonly uiThrottleMs: number;
  private pending: LiveEngineMessage[] = [];
  private flushTimer: number | null = null;

  constructor(opts: LiveEngineClientOptions) {
    this.url = opts.url;
    this.uiThrottleMs = Math.max(20, opts.uiThrottleMs ?? 75);
    this.maxReconnectMs = Math.max(1000, opts.maxReconnectMs ?? 15_000);
  }

  onMessage(cb: (msg: LiveEngineMessage) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.clearReconnect();

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      // Resubscribe everything
      for (const sub of this.subscriptions) {
        const [symbol, timeframe] = sub.split('__');
        this.send({ type: 'subscribe', symbol, timeframe } satisfies SubscribeMessage);
      }
      this.send({ type: 'ping', ts: nowIso() });
    };

    ws.onmessage = (evt) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(evt.data));
      } catch {
        return;
      }
      this.enqueue(msg as LiveEngineMessage);
    };

    ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // Let onclose drive reconnect.
    };
  }

  disconnect(): void {
    this.clearReconnect();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  subscribe(symbol: string, timeframe: string): void {
    const sub = keyOf(symbol, timeframe);
    if (this.subscriptions.has(sub)) return;
    this.subscriptions.add(sub);
    this.connect();
    this.send({ type: 'subscribe', symbol, timeframe });
  }

  unsubscribe(symbol: string, timeframe: string): void {
    const sub = keyOf(symbol, timeframe);
    if (!this.subscriptions.has(sub)) return;
    this.subscriptions.delete(sub);
    this.send({ type: 'unsubscribe', symbol, timeframe } satisfies UnsubscribeMessage);
    // keep connection alive for other subs
  }

  private send(msg: LiveEngineClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }

  private enqueue(msg: LiveEngineMessage): void {
    this.pending.push(msg);
    if (this.flushTimer) return;
    this.flushTimer = window.setTimeout(() => this.flush(), this.uiThrottleMs);
  }

  private flush(): void {
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const batch = this.pending;
    this.pending = [];
    for (const msg of batch) {
      for (const cb of this.listeners) cb(msg);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const base = 250 * Math.pow(2, this.reconnectAttempt++);
    const delay = Math.min(this.maxReconnectMs, base + Math.floor(Math.random() * 250));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

