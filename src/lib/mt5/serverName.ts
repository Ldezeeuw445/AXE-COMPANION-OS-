/**
 * Which MT5 server the trader means, measured against MetaApi's own registry.
 *
 * Why this exists: on 2026-10-20 a funded Upcomers account failed to connect
 * with `mt5_server_not_found`. The trader typed "Upcomers", the name on the
 * firm's dashboard. The real MT5 server is "Upcomers-Server", and MetaApi knew
 * it all along (known-mt-servers search: {"Upcomers Ltd.": ["Upcomers-Server"]}).
 * Prop firms almost always differ like this, and the fix should not be a trip
 * into the MT5 desktop app.
 *
 * Rules, so a password is never sent to a server the trader did not mean:
 *   - an exact match is used as typed;
 *   - one match that differs only in case or punctuation, or one server that
 *     starts with what was typed, is used instead ("Upcomers" -> "Upcomers-Server");
 *   - more than one candidate (FTMO-Demo / FTMO-Server) is never guessed: the
 *     trader gets the list and picks;
 *   - nothing found, or the search failed: the typed name goes through as before,
 *     and MetaApi gives its own verdict.
 */

export type KnownServers = Record<string, unknown>;

export type ServerOption = { server: string; broker: string };

export type ServerChoice =
  | { kind: "exact"; server: string }
  | { kind: "resolved"; server: string; broker: string }
  | { kind: "ambiguous"; options: ServerOption[] }
  | { kind: "unknown" };

const MAX_OPTIONS = 6;

function flat(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function options(known: KnownServers | null | undefined): ServerOption[] {
  return Object.entries(known ?? {}).flatMap(([broker, servers]) =>
    (Array.isArray(servers) ? servers : [])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((server) => ({ server, broker })),
  );
}

export function chooseServer(typed: string, known: KnownServers | null | undefined): ServerChoice {
  const wanted = typed.trim();
  const all = options(known);
  if (all.some((o) => o.server === wanted)) return { kind: "exact", server: wanted };
  const key = flat(wanted);
  if (!key) return { kind: "unknown" };
  const same = all.filter((o) => flat(o.server) === key);
  if (same.length === 1) return { kind: "resolved", ...same[0] };
  const starts = (same.length > 1 ? same : all.filter((o) => flat(o.server).startsWith(key)));
  if (starts.length === 1) return { kind: "resolved", ...starts[0] };
  if (starts.length > 1) return { kind: "ambiguous", options: starts.slice(0, MAX_OPTIONS) };
  return { kind: "unknown" };
}

export function ambiguousServerMessage(typed: string, opts: ServerOption[]): string {
  const list = opts.map((o) => `${o.server} (${o.broker})`).join(", ");
  return `MetaApi has no server called "${typed.trim()}". Did you mean one of these: ${list}? Enter the exact name and connect again.`;
}
