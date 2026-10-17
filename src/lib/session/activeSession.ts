/**
 * Canonical active-session snapshot for the mobile shell.
 *
 * Home / Markets / Chart / AXE / Account all read and write this shape.
 * Persistence is cookie + localStorage (not Supabase) so SSR can hydrate
 * without a layout jump and so reload restores account / symbol / tf / tab.
 */

export const SESSION_COOKIE = "axe.active-session";
export const SESSION_STORAGE_KEY = "axe.active-session";
export const LEGACY_SYMBOL_KEY = "axe_active_symbol";
export const LEGACY_TF_KEY = "axe_active_tf";

export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export type AccountType = "live" | "demo" | "prop" | "funded" | "unknown";
export type ShellTab = "home" | "markets" | "chart" | "axe" | "account";

export type ActiveSessionState = {
  userId: string | null;
  accountId: string | null;
  accountType: AccountType;
  accountLabel: string | null;
  symbol: string;
  timeframe: string;
  lastTab: ShellTab;
};

export const DEFAULT_ACTIVE_SESSION: ActiveSessionState = {
  userId: null,
  accountId: null,
  accountType: "unknown",
  accountLabel: null,
  symbol: "XAUUSD",
  timeframe: "h1",
  lastTab: "axe",
};

export const SHELL_TAB_PATHS: Record<ShellTab, string> = {
  home: "/cockpit",
  markets: "/watchlist",
  chart: "/chart",
  axe: "/chat",
  account: "/accounts",
};

export const MOBILE_SHELL_TABS = [
  { id: "home" as const, href: "/cockpit", label: "Home" },
  { id: "markets" as const, href: "/watchlist", label: "Markets" },
  { id: "chart" as const, href: "/chart", label: "Chart" },
  { id: "axe" as const, href: "/chat", label: "AXE" },
  { id: "account" as const, href: "/accounts", label: "Account" },
];

const ACCOUNT_TYPES = new Set<AccountType>(["live", "demo", "prop", "funded", "unknown"]);
const SHELL_TABS = new Set<ShellTab>(["home", "markets", "chart", "axe", "account"]);

const TF_ALIASES: Record<string, string> = {
  m1: "m5",
  "1m": "m5",
  m5: "m5",
  "5m": "m5",
  m15: "m15",
  "15m": "m15",
  m30: "m30",
  "30m": "m30",
  h1: "h1",
  "1h": "h1",
  h4: "h4",
  "4h": "h4",
  d1: "d1",
  d: "d1",
  "1d": "d1",
  w: "d1",
  w1: "d1",
};

export function normalizeSessionTimeframe(raw: string | null | undefined): string {
  const key = (raw ?? "").trim().toLowerCase();
  return TF_ALIASES[key] ?? DEFAULT_ACTIVE_SESSION.timeframe;
}

export function normalizeSessionSymbol(raw: string | null | undefined): string {
  const symbol = (raw ?? "").trim().toUpperCase();
  return symbol || DEFAULT_ACTIVE_SESSION.symbol;
}

export function isShellTab(value: unknown): value is ShellTab {
  return typeof value === "string" && SHELL_TABS.has(value as ShellTab);
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === "string" && ACCOUNT_TYPES.has(value as AccountType);
}

export function tabFromPathname(pathname: string): ShellTab | null {
  if (pathname === "/cockpit" || pathname.startsWith("/cockpit/")) return "home";
  if (
    pathname === "/watchlist" ||
    pathname.startsWith("/watchlist/") ||
    pathname === "/market" ||
    pathname.startsWith("/market/")
  ) {
    return "markets";
  }
  if (pathname === "/chart" || pathname.startsWith("/chart/")) return "chart";
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return "axe";
  if (pathname === "/accounts" || pathname.startsWith("/accounts/")) return "account";
  return null;
}

export function pathForTab(tab: ShellTab): string {
  return SHELL_TAB_PATHS[tab];
}

export function sanitizeActiveSession(
  input: Partial<ActiveSessionState> | null | undefined,
  fallback: ActiveSessionState = DEFAULT_ACTIVE_SESSION,
): ActiveSessionState {
  const src = input ?? {};
  return {
    userId: typeof src.userId === "string" && src.userId.trim() ? src.userId : fallback.userId,
    accountId:
      typeof src.accountId === "string" && src.accountId.trim() ? src.accountId : fallback.accountId,
    accountType: isAccountType(src.accountType) ? src.accountType : fallback.accountType,
    accountLabel:
      typeof src.accountLabel === "string" && src.accountLabel.trim()
        ? src.accountLabel
        : fallback.accountLabel,
    symbol: src.symbol != null ? normalizeSessionSymbol(src.symbol) : fallback.symbol,
    timeframe: src.timeframe != null ? normalizeSessionTimeframe(src.timeframe) : fallback.timeframe,
    lastTab: isShellTab(src.lastTab) ? src.lastTab : fallback.lastTab,
  };
}

export function mergeActiveSession(
  current: ActiveSessionState,
  patch: Partial<ActiveSessionState>,
): ActiveSessionState {
  return sanitizeActiveSession({ ...current, ...patch }, current);
}

export function serializeActiveSession(state: ActiveSessionState): string {
  return JSON.stringify(sanitizeActiveSession(state));
}

export function parseActiveSession(raw: string | null | undefined): ActiveSessionState | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return sanitizeActiveSession(parsed as Partial<ActiveSessionState>);
  } catch {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return sanitizeActiveSession(parsed as Partial<ActiveSessionState>);
    } catch {
      return null;
    }
  }
}

export function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return trimmed.slice(name.length + 1);
  }
  return null;
}

export function sessionFromCookieHeader(
  cookieHeader: string | null | undefined,
  legacy?: { symbol?: string | null; timeframe?: string | null },
): ActiveSessionState {
  const parsed = parseActiveSession(readCookieValue(cookieHeader, SESSION_COOKIE));
  if (parsed) return parsed;
  return sanitizeActiveSession({
    symbol: legacy?.symbol ?? undefined,
    timeframe: legacy?.timeframe ?? undefined,
  });
}

export function formatSessionCookie(state: ActiveSessionState): string {
  const value = encodeURIComponent(serializeActiveSession(state));
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`;
}
