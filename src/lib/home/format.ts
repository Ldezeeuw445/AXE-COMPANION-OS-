export type PnlTone = "up" | "dn" | "mut";
export type SideKind = "buy" | "sell" | "pend";

export function formatMoney(
  n: number | null | undefined,
  opts: { sign?: boolean; digits?: number } = {},
): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = opts.digits ?? 2;
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (!opts.sign) return `$${abs}`;
  if (n > 0) return `+$${abs}`;
  if (n < 0) return `−$${abs}`;
  return `$${abs}`;
}

export function formatPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toFixed(digits);
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `−${abs}%`;
  return `${abs}%`;
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 100 ? 2 : abs >= 10 ? 3 : 5;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  });
}

export function pnlTone(n: number | null | undefined): PnlTone {
  if (n == null || !Number.isFinite(n) || n === 0) return "mut";
  return n > 0 ? "up" : "dn";
}

export function sideKind(side: string | null | undefined): SideKind {
  const s = (side ?? "").toLowerCase();
  if (s.includes("buy") || s === "long" || s === "0") return "buy";
  if (s.includes("sell") || s === "short" || s === "1") return "sell";
  return "pend";
}

export function sideLabel(side: string | null | undefined, pendingType?: string | null): string {
  if (pendingType) {
    const t = pendingType.replace(/_/g, " ");
    if (t.includes("limit")) return "Limit";
    if (t.includes("stop")) return "Stop";
    return t.replace(/\b\w/g, (c) => c.toUpperCase()) || "Pending";
  }
  const kind = sideKind(side);
  if (kind === "buy") return "Buy";
  if (kind === "sell") return "Sell";
  return "Pending";
}

export function shortAddress(address: string, head = 4, tail = 4): string {
  const v = address.trim();
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const delta = Math.max(0, now - t);
  const min = Math.round(delta / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short" });
}

export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
