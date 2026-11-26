/**
 * Public landing copy for AXE Companion (axecompanion.com).
 *
 * Keep this file dependency-free so `scripts/verify-landing-claims.mjs` can
 * import it with tsx and check the claims against billing, intel and the
 * ecosystem list.
 *
 * Rewritten 26 Nov 2026 so every sentence is true for the live product:
 * - AXE Companion is the phone app. Trading OS (tradingosapp.com) is the
 *   desktop terminal. Same login, same broker accounts, same data; AXE is the
 *   personal assistant in both.
 * - No mock screens and no sample numbers. The only screens on the page are
 *   real captures of the live site, dated. The old no-login hero mock, the
 *   June screenshots of a retired shell, the example behavior map and the
 *   empty recording slot are gone.
 * - Intel tiles say where each feed comes from, checked against
 *   `intel_sync_log` in the database on 26 Nov 2026.
 */

/** Paid landing CTAs. Checkout needs a signed-in user id, so this is the real
 *  route: sign in, then `/upgrade`. */
export const LANDING_CHECKOUT_HREF = "/login?next=/upgrade";

export const LANDING_HERO = {
  badge: "AXE Companion · the phone app",
  titleLead: "AXE Companion.",
  titleAccent: "Your trading desk, in your pocket.",
  body:
    "The phone app of the AXE ecosystem: chart, positions, journal, alerts, news, intel and AXE — your personal AI assistant. Same login, same broker accounts and the same data as Trading OS on your desktop.",
} as const;

/** Real captures of the live site. Dated, because a capture is only true for the day it was taken. */
export const LANDING_REAL_CAPTURES = [
  {
    src: "/landing/real/companion-sign-in-2026-11-26.png",
    alt: "The AXE Companion sign-in screen on a phone",
    caption: "Sign in",
  },
  {
    src: "/landing/real/companion-create-account-2026-11-26.png",
    alt: "The AXE Companion create-account screen, with the required terms checkbox",
    caption: "Create account",
  },
] as const;

export const LANDING_CAPTURE_NOTE =
  "Real screens, captured from axecompanion.com on 26 Nov 2026 at phone size. Nothing on this page is a mock-up.";

export const LANDING_RAIL = [
  "Chart, indicators and drawings",
  "Bid/ask and depth drawer",
  "News, intel and AXE Feed",
  "One-tap execution dock",
  "Price alerts and push",
] as const;

export const LANDING_ECOSYSTEM = {
  badge: "One account · two screens",
  titleLead: "Phone and desk.",
  titleAccent: "One source of truth.",
  body:
    "AXE Companion is built for the phone: the handier way to check a chart, a position or your journal, and to ask AXE, wherever you are. Trading OS is the desktop terminal for the big screen. Both apps read and write the same account, so a trade, an alert or a journal note made on one is there on the other.",
  phone: {
    name: "AXE Companion",
    where: "axecompanion.com · phone",
    points: [
      "Built phone-first: bottom tabs, one-hand execution dock",
      "Install it from the browser as an app — no App Store",
      "Push notifications for your alerts",
    ],
  },
  desk: {
    name: "Trading OS",
    where: "tradingosapp.com · desktop",
    points: [
      "Built for a big screen: chart, order ticket, news and AXE side by side",
      "Same login and the same broker accounts",
      "Same watchlist and alerts",
    ],
  },
} as const;

export const LANDING_FEEDS_BAND = {
  kicker: "Beyond the chart",
  titleLead: "AXE intel feeds",
  titleAccent: "beside the chart.",
  body:
    "Intel sits next to the chart, filled from free and public sources: SEC EDGAR, congressional trade disclosures, FINRA off-exchange volume, Nasdaq delayed option chains, aircraft and vessel positions, natural-hazard events, CISA, EIA and FRED. Every tile says where its numbers come from.",
} as const;

export type LandingFeedIcon =
  | "tide"
  | "macro"
  | "conviction"
  | "insider"
  | "policy"
  | "darkpool"
  | "options"
  | "jets"
  | "radar"
  | "emergency"
  | "vessel"
  | "energy"
  | "chokepoints"
  | "seismic"
  | "cyber"
  | "correlation"
  | "news"
  | "calendar"
  | "dejavu";

