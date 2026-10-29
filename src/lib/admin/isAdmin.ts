/**
 * Server-only admin check for inbox views.
 * Prefer AXE_ADMIN_EMAILS (comma-separated). Falls back to AXE_FULL_ACCESS_USER_IDS.
 */

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.AXE_ADMIN_EMAILS?.trim() ?? "";
  if (!raw) return false;
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return set.has(email.trim().toLowerCase());
}

export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.AXE_FULL_ACCESS_USER_IDS?.trim() ?? "";
  if (!raw) return false;
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return set.has(userId);
}

export function isAdminUser(opts: {
  userId: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  return isAdminEmail(opts.email) || isAdminUserId(opts.userId);
}
