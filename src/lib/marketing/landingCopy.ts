/**
 * Public landing copy for AXE Companion.
 *
 * Keep this file dependency-free so `scripts/verify-landing-claims.mjs` can
 * import it with tsx and check the claims against billing + intel sources.
 * Visual chrome lives in the React sections; the promises live here.
 *
 * Hero copy is the original LaunchHeroExperience ("The trader's phone OS").
 * The 19-feed grid, showcase rows and execution-discipline section are ported
 * from `public/landing/index.html` (last full file at af5b0cd / 9f9351e^).
 * "Your Second Brain For Trading" was only in Luka's screenshots — rebuilt
 * here. Pricing, FAQ, waitlist and legal stay on the current truthful keep-list.
 */

export const LANDING_HERO = {
  badge: "AXE Companion OS · Early access",
  titleLead: "AXE Companion.",
  titleAccent: "The trader's phone OS.",
  body:
    "AXE Companion is what an MT5-native phone workflow should feel like: live chart, depth, news, intel, execution, journal and AXE in one calm dark operating surface.",
} as const;

export const LANDING_RAIL = [
  "Live chart, premium toolset",
  "Market depth drawer",
  "News & intel, cached to save credits",
  "One-tap execution dock",
  "AXE copilot that knows the app",
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
    "A premium trading platform combining professional charting, market intelligence, execution tools and an AI companion that learns, adapts and evolves alongside you. Trade smarter. Stay consistent. Improve continuously.",
} as const;

export const LANDING_FEEDS_BAND = {
  kicker: "Beyond the chart",
  titleLead: "live AXE feeds",
  titleAccent: "no other trading app has.",
  body:
    "AXE watches what actually moves markets — macro, geopolitics, logistics, military activity, smart money and more — and streams it live, right next to your chart.",
} as const;

export const LANDING_DISCIPLINE = {
  kicker: "Behavior map",
  title: "Execution discipline, visible in real time.",
  body:
    "AXE builds a behavior map from your real MT5 fills — sessions, instruments, the rules you keep and the ones you break. The FIT score tracks alignment.",
  aside:
    "Not a dashboard that judges you after the fact — a technical analysis tool that tracks your patterns before you make them.",
  quote:
    "The same calm dark canvas as Trading OS, the same execution model as MT5, the same brain that journals what you actually did — wrapped around an intelligence layer that watches the whole board.",
  quoteBy: "AXE Companion · design principle",
} as const;

export const LANDING_INTRO = {
  kicker: "First impression",
  titleLead: "Secure. Intelligent.",
  titleAccent: "Encrypted.",
  body: "From the moment you open AXE — the particle triangle, the encrypted command channel, one tap to enter.",
  loginTitle: "Private command channel",
  loginBody: "Signed-in workspace · not a social feed · your data stays yours",
  splashTitle: "Boot sequence",
  splashBody: "Particle triangle · encrypted handshake · live context restore",
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
    body: "MT5 ticks on a calm dark canvas — auto-Fib, BOS/CHoCH structure, order blocks and FVGs that extend until mitigated. Lightweight Charts, steady and sharp.",
    href: "#hero-devices",
    cta: "Open the chart",
    image: "/landing/photos/809_1x_shots_so.png",
    alt: "AXE Chart — BOS/LH/SFP structure",
  },
  {
    step: "02 · Intel",
    title: "See the whole board.",
    body: "Global chokepoints, military radar, vessels and jets — live AXE feeds that watch what actually moves price, scored by risk and surfaced the moment they shift.",
    href: "#product",
    cta: "Explore the feeds",
    image: "/landing/photos/54_1x_shots_so.png",
    alt: "AXE Intel Analysis",
    flip: true,
  },
  {
    step: "03 · Cockpit",
    title: "It learns your edge.",
    body: "A behavior map built from your real MT5 fills. The FIT score tracks how aligned your execution is with your plan — a technical analysis tool that tracks your patterns before you make them.",
    href: "#cockpit",
    cta: "See your Cockpit",
    image: "/landing/photos/482_1x_shots_so.png",
    alt: "AXE Cockpit — FIT alignment",
  },
  {
    step: "04 · AXE Chat",
    title: "Your analyst, always on.",
    body: "Ask AXE about your chart, your trades, your thesis. Full context awareness — it sees the candle, the structure, the intel. Streaming responses with chart-aware reasoning.",
    href: "/chat",
    cta: "Talk to AXE",
    image: "/landing/photos/595_1x_shots_so.png",
    alt: "AXE Chat — H1 Analysis",
    flip: true,
  },
  {
    step: "05 · Market Depth",
    title: "See the order book.",
    body: "Real L1 bid/ask from your broker plus a deterministic synthetic ladder — spread, mid, uptick/downtick. Honest about what's real and what's estimated.",
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
    body: "Connect multiple MT5 accounts — Goat, FTMO, Funded Next or your own. AXE reads your fills, syncs your history and keeps your edge private.",
    href: "#mt5",
    cta: "Connect MT5",
    image: "/landing/photos/569_1x_shots_so.png",
    alt: "AXE MT5 Connect",
  },
  {
    step: "08 · Chart Tools",
    title: "Every tool, one drawer.",
    body: "Indicators, annotations, overlays — RSI, MACD, Volume, Fib, trendlines, S&D zones. Drag on, configure, toggle. No clutter, no hunting through menus.",
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
};

