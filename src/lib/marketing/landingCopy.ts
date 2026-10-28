/**
 * Public landing copy for AXE Companion.
 *
 * Keep this file dependency-free so `scripts/verify-landing-claims.mjs` can
 * import it with tsx and check the claims against billing + intel sources.
 * Visual chrome lives in the React sections; the promises live here.
 *
 * Hero copy is the original LaunchHeroExperience ("The trader's phone OS").
 * The feed grid, showcase rows and discipline section are ported from
 * `public/landing/index.html` (last full file at af5b0cd / 9f9351e^) and then
 * trimmed so every sentence matches the app as it ships today. "Your Second
 * Brain For Trading" was only in Luka's screenshots — rebuilt here.
 * Pricing, FAQ, waitlist and legal stay on the current truthful keep-list.
 */

/** Paid landing CTAs. Stripe Payment Links need a signed-in user id, so this
 *  is the real checkout route: sign in, then `/upgrade`. */
export const LANDING_CHECKOUT_HREF = "/login?next=/upgrade";

export const LANDING_HERO = {
  badge: "AXE Companion OS · Early access",
  titleLead: "AXE Companion.",
  titleAccent: "The trader's phone OS.",
  body:
    "AXE Companion is an MT5-native phone OS: chart with indicators and drawings, market depth, news, intel, execution, journal, AXE Feed and AXE chat — on one dark surface. Positions and fills sync from MetaApi about every ten minutes.",
} as const;

export const LANDING_RAIL = [
  "Chart, indicators and drawings",
  "Market depth drawer",
  "News, intel and AXE Feed",
  "One-tap execution dock",
  "Price alerts in the app",
] as const;

export const LANDING_REVEAL_CARDS = [
  {
    orb: "A",
    title: "Surface the signal.",
    kicker: "Canvas reveal",
    body: "One calm card layer that lights up just enough to feel alive, without breaking the dark restraint of the landing page.",
  },
  {
    orb: "X",
    title: "Quiet, but not flat.",
    kicker: "App language",
    body: "Thin Linear-style edges, cyan energy and soft reveal motion keep the whole section feeling like part of AXE itself.",
  },
  {
    orb: "E",
    title: "Premium motion cues.",
    kicker: "Depth",
    body: "Hover brings in a controlled canvas field so the cards feel reactive and expensive, not decorative or noisy.",
  },
] as const;

export const LANDING_SECOND_BRAIN = {
  badge: "AXE Companion OS",
  titleLead: "AXE Companion.",
  titleAccent: "Your Second Brain For Trading.",
  body:
    "A trading phone OS with professional charting, market intelligence, execution tools and an AI companion that reads your chart, accounts and journal. You make every trading decision.",
} as const;

export const LANDING_FEEDS_BAND = {
  kicker: "Beyond the chart",
  titleLead: "AXE intel feeds",
  titleAccent: "beside the chart.",
  body:
    "Intel sits next to the chart: SEC filings, congressional STOCK Act trades, GDELT, flights, vessels, chokepoints, news, calendar and the AXE Feed. Dark-pool prints, options flow and market tide need a paid source we have not bought — those tiles say not configured.",
} as const;

export const LANDING_DISCIPLINE = {
  kicker: "Behavior map",
  title: "Execution discipline, from your fills.",
  body:
    "Cockpit (Pro) builds a behavior map from your MT5 fills — sessions, instruments, the rules you keep. Fills arrive on the ten-minute MetaApi sync, not tick by tick. Alignment is a Cockpit score, labelled as example chrome on this page.",
  aside:
    "There is no live per-firm drawdown alert. Firm rule presets (FTMO models, Upcomers Oracle, and others by name) live in Settings, and AXE autonomy has a daily-limit guard before any automatic order.",
  quote:
    "The same dark canvas as Trading OS, the same MT5 execution dock, and a journal of fills you tag yourself — plus an intel layer that watches the board the app actually has keys for.",
  quoteBy: "AXE Companion · design principle",
} as const;

export const LANDING_INTRO = {
  kicker: "First impression",
  titleLead: "Secure. Intelligent.",
  titleAccent: "Encrypted.",
  body: "From the login screen — the particle triangle, a private command channel, one tap to enter.",
  loginTitle: "Private command channel",
  loginBody: "Signed-in workspace · not a social feed · your data stays yours",
  splashTitle: "Boot sequence",
  splashBody: "Particle triangle · signed-in workspace · restore your last chart",
} as const;

