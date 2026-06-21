/** AXE Companion marketing copy — same section shape as the main landing, AXE-specific text. */

export const AXE_HERO = {
  badge: 'AXE Companion',
  headlineLine1: 'Your trades, your journal,',
  headlineLine2: 'your intelligence.',
  subtext:
    'AXE connects broker history, quick journal labels, and private memory into one workspace — powered by the same Supabase account and shared engine layer as Trading OS, our upcoming premium trading terminal (live charts, intelligence, alerts, execution desk).',
  phoneAlt: 'AXE Companion — chat and context on mobile',
};

export const AXE_STORY_QUOTE =
  'Built for traders who want clarity without another noisy dashboard. AXE focuses on what happened in your account, why it mattered, and what to watch next. When Trading OS launches, the same memory and context carry into the full terminal experience — for now, AXE Companion is the brain you use first.';

/** Product bridge: every “Trading OS” mention explains what it is (premium terminal, coming soon). */
export const AXE_PRODUCT_BRIDGE = {
  badge: 'Trading OS terminal — coming soon',
  headline1: 'Standalone companion today.',
  headline2: 'Full trading terminal tomorrow.',
  body:
    'AXE Companion works as a standalone AI trading assistant now — chat, accounts, journal, notes, and memory on one Supabase spine. Trading OS is the upcoming premium terminal that brings AXE into live charts, market intelligence, alerts, execution workflows, and a full multi-source desk. One account, one memory, one trading brain across both.',
  tagline: 'AXE Companion is the brain. Trading OS is the terminal.',
};

export const AXE_INSTRUMENTS = [
  'XAU/USD',
  'EUR/USD',
  'NAS100',
  'BTC/USD',
  'US30',
  'GBP/USD',
  'USD/JPY',
  'WTI',
  'SPX500',
];

export const AXE_FEATURES_SECTION = {
  badge: 'Built for real accounts',
  headline1: 'Journal that writes itself.',
  headline2: 'Insights you can trust.',
  subtext:
    'Trades land from MT5 via a secure ingest token. You tag outcomes in one tap. Analytics and memory stay tied to the account you select.',
};

export const AXE_FEATURES: { iconKey: string; title: string; desc: string; colorKey: string }[] = [
  {
    iconKey: 'BarChart2',
    title: 'Broker trade history',
    desc: 'Closed trades sync into your private ledger with idempotent upserts — no double-counting when the bridge retries.',
    colorKey: 'emerald',
  },
  {
    iconKey: 'Radio',
    title: 'MT5 bridge (Phase 1)',
    desc: 'Per-account link token, revocable later. Ingest only — no execution from AXE in v1.',
    colorKey: 'blue',
  },
  {
    iconKey: 'Database',
    title: 'Multi-account',
    desc: 'Funded, demo, live, multiple brokers — pick an active account and keep analytics scoped to it.',
    colorKey: 'amber',
  },
  {
    iconKey: 'Brain',
    title: 'AXE memory & context',
    desc: 'Pair-aware notes and recall so follow-ups stay grounded in what you actually did in the market.',
    colorKey: 'violet',
  },
  {
    iconKey: 'Target',
    title: 'Five-tap journal labels',
    desc: 'A+ setup through rule break — fast enough to use every session without writing essays.',
    colorKey: 'red',
  },
  {
    iconKey: 'LineChart',
    title: 'Analytics that match the book',
    desc: 'Win rate, profit factor, P&L, and calendar views driven from the same broker rows you journal.',
    colorKey: 'cyan',
  },
  {
    iconKey: 'Shield',
    title: 'RLS + Supabase',
    desc: 'Accounts, trades, and labels are scoped per user in Postgres — not mixed across workspaces.',
    colorKey: 'teal',
  },
  {
    iconKey: 'Layout',
    title: 'Trading OS terminal path',
    desc:
      'Ship AXE standalone first. Trading OS — our upcoming premium trading terminal — will plug into the same accounts, journal, and AXE intelligence when you want the full desk.',
    colorKey: 'indigo',
  },
];

export const AXE_STATS = [
  { number: '1', label: 'Ingest pipeline', sub: 'MT5 → Edge → broker_trades (Phase 1)', color: 'emerald' },
  { number: '∞', label: 'Accounts', sub: 'Multi-account model with active selection', color: 'blue' },
  { number: '5', label: 'Journal taps', sub: 'Fast labels per trade + optional notes', color: 'violet' },
];

export const AXE_BUILT_DIFFERENT = {
  badge: 'Same craft — AXE is the brain, Trading OS is the terminal',
  headline1: 'Not another generic chatbot.',
  headline2: 'A finance-native companion with receipts.',
};

