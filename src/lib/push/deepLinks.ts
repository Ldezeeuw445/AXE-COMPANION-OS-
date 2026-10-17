import {
  normalizeSessionSymbol,
  normalizeSessionTimeframe,
  tabFromPathname,
  type ActiveSessionState,
} from "@/lib/session/activeSession";
import { isPushCategory, type PushCategory } from "@/lib/push/categories";

const DEFAULT_TF = "h1";

const SAFE_PUSH_PREFIXES = [
  "/chart",
  "/chat",
  "/accounts",
  "/account",
  "/positions",
  "/alerts",
  "/journal",
  "/feed",
  "/cockpit",
  "/actions",
  "/settings",
  "/watchlist",
  "/history",
  "/market",
] as const;

export type PushDeepLinkInput = {
  category: PushCategory;
  symbol?: string | null;
  timeframe?: string | null;
  accountId?: string | null;
  threadId?: string | null;
  /** Explicit path override. Still sanitized. */
  url?: string | null;
};

export type PushSessionPatch = Partial<
  Pick<ActiveSessionState, "symbol" | "timeframe" | "accountId" | "lastTab">
>;

export type BuiltDeepLink = {
  url: string;
  session: PushSessionPatch;
};

function encode(value: string): string {
  return encodeURIComponent(value);
}

function cleanPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* fall through */
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isSafeAppPath(pathname: string): boolean {
  return SAFE_PUSH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** `/account` is the C6 name; the live route is `/accounts`. */
export function canonicalizePushPath(pathname: string): string {
  if (pathname === "/account" || pathname.startsWith("/account/")) {
    return `/accounts${pathname.slice("/account".length)}`;
  }
  return pathname;
}

function normalizeSearchParams(params: URLSearchParams): string {
  const symbol = params.get("symbol");
  if (symbol?.trim()) params.set("symbol", normalizeSessionSymbol(symbol));
  const tf = params.get("tf") ?? params.get("timeframe");
  if (tf?.trim()) {
    params.set("tf", normalizeSessionTimeframe(tf));
    params.delete("timeframe");
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function sanitizePushUrl(raw: string | null | undefined, fallback = "/chat"): string {
  const cleaned = cleanPath(raw ?? "");
  if (!cleaned) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(cleaned, "https://axe.local");
  } catch {
    return fallback;
  }
  const pathname = canonicalizePushPath(parsed.pathname);
  if (!isSafeAppPath(pathname)) return fallback;
  return `${pathname}${normalizeSearchParams(parsed.searchParams)}`;
}

export function buildChartDeepLink(symbol?: string | null, timeframe?: string | null, accountId?: string | null): string {
  const params = new URLSearchParams();
  const sym = symbol?.trim() ? normalizeSessionSymbol(symbol) : "";
  const tf = timeframe?.trim() ? normalizeSessionTimeframe(timeframe) : "";
  if (sym) params.set("symbol", sym);
  if (tf) params.set("tf", tf);
  if (accountId?.trim()) params.set("account", accountId.trim());
  const qs = params.toString();
  return qs ? `/chart?${qs}` : "/chart";
}

export function buildChatDeepLink(threadId?: string | null): string {
  const thread = threadId?.trim();
  if (!thread) return "/chat";
  return `/chat?thread=${encode(thread)}`;
}

export function buildAccountDeepLink(): string {
  return "/accounts";
}

export function defaultUrlForCategory(category: PushCategory, input: Omit<PushDeepLinkInput, "category"> = {}): string {
  switch (category) {
    case "price_alert":
      return buildChartDeepLink(input.symbol, input.timeframe ?? DEFAULT_TF, input.accountId);
    case "risk_alert":
      return input.symbol
        ? buildChartDeepLink(input.symbol, input.timeframe, input.accountId)
        : "/positions";
    case "broker_disconnect":
      return buildAccountDeepLink();
    case "economic_event":
      return input.symbol
        ? buildChartDeepLink(input.symbol, input.timeframe ?? DEFAULT_TF, input.accountId)
        : "/feed";
    case "axe_finding":
      return input.threadId ? buildChatDeepLink(input.threadId) : "/journal";
    default:
      return "/chat";
  }
}

export function buildPushDeepLink(input: PushDeepLinkInput): BuiltDeepLink {
  const url = sanitizePushUrl(input.url || defaultUrlForCategory(input.category, input));
  return { url, session: sessionPatchFromDeepLink(url) };
}

export function sessionPatchFromDeepLink(rawUrl: string | null | undefined): PushSessionPatch {
  const url = sanitizePushUrl(rawUrl, "");
  if (!url) return {};

  let parsed: URL;
  try {
    parsed = new URL(url, "https://axe.local");
  } catch {
    return {};
  }

  const pathname = canonicalizePushPath(parsed.pathname);
  const patch: PushSessionPatch = {};
  const tab = tabFromPathname(pathname);
  if (tab) patch.lastTab = tab;

  const symbol = parsed.searchParams.get("symbol");
  if (symbol?.trim()) patch.symbol = normalizeSessionSymbol(symbol);

  const tf = parsed.searchParams.get("tf") ?? parsed.searchParams.get("timeframe");
  if (tf?.trim()) patch.timeframe = normalizeSessionTimeframe(tf);

  const account = parsed.searchParams.get("account");
  if (account?.trim()) patch.accountId = account.trim();

  return patch;
}

export function categoryFromTag(tag: string | null | undefined): PushCategory | null {
  if (!tag) return null;
  const head = tag.split(":")[0]?.split("-")[0];
  return isPushCategory(head) ? head : null;
}