export type LandingIntelFeed = {
  title: string;
  desc: string;
  icon: LandingFeedIcon;
  /** Wide tiles. */
  span?: 2;
  /** The public source the feed is filled from (checked in intel_sync_log). */
  source: string;
};

/**
 * The intel tiles, in the order the Intel screen shows them.
 *
 * Count: 13 `IntelProviderStatus` ids in `intelClient.ts` plus Macro,
 * Calendar, News, Correlation, Conviction and Déjà Vu.
 *
 * Sources from `intel_sync_log` (26 Nov 2026): darkPool finra_reg_sho_daily,
 * unusualOptions + marketTide nasdaq_delayed, vesselTracking digitraffic,
 * cyberThreats cisa_kev, corporateJets / militaryRadar / emergencyMonitor
 * adsb_lol, conflictEvents eonet+usgs, insiderTrades sec_edgar,
 * congressTrades alphavantage, energyFlows eia. Chokepoints are a static
 * reference table in `intelClient.ts` — never call them live counts.
 */
export const LANDING_INTEL_FEEDS: ReadonlyArray<LandingIntelFeed> = [
  {
    title: "AXE Intel Tide",
    desc: "Net call versus put premium across the market, built from delayed option chains — a mood read, not a real-time tape.",
    icon: "tide",
    span: 2,
    source: "Nasdaq delayed options",
  },
  {
    title: "AXE Macro",
    desc: "Rates, inflation, growth and central-bank posture from FRED and the news chain, distilled into a regime read.",
    icon: "macro",
    source: "FRED",
  },
  {
    title: "AXE Market Conviction",
    desc: "A conviction read AXE generates from the intel feeds on this page — analysis, not a signal service.",
    icon: "conviction",
    source: "Built from the feeds here",
  },
  {
    title: "AXE Insider Flow",
    desc: "Form 4 insider buys and sells as they are filed, sized in dollars.",
    icon: "insider",
    source: "SEC EDGAR",
  },
  {
    title: "AXE Policy Flow",
    desc: "Congressional trade disclosures under the STOCK Act — House and Senate.",
    icon: "policy",
    source: "Alpha Vantage",
  },
  {
    title: "AXE Dark Pool",
    desc: "Daily off-exchange volume per ticker from FINRA's published files — a day-level read, not individual prints.",
    icon: "darkpool",
    source: "FINRA daily files",
  },
  {
    title: "AXE Options Flow",
    desc: "Unusual contracts by volume and open interest, from delayed option chains.",
    icon: "options",
    source: "Nasdaq delayed options",
  },
  {
    title: "AXE Jet Tracker",
    desc: "Corporate jets on a tracked list — who is airborne and where, when the open feed has them in view.",
    icon: "jets",
    source: "adsb.lol",
  },
  {
    title: "AXE Military Radar",
    desc: "Military aircraft in view of the open feed — type, flight level and speed.",
    icon: "radar",
    source: "adsb.lol",
  },
  {
    title: "AXE Emergency Monitor",
    desc: "Aircraft squawking an emergency code, as the open feed reports them.",
    icon: "emergency",
    source: "adsb.lol",
  },
  {
    title: "AXE Vessel Intel",
    desc: "Ship positions from an open AIS feed. Coverage is regional, not every ocean.",
    icon: "vessel",
    source: "Digitraffic AIS",
  },
  {
    title: "AXE Energy Flow",
    desc: "Crude, gas and power series — storage, production and stocks.",
    icon: "energy",
    source: "EIA",
  },
  {
    title: "AXE Global Chokepoints",
    desc: "Hormuz, Malacca, Suez, Panama, Bab-el-Mandeb and the Taiwan Strait — a reference table of typical daily transits, share of world trade and risk level. Reference figures, not a live ship count.",
    icon: "chokepoints",
    span: 2,
    source: "Reference table",
  },
  {
    title: "AXE Seismic Events",
    desc: "Earthquakes, volcanoes, wildfires and storms — natural events that can move supply.",
    icon: "seismic",
    source: "USGS and NASA EONET",
  },
  {
    title: "AXE Cyber Intel",
    desc: "Software vulnerabilities that are being exploited right now, with the vendor named.",
    icon: "cyber",
    source: "CISA KEV",
  },
  {
    title: "AXE Correlation Engine",
    desc: "Cross-asset correlations computed in the app — how gold, yields, crude and crypto move together, with Déjà Vu similar-pattern rows.",
    icon: "correlation",
    span: 2,
    source: "Computed in-app",
  },
  {
    title: "AXE News",
    desc: "Headlines from several providers, de-duplicated and cached for five minutes per symbol.",
    icon: "news",
    source: "Polygon, Perigon, Finnhub, EODHD",
  },
  {
    title: "AXE Calendar",
    desc: "Upcoming economic releases on one timeline, with their expected impact.",
    icon: "calendar",
    source: "Finnhub",
  },
  {
    title: "AXE Déjà Vu",
    desc: "Historical analogues to today's setup, inside the correlation engine — when that engine has data for the pair.",
    icon: "dejavu",
    source: "Computed in-app",
  },
];

