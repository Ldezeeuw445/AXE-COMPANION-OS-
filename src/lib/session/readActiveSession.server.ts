import { cookies } from "next/headers";
import {
  DEFAULT_ACTIVE_SESSION,
  LEGACY_SYMBOL_KEY,
  LEGACY_TF_KEY,
  SESSION_COOKIE,
  parseActiveSession,
  sanitizeActiveSession,
  type ActiveSessionState,
} from "@/lib/session/activeSession";
import { VIEWPORT_COOKIE, parseShellViewport, type ShellViewport } from "@/lib/viewport/shellViewportServer";

export async function readActiveSessionCookie(): Promise<ActiveSessionState> {
  const store = await cookies();
  const parsed = parseActiveSession(store.get(SESSION_COOKIE)?.value);
  if (parsed) return parsed;
  return sanitizeActiveSession({
    symbol: store.get(LEGACY_SYMBOL_KEY)?.value,
    timeframe: store.get(LEGACY_TF_KEY)?.value,
  });
}

export async function readShellViewportCookie(): Promise<ShellViewport> {
  const store = await cookies();
  return parseShellViewport(store.get(VIEWPORT_COOKIE)?.value);
}

export function emptyActiveSession(): ActiveSessionState {
  return DEFAULT_ACTIVE_SESSION;
}