export const AXE_PRICING_SECTION = {
  headline: 'Simple pricing.',
  subtext:
    'AXE launches with early access. Public tiers will ship with billing — join the waitlist for AXE and updates on Trading OS, our upcoming premium trading terminal.',
  priceText: 'Coming Soon',
  priceSub: 'No public pricing yet — we are prioritizing reliability and data quality.',
};

export const AXE_PRICING_PLANS: {
  tier: string;
  desc: string;
  features: string[];
  cta: string;
  highlight: boolean;
}[] = [
  {
    tier: 'Early',
    desc: 'For solo traders testing the bridge',
    features: ['MT5 ingest (token)', 'Multi-account', 'Journal labels', 'Analytics snapshot'],
    cta: 'Join waitlist',
    highlight: false,
  },
  {
    tier: 'Pro',
    desc: 'When billing goes live',
    features: [
      'Higher ingest limits',
      'Deeper analytics',
      'Priority support',
      'Bundle path with Trading OS premium terminal when it ships',
    ],
    cta: 'Join waitlist',
    highlight: true,
  },
  {
    tier: 'Desk',
    desc: 'Teams & prop workflows',
    features: ['Shared policies (later)', 'Audit trails (later)', 'Custom retention (later)'],
    cta: 'Contact',
    highlight: false,
  },
];

export const AXE_FAQ: { q: string; a: string }[] = [
  {
    q: 'Does AXE place trades?',
    a: 'No. Phase 1 is ingest, accounts, history, journal labels, and analytics only. Execution stays at your broker unless we add a hardened confirm flow later.',
  },
  {
    q: 'How does MT5 connect?',
    a: 'Each broker account gets its own link token. Your EA or bridge posts closed trades to the axe-mt5-ingest Edge Function; trades upsert by external_trade_id so retries do not duplicate rows.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes — Supabase Row Level Security scopes broker accounts, trades, and labels to your user id. Tokens are not shown again after creation.',
  },
  {
    q: 'What is Trading OS, and how does it relate to AXE?',
    a:
      'Trading OS is our upcoming premium trading terminal — live charts, market intelligence, alerts, execution workspace, watchlists, and multi-source data, with AXE embedded as the intelligence layer. AXE Companion ships first as a standalone assistant; you do not need the terminal UI to use AXE. Same Supabase user, auth, broker accounts, trades, journal, notes, and AXE memory across both — not a separate data island.',
  },
  {
    q: 'Do I need a News tab in AXE Companion to get market or news context in chat?',
    a:
      'No. A News tab is a terminal screen, not the source of truth. AXE Companion can use the same shared engine and Supabase-backed context server-side when you ask about markets or headlines — even without a dedicated News page in the mobile UI. We wire intelligence through the engine layer, not by duplicating databases.',
  },
];

export const AXE_MOBILE_INSTALL = {
  badge: 'Phone-first shell',
  headline: 'AXE Companion on your phone',
  subtext:
    'The Companion app is built for chat, accounts, history, and quick actions — same Supabase account and shared engine-backed context as this site. Trading OS is our upcoming premium terminal on the same spine when it ships. Tap “Get AXE Companion” for a QR after you set the public Companion URL in env.',
  qrAlt: 'QR code to open AXE Companion mobile app',
  envHint:
    'Set VITE_AXE_COMPANION_URL in .env.axe to your hosted Companion URL (e.g. https://www.axecompanion.com/chat), then use “Get AXE Companion” on /app or below to open the QR.',
};

export const AXE_BOTTOM_CTA = {
  headline1: 'Ready to',
  headlineShimmer: 'run AXE',
  headline2: '?',
  subtext:
    'Open the app, link an account, and ship your first ingest. Trading OS is coming soon — a premium trading terminal powered by the same AXE intelligence layer and one Supabase account.',
  ctaApp: 'Open AXE',
  ctaAuth: 'Sign in',
};

/** Shown above the waitlist email field. */
export const AXE_WAITLIST_HELPER =
  'Join for early AXE access and updates on Trading OS — our upcoming premium trading terminal. Same account and memory when both are live.';

export const AXE_FOOTER = {
  tagline: 'Private trading intelligence — accounts, trades, journal, and memory in one place.',
  terminalTitle: 'Trading OS — upcoming premium terminal',
  terminalBody:
    'AXE Companion is the brain; Trading OS is the terminal. Same account and memory when both are live — live charts, intelligence, alerts, and execution desk on the full premium desk.',
  copyright: 'AXE Companion · Early access. Not financial advice. ©2026',
};