export const LANDING_INTEL_FEED_COUNT = LANDING_INTEL_FEEDS.length;

export type LandingFeatureIcon =
  | "chart"
  | "depth"
  | "news"
  | "execute"
  | "chat"
  | "journal"
  | "push"
  | "mt5"
  | "risk"
  | "arc"
  | "accounts"
  | "wallets";

/** Companion-only tiles. Trading OS capabilities belong in LANDING_ECOSYSTEM.desk. */
export const COMPANION_FEATURES: ReadonlyArray<{
  title: string;
  desc: string;
  icon: LandingFeatureIcon;
}> = [
  {
    title: "Chart, indicators and drawings",
    desc: "Candles with Auto-Fib, Auto-Trend, swing points and BOS/CHoCH structure. Volume, MA, MACD, Bollinger, RSI, Stochastic, ADX, VWAP and POC. Trendline, rectangle, text and horizontal-level drawings.",
    icon: "chart",
  },
  {
    title: "Order blocks and fair value gaps",
    desc: "Order blocks and fair value gaps (including inverse gaps) that keep extending until price mitigates them. Show 1, 2 or 3 per side.",
    icon: "chart",
  },
  {
    title: "Bid/ask and depth drawer",
    desc: "Slide out depth from the top bar: the live bid/ask from your broker, plus a ladder around it that is labelled as synthetic — calculated, not a real order book.",
    icon: "depth",
  },
  {
    title: "News, intel and AXE Feed",
    desc: "Headlines from Polygon, Perigon, Finnhub and EODHD, cached for five minutes, plus FRED macro. The intel screen adds the feeds listed further down. The AXE Feed carries morning briefs, daily news and the market recap.",
    icon: "news",
  },
  {
    title: "One-tap execution dock",
    desc: "Market and limit orders with SL, TP and deviation, tied to the chart. Live orders need a connected broker, Live Trading switched on and a confirm banner.",
    icon: "execute",
  },
  {
    title: "AXE, your assistant",
    desc: "AXE reads your chart, accounts, journal, news and intel when it answers. Technical analysis and educational context — you make every trading decision.",
    icon: "chat",
  },
  {
    title: "Journal from your fills",
    desc: "Trades arrive from the broker on the ten-minute sync. Tap an outcome, add a voice note, a photo or a chart snapshot. On Core and up, AXE labels closed trades for you.",
    icon: "journal",
  },
  {
    title: "Price alerts, push and drawdown",
    desc: "Price alerts on the chart with push delivery to your phone. The background watcher fires those alerts, the per-firm drawdown alerts from last-known equity, and the trailing-stop sweep.",
    icon: "push",
  },
  {
    title: "MT5 via MetaApi, and Alpaca",
    desc: "Connect MT5 accounts from Accounts. Known brokers include FTMO, Goat Funded Trader, FundedNext and Upcomers; a dashboard name such as Upcomers resolves to the real server before connecting. Positions and fills sync about every ten minutes. Alpaca paper and live are supported.",
    icon: "mt5",
  },
  {
    title: "Firm rules and an autonomy guard",
    desc: "Rule presets for prop firms (FTMO 2-Step, 1-Step and Instant, Upcomers Oracle and others). AXE autonomy has three levels. Before any automatic order it checks your limits and blocks with the rule named — it never quietly shrinks the trade.",
    icon: "risk",
  },
  {
    title: "Cockpit and Learning Arc",
    desc: "On Core and up: Cockpit, Learning Arc, trade preparation, chart actions and daily and weekly briefings, built from your own trades and journal.",
    icon: "arc",
  },
  {
    title: "Several accounts, one private workspace",
    desc: "Funded, demo and live accounts side by side, one active at a time, with stats per account. Your workspace is private to your login.",
    icon: "accounts",
  },
];

