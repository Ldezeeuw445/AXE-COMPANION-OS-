/**
 * What kind of broker account a row is, from its own columns.
 *
 * Kept apart from `demoAccountProvision.ts` and `alpaca/provision.ts` because
 * those create the rows on the server-only elevated client (TOS-SEC-2), and client
 * components such as the accounts screen only need to tell the kinds apart.
 */

type AccountKindFields = { connection_method?: string | null; provider?: string | null } | null | undefined;

export const DEMO_CONNECTION_METHOD = "demo_paper";

export const ALPACA_CONNECTION_METHOD = "cloud_alpaca";
export const ALPACA_PROVIDER = "alpaca";

export function isDemoAccount(account: AccountKindFields) {
  return account?.connection_method === DEMO_CONNECTION_METHOD || account?.provider === "demo";
}

export function isAlpacaAccount(account: AccountKindFields): boolean {
  return (
    account?.connection_method === ALPACA_CONNECTION_METHOD || account?.provider === ALPACA_PROVIDER
  );
}
