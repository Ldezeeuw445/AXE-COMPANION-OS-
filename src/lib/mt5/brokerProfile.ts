/**
 * Naming and reuse rules for MetaApi provisioning profiles.
 *
 * A profile costs something and MetaApi keeps them per user, so uploading the
 * same broker twice is waste that nobody notices until the list is full of
 * duplicates. The name is derived from the server string so an existing
 * profile can be found again without storing a mapping anywhere.
 *
 * Dependency-free so `node --experimental-strip-types` can exercise it.
 */

/** What a profile for this broker server is called. Stable, so it is findable. */
export function profileNameForServer(server: string): string {
  const clean = server.trim().replace(/\s+/g, " ");
  return `axe:${clean.toLowerCase()}`;
}

/** The id of an existing profile for this server, or null. */
export function findProfileForServer(
  profiles: ReadonlyArray<{ _id?: string; id?: string; name?: string }>,
  server: string,
): string | null {
  const want = profileNameForServer(server);
  for (const p of profiles) {
    if ((p.name ?? "").trim().toLowerCase() === want) {
      const id = p._id ?? p.id;
      if (id) return id;
    }
  }
  return null;
}

export const SERVERS_DAT_MAX_BYTES = 2 * 1024 * 1024;

export type ServersDatCheck = { ok: true } | { ok: false; reason: string };

/**
 * Is this plausibly a `servers.dat` from an MT5 terminal?
 *
 * Deliberately shallow: the format is undocumented and binary, so anything
 * clever here would be a guess that rejects valid files. It only catches the
 * mistakes a person actually makes — an empty file, something enormous, or
 * the text file they exported instead.
 */
export function checkServersDat(name: string, bytes: Uint8Array): ServersDatCheck {
  if (bytes.byteLength === 0) return { ok: false, reason: "That file is empty." };
  if (bytes.byteLength > SERVERS_DAT_MAX_BYTES) {
    return { ok: false, reason: "That file is far larger than a servers.dat; is it the right one?" };
  }
  const lower = name.trim().toLowerCase();
  if (lower && !lower.endsWith(".dat")) {
    return {
      ok: false,
      reason: `MetaApi needs the binary servers.dat from your MT5 terminal's config folder, not "${name}".`,
    };
  }
  return { ok: true };
}
