/**
 * Client-safe account kind predicates.
 * Kept free of server-only imports so UI can classify rows without pulling
 * the TOS-SEC-2 write client into the browser bundle.
 */

export function isDemoAccount(
  account: { connection_method?: string | null; provider?: string | null } | null | undefined,
): boolean {
  return account?.connection_method === "demo_paper" || account?.provider === "demo";
}

export function isAlpacaAccount(
  account: { connection_method?: string | null; provider?: string | null } | null | undefined,
): boolean {
  return account?.connection_method === "cloud_alpaca" || account?.provider === "alpaca";
}