/**
 * The 19 intel tiles from `public/landing/index.html`, kept in that order.
 *
 * Count matches this repo: 13 `IntelProviderStatus` ids in `intelClient.ts`
 * plus Macro, Calendar, News, Correlation, Conviction and Déjà Vu.
 *
 * Unusual Whales is never named here. Dark pool, options flow and market tide
 * exist as tiles; the FAQ is the only place that says we have not bought the
 * paid source. No fabricated notionals ($1.71B, SPY 1.2M).
 */
export const LANDING_INTEL_FEEDS: ReadonlyArray<LandingIntelFeed> = [
  {
    title: "AXE Intel Tide",
    desc: "Net call vs put premium, directional bias per instrument and smart-money pressure — the same tide the Intel desk reads.",
    icon: "tide",
    span: 2,
  },
  {
    title: "AXE Macro",
    desc: "Rates, inflation, growth and central-bank posture distilled into a regime read that frames every trade.",
    icon: "macro",
  },
  {
    title: "AXE Market Conviction",
    desc: "A single conviction score blending breadth, flow and momentum — how hard the tape is leaning.",
    icon: "conviction",
  },
  {
    title: "AXE Insider Flow",
    desc: "Form-4 buys and sells the moment they hit, sized in dollars, ranked by signal. SEC EDGAR, no paid tape.",
    icon: "insider",
  },
  {
    title: "AXE Policy Flow",
    desc: "Congressional STOCK Act trades — House and Senate — the policy tape that front-runs the price tape.",
    icon: "policy",
  },
  {
    title: "AXE Dark Pool",
    desc: "Off-exchange block prints so size can show up before it moves the lit book.",
    icon: "darkpool",
  },
  {
    title: "AXE Options Flow",
    desc: "Sweeps, blocks and unusual contracts — strike, premium and aggressor side.",
    icon: "options",
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
    desc: "Crude, gas and power — cargoes, storage and pipeline shifts that set the floor under risk assets.",
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
    desc: "Cross-asset correlations computed live — how gold, yields, crude and crypto are actually moving together right now.",
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
    desc: "Similar-patterns engine — finds the historical analogues to today's setup and what happened next.",
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
    title: "Live chart, premium toolset",
    desc: "Live ticks, Auto-Fib (Auto / Swing / Day), Auto-Trend, swing points, BOS/CHoCH and an MA stack — a calm dark canvas, not a noisy widget.",
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
    title: "News & intel, cached to save credits",
    desc: "Polygon, Perigon, Finnhub, EODHD and FRED, cached for 5 minutes. Intel adds SEC EDGAR, congressional STOCK Act trades, GDELT, flight and vessel tracking.",
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
    title: "Quick journal with voice, photo, snapshot",
    desc: "Trades land from the broker; you tap an outcome. Attach a voice note, a photo or a chart snapshot. Win rate and calendar come from those rows, never a guess.",
    icon: "journal",
  },
  {
    title: "Push alerts with deep links",
    desc: "Server-triggered push that opens the right screen — alert, chat, journal, cockpit — instead of a dead home screen.",
    icon: "push",
  },
  {
    title: "MT5 link — cloud or hashed token",
    desc: "Recommended: in-app cloud MT5 from Accounts. Advanced: a per-account link token in your EA / bridge. Only a hash is stored; you can revoke any time.",
    icon: "mt5",
  },
  {
    title: "Risk and pre-trade check",
    desc: "Before an automatic order AXE checks the account: news window, weekend, lot cap, daily loss, day's automatic-trade maximum. It blocks and names the rule. It never quietly shrinks the trade.",
    icon: "risk",
  },
  {
    title: "Learning Arc and Cockpit",
    desc: "Pro and above: Cockpit, Learning Arc, trade prep, chart actions and account health — the parts that have to remember you.",
    icon: "arc",
  },
  {
    title: "Multi-account, private workspaces",
    desc: "Funded, demo, live — one active account at a time, analytics scoped per account. Each workspace stays private to your login. Optional crypto wallets live under the same login.",
    icon: "accounts",
  },
];

