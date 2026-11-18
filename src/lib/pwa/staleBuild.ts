/**
 * The phone keeps an AXE PWA alive in memory for hours. After a deploy that
 * window still runs the previous bundle: its lazy chunks are gone from the
 * server ("Failed to load chunk …") and its Server Action ids no longer exist
 * ("Server Action … was not found on the server"). 18 Nov: both reached Luka
 * as a red account card and a "Something went wrong" screen, although the
 * server and the MT5 link were fine. The cure is a reload; these helpers
 * decide when one is due and keep it to one attempt per minute.
 *
 * Dependency-free so it runs under `tsx --test`.
 */

const STALE_PATTERNS = [
  /failed to load chunk/i,
  /chunkloaderror/i,
  /loading (css )?chunk [\w/.-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /server action ["“]?[0-9a-f]+["”]? was not found/i,
  /failed-to-find-server-action/i,
];

/** True for the errors a stale bundle produces after a deploy, and only those. */
export function isStaleBuildError(message: unknown): boolean {
  const text = typeof message === "string" ? message : message instanceof Error ? message.message : "";
  if (!text) return false;
  return STALE_PATTERNS.some((re) => re.test(text));
}

/** True only when both commits are known and differ (7-char prefix). */
export function isDifferentBuild(client: string | null | undefined, server: string | null | undefined): boolean {
  const a = String(client ?? "").trim().slice(0, 7).toLowerCase();
  const b = String(server ?? "").trim().slice(0, 7).toLowerCase();
  if (a.length < 7 || b.length < 7) return false;
  return a !== b;
}

export const STALE_RELOAD_KEY = "axe.staleBuildReloadAt";
export const STALE_RELOAD_GAP_MS = 60_000;

/** One reload per minute at most, so a server that is really broken cannot loop the page. */
export function mayReloadNow(lastAttempt: string | null, nowMs: number): boolean {
  const last = Number(lastAttempt ?? 0);
  return !Number.isFinite(last) || nowMs - last >= STALE_RELOAD_GAP_MS;
}

/** The commit this bundle was built from (inlined by next.config `env`). */
export function clientBuildCommit(): string {
  return process.env.AXE_BUILD_COMMIT ?? "";
}

/** Reload once for a stale bundle; false when a reload was already tried within the minute. */
export function reloadForNewBuild(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const now = Date.now();
    if (!mayReloadNow(window.sessionStorage.getItem(STALE_RELOAD_KEY), now)) return false;
    window.sessionStorage.setItem(STALE_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** The commit the server runs now, or null when /api/debug/build does not answer. */
export async function fetchServerBuildCommit(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher("/api/debug/build", { cache: "no-store" });
    if (!res.ok) return null;
    const doc = (await res.json()) as { commit?: unknown };
    return typeof doc.commit === "string" && doc.commit.trim() ? doc.commit.trim() : null;
  } catch {
    return null;
  }
}
