/**
 * The AXE ecosystem — one list, used by the app switcher on every public surface.
 *
 * Why this file exists: until now Companion had no link to Trading OS anywhere
 * in the codebase, and Trading OS had no link back. Two apps on one Supabase
 * project that cannot reach each other is not an ecosystem, it is two websites.
 * The switcher in the landing header reads this list, so adding a surface means
 * editing one array instead of hunting for hardcoded hrefs.
 *
 * `axe-core` is deliberately absent from `PUBLIC_ECOSYSTEM_APPS`. It is Luka's
 * personal cockpit, has no subscriptions, and must never show up in a switcher
 * a visitor can see.
 *
 * Dependency-free on purpose so `node --experimental-strip-types` can exercise
 * it without a bundler.
 */

export type EcosystemAppId = "companion" | "trading-os" | "axe-core";

/**
 * - `live`     reachable right now, link it like a normal link
 * - `beta`     exists but not open to everyone; say so instead of implying it is
 * - `offline`  listed so the visitor knows it exists, but NOT linked — the
 *              switcher must never hand someone a dead page
 * - `private`  never shown to a visitor
 */
export type AppAvailability = "live" | "beta" | "offline" | "private";

/** Whether a visitor may click through to this surface. */
export function isReachable(availability: AppAvailability): boolean {
  return availability === "live" || availability === "beta";
}

export type EcosystemApp = {
  id: EcosystemAppId;
  /** Shown in the switcher. */
  name: string;
  /** One line under the name. No superlatives — what the thing is. */
  tagline: string;
  /** Where the surface runs. Domains are ours, so these are stable even when hosting moves. */
  url: string;
  /** Which device the surface is built for; drives the icon in the switcher. */
  form: "phone" | "desktop";
  availability: AppAvailability;
};

export const ECOSYSTEM_APPS: EcosystemApp[] = [
  {
    id: "companion",
    name: "AXE Companion",
    tagline: "Phone-first trading OS — chart, depth, news, journal, execution",
    url: "https://www.axecompanion.com",
    form: "phone",
    availability: "live",
  },
  {
    id: "trading-os",
    name: "Trading OS",
    tagline: "Desktop terminal on the same account — multi-chart, intel, quant",
    url: "https://www.tradingosapp.com",
    form: "desktop",
    // Was "offline" while Vercel answered 402 DEPLOYMENT_DISABLED. Measured
    // 2026-10-17, after the DNS moved to our own Cloudflare Tunnel: apex and
    // www both answer 200. "beta" rather than "live" because signup is still
    // invite-only — the switcher links out, the badge says so.
    availability: "beta",
  },
  {
    id: "axe-core",
    name: "AXE Core",
    tagline: "Private operator cockpit",
    url: "https://www.axeheadquarters.com",
    form: "desktop",
    availability: "private",
  },
];

/** Everything a visitor may be shown. Never includes AXE Core. */
export const PUBLIC_ECOSYSTEM_APPS: EcosystemApp[] = ECOSYSTEM_APPS.filter(
  (app) => app.availability !== "private",
);

export function ecosystemApp(id: EcosystemAppId): EcosystemApp | undefined {
  return ECOSYSTEM_APPS.find((app) => app.id === id);
}

/**
 * What the switcher prints next to a surface that is not open yet.
 * `live` returns null so the common case renders no badge at all.
 */
export function availabilityLabel(availability: AppAvailability): string | null {
  if (availability === "beta") return "Private beta";
  if (availability === "offline") return "Moving hosts";
  if (availability === "private") return "Private";
  return null;
}