export const LANDING_TOS_BRIDGE = {
  kicker: "with Trading OS",
  title: "The desk Companion plugs into.",
  body:
    "These belong to Trading OS, the desktop terminal — not to the phone OS. Same account, same AXE memory, when the desk is what you need.",
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
    a: "Yes — through the connected broker, with safety checks. New accounts get a free virtual demo on live prices. Live execution stays off until you turn it on: it needs the linked account and a one-time disclaimer, and only then does the BUY / SELL dock send real orders (market, buy / sell limit, SL, TP, deviation). Automatic orders only fire from an alert you armed, and only after the five account checks below.",
  },
  {
    q: "Can AXE place a trade without me pressing anything?",
    a: "Only if you build an alert that says so, and only inside limits you set. Before any automatic order AXE checks the account: is this a news window the account forbids, is it the weekend, is the lot above your cap, has the daily loss limit already been hit, have we already fired the day's maximum of automatic trades. If any of those is true it blocks the order and names the rule that stopped it. It will not quietly place a smaller trade instead. Prop and evaluation accounts keep their own rules — those win over anything AXE would otherwise do.",
  },
  {
    q: "Does Companion have News?",
    a: "Yes. Companion ships a News surface and a cached multi-source feed (Polygon → Perigon → Finnhub → EODHD, plus FRED macro). Chat can pull that same context. You do not need Trading OS, and you do not need a separate News tab in the desktop terminal, to read headlines in Companion.",
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
    a: "Recommended path: in-app cloud MT5 from Accounts after you sign in. Advanced: create a per-account link token and paste it into your MT5 Expert Advisor or bridge. After the first successful post, trades, equity and live stats flow automatically. Only a hash of the token is stored; you can revoke it any time.",
  },
  {
    q: "Where do I paste the MT5 link token?",
    a: "Not inside this app. Put it in your MT5 Expert Advisor or bridge. After the first successful post, trades, equity and live stats flow automatically — see Accounts right after you create a token.",
  },
  {
    q: "Is my data private?",
    a: "Your workspace stays private to your login. Broker rows, journal attachments, chat and waitlist writes do not leak across accounts. The waitlist stores only the address, the surface and the source — no IP, no user-agent.",
  },
  {
    q: "What is Trading OS, and how does it relate to AXE?",
    a: "AXE Companion is the phone-first OS — chart, depth, news, intel, alerts, journal, accounts and AXE all work standalone. Trading OS is the desktop terminal on the same login, currently in private beta: multi-chart layouts, QuantLab, Intel Center, macro terminal. One account, one memory, one trading brain across both. The switcher in the top-left corner moves you between them.",
  },
  {
    q: "Do I need Trading OS on desktop?",
    a: "No. Chart, depth, news, intel, alerts, journal, accounts and AXE all work standalone in the phone OS — Companion is not a companion to anything, it is the product. Trading OS is the desktop terminal on the same login, currently in private beta: multi-chart layouts, QuantLab, Intel Center, macro terminal. One account, one memory, one trading brain across both. The switcher in the top-left corner moves you between them.",
  },
  {
    q: "How does news caching keep my provider bills sane?",
    a: "Every news call is keyed by symbol + provider and cached for 5 minutes. Polygon is tried first (paid feed, deepest coverage), then Perigon → Finnhub → EODHD. A quiet hour costs you a single round of cached calls instead of N×providers per page-view.",
  },
  {
    q: "Is this an App Store app?",
    a: "Install the site as a PWA on your home screen (Safari / Chrome) — no App Store required for the core flow. The hero shows what that PWA looks like.",
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