export const LANDING_SHOWCASE_BAND = {
  kicker: "Inside the app",
  titleLead: "Every screen,",
  titleAccent: "built for the candle.",
  body: "From the chart to the cockpit — every pixel is tuned for the trader who needs clarity, not clutter.",
} as const;

export const LANDING_SHOWCASE: ReadonlyArray<{
  step: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  image: string;
  alt: string;
  flip?: boolean;
}> = [
  {
    step: "01 · Chart",
    title: "Read the candle, not the noise.",
    body: "MT5 candles on a calm dark canvas — Auto-Fib, BOS/CHoCH structure, order blocks and FVGs that extend until mitigated. Lightweight Charts, with drawings (trendline, rectangle, text, horizontal). Stochastic and ADX math is in the repo; they are not on the chart toggles yet.",
    href: "#hero-devices",
    cta: "Open the chart",
    image: "/landing/photos/809_1x_shots_so.png",
    alt: "AXE Chart — BOS/LH/SFP structure",
  },
  {
    step: "02 · Intel",
    title: "See the board we actually watch.",
    body: "Chokepoints, military radar, vessels and jets from free sources, plus SEC EDGAR and congressional STOCK Act trades. Dark-pool, options and tide tiles exist and say not configured until that paid source is bought.",
    href: "#product",
    cta: "Explore the feeds",
    image: "/landing/photos/54_1x_shots_so.png",
    alt: "AXE Intel Analysis",
    flip: true,
  },
  {
    step: "03 · Cockpit",
    title: "It reads your fills.",
    body: "A behavior map from MT5 fills on the ten-minute sync. Alignment is a Cockpit score for Pro and above — example chrome on this page, live numbers in your own workspace. Daily and weekly briefings are part of that stack.",
    href: "#cockpit",
    cta: "See your Cockpit",
    image: "/landing/photos/482_1x_shots_so.png",
    alt: "AXE Cockpit — alignment",
  },
  {
    step: "04 · AXE Chat",
    title: "Your analyst, on the phone.",
    body: "Ask AXE about your chart, your trades, your thesis. It reads the candle, the structure and the intel the app has. Streaming replies. You make every trading decision.",
    href: "/chat",
    cta: "Talk to AXE",
    image: "/landing/photos/595_1x_shots_so.png",
    alt: "AXE Chat — H1 Analysis",
    flip: true,
  },
  {
    step: "05 · Market Depth",
    title: "See the order book.",
    body: "Real L1 bid/ask from your broker plus a labelled synthetic ladder — spread, mid, uptick/downtick. Honest about what is real and what is estimated.",
    href: "#hero-devices",
    cta: "Open Depth",
    image: "/landing/photos/446_1x_shots_so.png",
    alt: "AXE Market Depth",
  },
  {
    step: "06 · Global Chokepoints",
    title: "Trade the supply chain.",
    body: "Hormuz, Malacca, Suez, Panama, Bab-el-Mandeb, Taiwan Strait — ship counts and risk scoring as conflict reshapes logistics.",
    href: "#product",
    cta: "Track Chokepoints",
    image: "/landing/photos/688_1x_shots_so.png",
    alt: "AXE Global Chokepoints",
    flip: true,
  },
  {
    step: "07 · MT5 Connect",
    title: "Your broker, your data.",
    body: "Connect multiple MT5 accounts via MetaApi — Goat Funded Trader, FTMO, FundedNext, Upcomers or your own. Dashboard names such as Upcomers resolve to the real server (Upcomers-Server) before Connect. Fills sync about every ten minutes.",
    href: "#mt5",
    cta: "Connect MT5",
    image: "/landing/photos/569_1x_shots_so.png",
    alt: "AXE MT5 Connect",
  },
  {
    step: "08 · Chart Tools",
    title: "Every tool, one drawer.",
    body: "Volume, MA, MACD, Bollinger, RSI, VWAP, POC, Fib, trendlines, rectangles, text, horizontal levels and S&D zones. Drag on, configure, toggle. No clutter, no hunting through menus.",
    href: "#hero-devices",
    cta: "Browse Tools",
    image: "/landing/photos/423_1x_shots_so-2.png",
    alt: "AXE Chart Tools",
    flip: true,
  },
];

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
  /** Wide tiles in public/landing/index.html (span2). */
  span?: 2;
  /** True when the tile exists in the app but the paid source is not bought. */
  notConfigured?: boolean;
};

/**
 * The 19 intel tiles from `public/landing/index.html`, kept in that order.
 *
 * Count matches this repo: 13 `IntelProviderStatus` ids in `intelClient.ts`
 * plus Macro, Calendar, News, Correlation, Conviction and Déjà Vu.
 *
 * The paid options/dark-pool vendor is never named here. Dark pool, options
 * flow and market tide exist as tiles and are marked notConfigured; the FAQ
 * is the only place that says we have not bought that source. Do not paste
 * sample tide or dark-pool notionals into copy.
 */
