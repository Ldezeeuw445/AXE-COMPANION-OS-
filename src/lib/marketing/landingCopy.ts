/**
 * Public landing copy for AXE Companion.
 *
 * Keep this file dependency-free so `scripts/verify-landing-claims.mjs` can
 * import it with tsx and check the claims against billing + intel sources.
 * Visual chrome lives in the React sections; the promises live here.
 */

export const LANDING_HERO = {
  badge: "AXE Companion",
  titleLead: "Your trades, your journal,",
  titleAccent: "your intelligence.",
  body:
    "AXE Companion is the phone OS: live chart, depth, news, one-tap execution, quick journal, and AXE chat — synced with Trading OS on your desktop.",
} as const;

export const LANDING_SURFACES = {
  kicker: "Same stack · two surfaces",
  title: "Everything you need. Nothing you don't.",
  body:
    "AXE Companion is your mobile command center today. Trading OS adds the full terminal desk — same account, same memory, seamlessly connected.",
  quote:
    "Built for traders who want clarity without another noisy dashboard. AXE focuses on what happened in your account, why it mattered, and what to watch next. Trading OS is the desk that same memory plugs into — Companion is the brain you use first.",
} as const;

export const LANDING_ENGINE = {
  kicker: "AXE ENGINE",
  title: "The brain behind every decision.",
  body: "AXE Engine reads your account, chart, news and journal, then talks and acts only inside the rules you set.",
  items: [
    { label: "Learn", body: "Adapts from journal labels, chat feedback and the Learning Arc." },
    { label: "Ingest", body: "Broker history, live ticks, cached news, intel and the notes you attach." },
    {
      label: "Execute",
      body: "Market and limit orders to the connected broker after you confirm — plus alert auto-trade behind the five account checks.",
    },
    { label: "Analyze", body: "Chart structure, news and account context in one AXE chat." },
    {
      label: "Protect",
      body: "Pre-trade risk check and auto-trade guard: news window, weekend, lot cap, daily loss, max automatic trades.",
    },
    { label: "Orchestrate", body: "Cockpit, briefings, push alerts and journal on the same account." },
  ],
} as const;

export const LANDING_ONE = {
  kicker: "AXE ONE",
  title: "One Source of Truth.",
  body: "One account, one memory, one set of broker rows — phone and desk stay aligned.",
  items: [
    { label: "Trading Data", body: "Trades, positions, orders and fills from the linked broker." },
    { label: "Market Data", body: "Live ticks and a depth drawer anchored on your broker bid / ask." },
    { label: "News & Intel", body: "Cached news plus free intel: SEC EDGAR, congressional STOCK Act trades, GDELT, flights and vessels." },
    { label: "Unified View", body: "Chart, depth, news, execute, journal and AXE — one phone OS." },
    { label: "Consistent Data", body: "The same rows Trading OS reads. Each workspace stays private to your login." },
    { label: "Smarter Insights", body: "Context from what you actually traded, not a generic feed." },
  ],
} as const;

export const LANDING_ADAPTIVE = {
  kicker: "AXE",
  title: "Adaptive Intelligence. Real Results.",
  body: "The layer that connects the engine to your book. It learns from what you keep, dismiss and journal.",
  items: [
    { label: "Adaptive AI", body: "Suggestions you can accept or dismiss — the next ones follow what you taught." },
    { label: "Context Aware", body: "Decisions grounded in your chart, accounts, journal and news." },
    { label: "Outcome Focused", body: "Learning Arc follows real teaching moments, not a vanity score." },
    { label: "Risk Intelligent", body: "Account health and the same pre-trade checks that gate automatic orders." },
    { label: "Performance Driven", body: "Journal outcomes, alignment and chat feedback in Cockpit." },
    { label: "Built for Traders", body: "Phone-first. The desk is Trading OS — same brain, different surface." },
  ],
} as const;

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
    a: "Charting, depth, and the news chain (Polygon → Perigon → Finnhub → EODHD, plus FRED macro) are live, as are the free intel sources: SEC EDGAR insider filings, congressional STOCK Act disclosures from Alpha Vantage (House and Senate), FINRA daily short sale volume, GDELT event data, flight and vessel tracking. Dark-pool prints, options flow and market tide need a paid Unusual Whales subscription we have not bought — the app says \"not configured\" for those rather than pretending they failed.",
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
