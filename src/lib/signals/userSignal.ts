export const SIGNAL_SOURCES = ["telegram", "manual", "tradingview"] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

export const SIGNAL_SIDES = ["buy", "sell", "long", "short"] as const;
export type SignalSide = (typeof SIGNAL_SIDES)[number];

export const SIGNAL_STATUSES = ["new", "accepted", "rejected", "expired", "executed"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export type UserSignalInput = {
  source: string;
  symbol: string;
  side?: string | null;
  entry?: number | string | null;
  sl?: number | string | null;
  tp?: number | string | null;
  raw_text?: string | null;
  status?: string | null;
};

export type UserSignalRow = {
  id: string;
  user_id: string;
  source: SignalSource;
  symbol: string;
  side: SignalSide | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  raw_text: string | null;
  status: SignalStatus;
  created_at: string;
  updated_at: string;
};

function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isPresent(value: unknown): boolean {
  return value != null && value !== "";
}

export type ParsedUserSignal =
  | { ok: true; row: Omit<UserSignalRow, "id" | "user_id" | "created_at" | "updated_at"> }
  | { ok: false; error: string };

/**
 * Validate a signal create/update body. No order execution — inbox only.
 */
export function parseUserSignalInput(body: UserSignalInput): ParsedUserSignal {
  const source = String(body.source ?? "").trim().toLowerCase();
  if (!SIGNAL_SOURCES.includes(source as SignalSource)) {
    return { ok: false, error: `source must be one of: ${SIGNAL_SOURCES.join(", ")}` };
  }

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  if (!symbol || symbol.length > 32) {
    return { ok: false, error: "symbol is required (max 32 chars)" };
  }

  let side: SignalSide | null = null;
  if (body.side != null && String(body.side).trim() !== "") {
    const s = String(body.side).trim().toLowerCase();
    if (!SIGNAL_SIDES.includes(s as SignalSide)) {
      return { ok: false, error: `side must be one of: ${SIGNAL_SIDES.join(", ")}` };
    }
    side = s as SignalSide;
  }

  const statusRaw = body.status == null || body.status === "" ? "new" : String(body.status).trim().toLowerCase();
  if (!SIGNAL_STATUSES.includes(statusRaw as SignalStatus)) {
    return { ok: false, error: `status must be one of: ${SIGNAL_STATUSES.join(", ")}` };
  }

  const entry = asFiniteNumber(body.entry);
  const sl = asFiniteNumber(body.sl);
  const tp = asFiniteNumber(body.tp);
  if (isPresent(body.entry) && entry == null) {
    return { ok: false, error: "entry must be a finite number" };
  }
  if (isPresent(body.sl) && sl == null) {
    return { ok: false, error: "sl must be a finite number" };
  }
  if (isPresent(body.tp) && tp == null) {
    return { ok: false, error: "tp must be a finite number" };
  }

  const raw_text =
    body.raw_text == null ? null : String(body.raw_text).slice(0, 4000);

  return {
    ok: true,
    row: {
      source: source as SignalSource,
      symbol,
      side,
      entry,
      sl,
      tp,
      raw_text,
      status: statusRaw as SignalStatus,
    },
  };
}
