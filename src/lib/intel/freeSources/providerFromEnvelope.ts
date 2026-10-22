/**
 * INTEL-FREE — map proxy envelopes (ok + optional unavailable[]) to provider
 * badge inputs without failing the whole intel view.
 *
 * The edge proxy returns `{ ok: true, data, source: "db_stale", unavailable }`
 * when live SEC/FMP/FINRA paths fail but DB still has rows. Callers must keep
 * those reasons so the UI can show unavailable · reason on the badge.
 */

export type IntelSourceEnvelope = {
  ok: boolean;
  error?: string;
  source?: string;
  unavailable?: string[];
};

/** Join up to three source failure reasons; prefix when serving stale DB. */
export function formatIntelUnavailable(
  unavailable?: string[],
  source?: string,
): string | undefined {
  const parts = (unavailable ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 3);
  if (parts.length === 0) {
    return source === "db_stale" ? "db_stale" : undefined;
  }
  const joined = parts.join("; ");
  return source === "db_stale" ? `stale · ${joined}` : joined;
}

/**
 * Human-readable reason for a provider badge from a proxy/DB envelope.
 * Failures keep their error; ok+stale keeps unavailable reasons visible.
 */
export function reasonFromIntelEnvelope(
  env: IntelSourceEnvelope,
): string | undefined {
  if (!env.ok) {
    const u = formatIntelUnavailable(env.unavailable);
    if (env.error && u) return `${env.error} (${u})`;
    return env.error ?? u;
  }
  return formatIntelUnavailable(env.unavailable, env.source);
}

/**
 * Whether the provider badge should read "live".
 *
 * Default (data-first): stale DB rows still count as live so the section
 * stays useful; unavailable reasons ride along via `reasonFromIntelEnvelope`
 * for the badge/tooltip. Flip to `hasData && !hasUnavailable` if you prefer
 * "unavailable" whenever any live source failed (stricter source health).
 */
export function intelProviderShowsLive(args: {
  hasData: boolean;
  hasUnavailable: boolean;
}): boolean {
  void args.hasUnavailable;
  return args.hasData;
}
