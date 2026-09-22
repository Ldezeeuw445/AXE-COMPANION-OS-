/**
 * Which brokers this deployment offers.
 *
 * The beta ships MT5-only: the demo account's virtual fills and the Alpaca
 * paper path are both off unless explicitly switched on. Nothing is deleted —
 * an account row that already exists keeps working, it is simply no longer
 * seeded or offered to new users.
 *
 * Flags are NEXT_PUBLIC_ so the same answer holds in server loaders and in the
 * client components that render the account picker. They are read at build
 * time, so changing one needs a rebuild, not just a restart.
 */

function enabled(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/** AXE Demo account (synthetic ticks, virtual fills). Off for the beta. */
export function isDemoBrokerEnabled(): boolean {
  return enabled(process.env.NEXT_PUBLIC_ENABLE_DEMO_BROKER);
}

/** Alpaca paper (US equities). Off for the beta, and needs its keys as well. */
export function isAlpacaBrokerEnabled(): boolean {
  return enabled(process.env.NEXT_PUBLIC_ENABLE_ALPACA_BROKER);
}