export const LANDING_INTEL_FEEDS: ReadonlyArray<LandingIntelFeed> = [
  {
    title: "AXE Intel Tide",
    desc: "Net call vs put premium. This tile is in the app; it stays not configured until the paid source is bought.",
    icon: "tide",
    span: 2,
    notConfigured: true,
  },
  {
    title: "AXE Macro",
    desc: "Rates, inflation, growth and central-bank posture from FRED and the news chain, distilled into a regime read.",
    icon: "macro",
  },
  {
    title: "AXE Market Conviction",
    desc: "A conviction read the intel desk can generate from the feeds we actually have — not a live paid tape.",
    icon: "conviction",
  },
  {
    title: "AXE Insider Flow",
    desc: "Form-4 buys and sells the moment they hit, sized in dollars, ranked by signal. SEC EDGAR, no paid tape.",
    icon: "insider",
  },
  {
    title: "AXE Policy Flow",
    desc: "Congressional STOCK Act trades — House and Senate — from Alpha Vantage, not a paid tape.",
    icon: "policy",
  },
  {
    title: "AXE Dark Pool",
    desc: "Off-exchange block prints. This tile is in the app; it stays not configured until the paid source is bought.",
    icon: "darkpool",
    notConfigured: true,
  },
  {
    title: "AXE Options Flow",
    desc: "Sweeps, blocks and unusual contracts. This tile is in the app; it stays not configured until the paid source is bought.",
    icon: "options",
    notConfigured: true,
  },
  {
    title: "AXE Jet Tracker",
    desc: "Corporate jets. Who is airborne, who is grounded — Dell, Alphabet, Pfizer, ExxonMobil and the rest of the tracked fleet.",
    icon: "jets",
  },
  {
    title: "AXE Military Radar",
    desc: "Aircraft tracked across bombers, ISR and tankers — flight level and speed when the feed has a fresh row.",
    icon: "radar",
  },
  {
    title: "AXE Emergency Monitor",
    desc: "Distress feed across global airspace. Active alerts surface the moment a row exists.",
    icon: "emergency",
  },
  {
    title: "AXE Vessel Intel",
    desc: "Tracked tankers and container ships positioned against live chokepoint risk.",
    icon: "vessel",
  },
  {
    title: "AXE Energy Flow",
    desc: "Crude, gas and power series the energy desk can read — cargoes, storage and pipeline shifts.",
    icon: "energy",
  },
  {
    title: "AXE Global Chokepoints",
    desc: "Hormuz, Malacca, Suez, Panama, Bab-el-Mandeb, Taiwan Strait — ship counts and risk scoring as conflict reshapes supply chains.",
    icon: "chokepoints",
    span: 2,
  },
  {
    title: "AXE Seismic Events",
    desc: "Earthquakes, volcanoes, wildfires and conflict events tagged with market impact — supply shocks before the wire catches up.",
    icon: "seismic",
  },
  {
    title: "AXE Cyber Intel",
    desc: "Breaches, ransomware and outages mapped to tickers — the digital risk feed equities now trade on.",
    icon: "cyber",
  },
  {
    title: "AXE Correlation Engine",
    desc: "Cross-asset correlations computed in-app — how gold, yields, crude and crypto are moving together, including Déjà Vu similar-pattern rows.",
    icon: "correlation",
    span: 2,
  },
  {
    title: "AXE News",
    desc: "Multi-source headlines fused and de-duped — cached so a quiet hour never burns your feed.",
    icon: "news",
  },
  {
    title: "AXE Calendar",
    desc: "Upcoming events, prints and earnings on one timeline — know what hits the tape before it does.",
    icon: "calendar",
  },
  {
    title: "AXE Déjà Vu",
    desc: "Similar-pattern rows inside the correlation engine — historical analogues to today's setup, when that engine has data.",
    icon: "dejavu",
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

/** Companion-only tiles. Trading OS capabilities belong in LANDING_TOS_BRIDGE. */
export const COMPANION_FEATURES: ReadonlyArray<{
  title: string;
  desc: string;
  icon: LandingFeatureIcon;
}> = [
  {
    title: "Chart, indicators and drawings",
    desc: "Candles, Auto-Fib (Auto / Swing / Day), Auto-Trend, swing points, BOS/CHoCH, Volume, MA, MACD, Bollinger, RSI, VWAP, POC — plus trendline, rectangle, text and horizontal drawings.",
    icon: "chart",
  },
  {
    title: "Order Blocks, FVG, iFVG that extend",
    desc: "Volumetric order blocks, fair-value gaps and inverse FVGs that keep extending until they are mitigated. Pick 1, 2 or 3 per side.",
    icon: "chart",
  },
  {
    title: "Market depth drawer",
    desc: "Slide out depth from the top bar. Real L1 bid/ask from your broker plus a labelled synthetic ladder — spread, mid, uptick / downtick.",
    icon: "depth",
  },
  {
    title: "News, intel and AXE Feed",
    desc: "Polygon, Perigon, Finnhub, EODHD and FRED, cached for 5 minutes. Intel adds SEC EDGAR, congressional STOCK Act trades, GDELT, flight and vessel tracking. The AXE Feed carries morning briefs, daily news and the market recap.",
    icon: "news",
  },
  {
    title: "One-tap execution dock",
    desc: "Market, buy / sell limit, SL, TP, deviation — locked to the chart. Live orders need the connected broker, Live Trading on, and a confirm banner.",
    icon: "execute",
  },
  {
    title: "AXE chat with your book pinned",
    desc: "Chat that reads your chart, accounts, journal, news and intel. Technical analysis and educational context — you make every trading decision.",
    icon: "chat",
  },
  {
    title: "Journal from your fills",
    desc: "Trades land from the broker on the ten-minute sync; you tap an outcome. Attach a voice note, a photo or a chart snapshot. Automatic journal labels are not running. Win rate and calendar come from the rows you tag.",
    icon: "journal",
  },
  {
    title: "Price alerts in the app",
    desc: "In-app price alerts on the chart. Push notification delivery is not live. There is no live per-firm drawdown alert.",
    icon: "push",
  },
  {
    title: "MT5 via MetaApi",
    desc: "Multiple cloud MT5 accounts from Accounts. Known brokers include FTMO, Goat Funded Trader, FundedNext and Upcomers. Dashboard names such as Upcomers resolve to the real server before Connect. Positions and fills sync about every ten minutes. Advanced: a hashed per-account link token in your EA / bridge.",
    icon: "mt5",
  },
  {
    title: "Firm rules and autonomy guard",
    desc: "Per-firm rule presets from the MT5 server name (FTMO 2-Step / 1-Step / Instant, Upcomers Oracle, others by name). AXE autonomy has three levels; unattended orders need your limits and a daily-trade cap. It blocks and names the rule. It never quietly shrinks the trade. It does not fire a live drawdown alert.",
    icon: "risk",
  },
  {
    title: "Learning Arc and Cockpit",
    desc: "Pro and above: Cockpit, Learning Arc, trade prep, chart actions, account health, daily and weekly briefings. Alignment is a Cockpit score from your own workspace, not a generic FIT gauge.",
    icon: "arc",
  },
  {
    title: "Multi-account, private workspaces",
    desc: "Funded, demo, live — one active account at a time, analytics scoped per account. Each workspace stays private to your login. Optional crypto wallets live under the same login. Install as a PWA from the browser; no App Store required.",
    icon: "accounts",
  },
];

export const LANDING_TOS_BRIDGE = {
  kicker: "with Trading OS",
  title: "The desk Companion plugs into.",
  body:
    "These belong to Trading OS, the desktop terminal — not to the phone OS. Same login, same account, when the desk is what you need.",
  features: [
    "Multi-chart layouts and a command palette",
    "QuantLab, Intel Center, News and Macro terminals",
    "Sector heatmap, market scanner, session banners",
    "Sentiment suite on the desk",
  ],
} as const;

export const LANDING_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Does AXE place trades?",
    a: "Yes — through the connected broker, with safety checks. New accounts get a free virtual demo on live prices. Live execution stays off until you turn it on: it needs the linked account and a one-time disclaimer, and only then does the BUY / SELL dock send real orders (market, buy / sell limit, SL, TP, deviation). Automatic orders only fire from an alert you armed, and only after the five account checks below, inside the autonomy level you set.",
  },
  {
    q: "Can AXE place a trade without me pressing anything?",
    a: "Only if you set autonomy to place-within-limits, build an alert that says so, and stay inside limits you set. Before any automatic order AXE checks the account: is this a news window the account forbids, is it the weekend, is the lot above your cap, has the daily loss limit already been hit, have we already fired the day's maximum of automatic trades. If any of those is true it blocks the order and names the rule that stopped it. It will not quietly place a smaller trade instead. Prop and evaluation accounts keep their own rule presets — those win over anything AXE would otherwise do. There is no live per-firm drawdown alert.",
  },
  {
    q: "Does Companion have News?",
    a: "Yes. Companion ships a News surface and a cached multi-source feed (Polygon → Perigon → Finnhub → EODHD, plus FRED macro). Chat can pull that same context. The AXE Feed adds morning briefs, daily news and a market recap. You do not need Trading OS, and you do not need a separate News tab in the desktop terminal, to read headlines in Companion.",
  },
  {
    q: "Do I need a News tab in AXE Companion to get market or news context in chat?",
    a: "No. The News surface is there when you want the feed, but AXE chat can already read the cached headlines and intel for the pair you have open. Companion has News — it is not a Trading OS-only panel.",
  },
  {
    q: "Which market intelligence is actually live?",
    a: "Charting, depth, and the news chain (Polygon → Perigon → Finnhub → EODHD, plus FRED macro) are live, as are the free intel sources: SEC EDGAR insider filings, congressional STOCK Act disclosures from Alpha Vantage (House and Senate), GDELT event data, flight and vessel tracking. Dark-pool prints, options flow and market tide need a paid Unusual Whales subscription we have not bought — the app says \"not configured\" for those rather than pretending they failed.",
  },
  {
    q: "How does MT5 connect?",
    a: "Recommended path: in-app cloud MT5 from Accounts after you sign in, via MetaApi. Type the server the way your firm shows it — Upcomers resolves to Upcomers-Server when MetaApi knows that name. Positions, equity and fills sync about every ten minutes, not on every tick. Advanced: create a per-account link token and paste it into your MT5 Expert Advisor or bridge. Only a hash of the token is stored; you can revoke it any time.",
  },
  {
    q: "Where do I paste the MT5 link token?",
    a: "Not inside this app. Put it in your MT5 Expert Advisor or bridge. After the first successful post, trades, equity and stats flow on the same ten-minute sync — see Accounts right after you create a token.",
  },
  {
    q: "Do push notifications, auto-journal labels or AXE memory work?",
    a: "Price alerts work in the app. Push notification delivery is not live. Journal rows come from broker fills; you tap the outcome — automatic labels are not running. A long-term AXE memory table is not in this deployment. Daily and weekly briefings, the AXE Feed, Cockpit and Learning Arc (Pro) are what remember you today.",
  },
  {
    q: "Is my data private?",
    a: "Your workspace stays private to your login. Broker rows, journal attachments, chat and waitlist writes do not leak across accounts. The waitlist stores only the address, the surface and the source — no IP, no user-agent.",
  },
  {
    q: "What is Trading OS, and how does it relate to AXE?",
    a: "AXE Companion is the phone-first OS — chart, depth, news, intel, alerts, journal, accounts and AXE all work standalone. Trading OS is the desktop terminal on the same login, currently in private beta: multi-chart layouts, QuantLab, Intel Center, macro terminal. One account across both. The switcher in the top-left corner moves you between them.",
  },
  {
    q: "Do I need Trading OS on desktop?",
    a: "No. Chart, depth, news, intel, alerts, journal, accounts and AXE all work standalone in the phone OS — Companion is not a companion to anything, it is the product. Trading OS is the desktop terminal on the same login, currently in private beta: multi-chart layouts, QuantLab, Intel Center, macro terminal. One account across both. The switcher in the top-left corner moves you between them.",
  },
  {
    q: "How does news caching keep my provider bills sane?",
    a: "Every news call is keyed by symbol + provider and cached for 5 minutes. Polygon is tried first (paid feed, deepest coverage), then Perigon → Finnhub → EODHD. A quiet hour costs you a single round of cached calls instead of N×providers per page-view.",
  },
  {
    q: "Is this an App Store app?",
    a: "Install the site as a PWA on your home screen (Safari / Chrome) — no App Store required for the core flow. The hero shows a no-login walkthrough of the current screens.",
  },
];

export const LANDING_FINAL_CTA = {
  titleLead: "One account.",
  titleAccent: "One trading brain.",
  body: "Start with AXE Companion today — Trading OS terminal access widens through the same waitlist when you want the desk.",
} as const;

/** Off by default. Flip NEXT_PUBLIC_LANDING_TESTIMONIALS=1 when real, reviewed quotes exist. */
export function landingTestimonialsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.NEXT_PUBLIC_LANDING_TESTIMONIALS ?? "").trim() === "1";
}

/** Published quotes only. Empty until a real, reviewed submission is approved. */
export const LANDING_TESTIMONIALS: ReadonlyArray<{
  name: string;
  role: string;
  quote: string;
}> = [];