export const LANDING_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "What is the difference between AXE Companion and Trading OS?",
    a: "AXE Companion is the phone app. Trading OS is the desktop terminal. They share one login, one set of broker accounts and one database, and AXE is the assistant in both — so what you do on one is there on the other. Companion works on its own; you do not need the desktop to use it. The switcher in the top-left corner moves you between them.",
  },
  {
    q: "Which plan do I need for the phone app?",
    a: "Core or higher. Free gives you Trading OS on the desk (in beta) with capped AXE chat; AXE Companion on your phone starts at Core. One subscription covers both apps.",
  },
  {
    q: "Does AXE place trades?",
    a: "Yes — through the connected broker, with safety checks. Live execution stays off until you turn it on: it needs the linked account and a one-time disclaimer, and only then does the BUY / SELL dock send real orders (market, buy / sell limit, SL, TP, deviation). Automatic orders only fire from an alert you armed, after the account checks below, inside the autonomy level you set.",
  },
  {
    q: "Can AXE place a trade without me pressing anything?",
    a: "Only if you set autonomy to place-within-limits, build an alert that says so, and stay inside limits you set. Before any automatic order AXE checks the account: is this a news window the account forbids, is it the weekend, is the lot above your cap, is the risk per trade above your limit, has the daily loss limit or the total loss limit been hit, have we already fired the day's maximum of automatic trades. If any of those is true it blocks the order and names the rule that stopped it. It will not quietly place a smaller trade instead. Prop accounts keep their own rule presets, and those win over anything AXE would otherwise do.",
  },
  {
    q: "Does Companion have News?",
    a: "Yes. Companion has a News screen and a cached multi-source feed (Polygon → Perigon → Finnhub → EODHD, plus FRED macro). AXE can read that same context in chat. The AXE Feed adds morning briefs, daily news and a market recap.",
  },
  {
    q: "Which market intelligence is actually live?",
    a: "Charting, depth and the news chain are live, and so is every intel feed, from free and public sources: SEC EDGAR insider filings, congressional trade disclosures from Alpha Vantage, dark-pool volume from FINRA's daily off-exchange files, options flow and market tide from Nasdaq's delayed option chains, aircraft from adsb.lol, vessels from an open AIS feed, natural events from USGS and NASA, exploited vulnerabilities from CISA and energy data from the EIA. None of these need a paid Unusual Whales subscription, which we have not bought. When a source is down, only its panel says so and shows its last good rows marked cached.",
  },
  {
    q: "How does MT5 connect?",
    a: "From Accounts after you sign in, through MetaApi's cloud. Type the server the way your firm shows it — Upcomers resolves to Upcomers-Server. Positions, equity and fills sync about every ten minutes, not on every tick. Advanced: create a per-account link token and paste it into your MT5 Expert Advisor or bridge. Only a hash of the token is stored, and you can revoke it any time.",
  },
  {
    q: "Do push notifications, auto-journal, AXE memory and the watcher work?",
    a: "Yes. Push notification delivery is live on Core and up. Core auto-journals closed trades. On Pro and up AXE remembers your journal, rules and chat context across sessions. The background watcher fires price, drawdown and trailing-stop alerts.",
  },
  {
    q: "Is my data private?",
    a: "Your workspace is private to your login. Broker rows, journal attachments and chat are not shared across accounts. The waitlist stores only the address, the surface and the source — no IP, no user-agent.",
  },
  {
    q: "Is this an App Store app?",
    a: "No. Open axecompanion.com on your phone and add it to your home screen from Safari or Chrome; it then opens like an app. No App Store needed.",
  },
];

export const LANDING_FINAL_CTA = {
  titleLead: "One account.",
  titleAccent: "Phone and desk.",
  body: "Create your account, then pick a plan in the app. AXE Companion on your phone starts at Core; Trading OS on the desk (in beta) is included.",
} as const;
