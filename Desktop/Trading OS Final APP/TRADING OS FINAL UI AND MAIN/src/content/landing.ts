/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║            LANDING PAGE CONTENT — EDIT THIS FILE                ║
 * ║                                                                  ║
 * ║  Change any text, headlines, features, FAQ or pricing here.      ║
 * ║  You do NOT need to touch any other file.                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * HOW TO EDIT:
 *  1. Find the section you want to change (HERO, FEATURES, FAQ, etc.)
 *  2. Change the text between the quotes " "
 *  3. Save the file — the landing page updates automatically
 *
 * RULES:
 *  - Keep the commas after each item!
 *  - Don't change anything outside the quotes (the code structure)
 *  - If you want to ADD a feature/FAQ item, copy an existing block
 *    and paste it at the end of the list, before the closing ]
 */

export const HERO = {
  badge: 'Trading OS Beta is live',
  headlineLine1: 'The all-in-one',
  headlineLine2: 'workspace for traders.',
  emailPlaceholder: 'Enter your email',
  waitlistConfirmation: "You're on the list",
};

export const STORY_QUOTE =
  "Made by a trader who spent years struggling alone — figuring out what matters, filtering the noise, and building the tools that didn't exist yet. With Trading OS, we want to save other traders from that same grind. Less noise. Better data. Real tools. Everything in one place.";

export const TICKER_DATA = [
  { symbol: 'BTC/USD', price: '104,287.50', change: '+2.41%', up: true },
  { symbol: 'EUR/USD', price: '1.1342', change: '-0.18%', up: false },
  { symbol: 'NAS100', price: '21,458.30', change: '+1.07%', up: true },
  { symbol: 'XAU/USD', price: '3,341.20', change: '+0.53%', up: true },
  { symbol: 'US30', price: '42,187.00', change: '+0.82%', up: true },
  { symbol: 'CRUDE', price: '61.44', change: '-1.23%', up: false },
  { symbol: 'ETH/USD', price: '2,487.60', change: '+3.15%', up: true },
  { symbol: 'SOL/USD', price: '172.35', change: '+4.22%', up: true },
  { symbol: 'SPX500', price: '5,892.40', change: '+0.67%', up: true },
  { symbol: 'GBP/USD', price: '1.3421', change: '+0.12%', up: true },
];

export const INSTRUMENTS = [
  'BTC/USD',
  'ETH/USD',
  'SOL/USD',
  'XRP/USD',
  'ADA/USD',
  'DOGE/USD',
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'NZD/USD',
  'USD/CHF',
  'USD/CAD',
  'EUR/GBP',
  'NAS100',
  'SPX500',
  'US30',
  'DAX40',
  'FTSE100',
  'NIKKEI225',
  'XAU/USD',
  'XAG/USD',
  'PLATINUM',
  'CRUDE OIL',
  'BRENT',
  'NATURAL GAS',
  'US10Y',
  'US02Y',
  'US30Y',
  'WHEAT',
  'CORN',
  'SOYBEANS',
];

export const FEATURES_SECTION = {
  badge: 'Built for serious traders',
  headline1: 'Everything you need.',
  headline2: "Nothing you don't.",
  subtext:
    'Select a pair and your entire workspace adapts. Charts, news, levels, journal — all synced to your active market.',
};

export const FEATURES: { iconKey: string; title: string; desc: string; colorKey: string }[] = [
  {
    iconKey: 'LineChart',
    title: 'Multi-Timeframe Charts',
    desc: 'TradingView charts with 1-4 panel layouts, synced to your active pair. Crypto, FX, indices, metals — all live.',
    colorKey: 'emerald',
  },
  {
    iconKey: 'Radio',
    title: 'Live News & Squawk',
    desc: 'Filtered news feed with symbol-level precision. Hot topics, macro moves, and live audio squawk — no noise, just signal.',
    colorKey: 'blue',
  },
  {
    iconKey: 'Database',
    title: 'FRED Macro Data',
    desc: 'Live economic indicators straight from the Federal Reserve. Fed Funds Rate, CPI, GDP, Unemployment, Yields — all in one panel.',
    colorKey: 'amber',
  },
  {
    iconKey: 'Brain',
    title: 'AI Desk',
    desc: 'GPT-powered market commentary from five trading-style personas (scalp through macro). Ask for analysis, get context, or use voice commands for hands-free insight.',
    colorKey: 'violet',
  },
  {
    iconKey: 'Ship',
    title: 'Marine Traffic Tracker',
    desc: 'Live vessel tracking near Rotterdam with mini map visualization. Tankers, containers, bulk carriers — commodity flow intelligence.',
    colorKey: 'cyan',
  },
  {
    iconKey: 'Plane',
    title: 'Flight Tracker',
    desc: 'OpenSky Network integration showing live aircraft positions. Track aviation patterns linked to market sentiment.',
    colorKey: 'orange',
  },
  {
    iconKey: 'BarChart2',
    title: 'Trade Journal',
    desc: '1-tap rating chips, micro-notes, and analytics. Rate every trade (Perfect to Emotional), track patterns, and improve consistency.',
    colorKey: 'pink',
  },
  {
    iconKey: 'Target',
    title: 'Levels & Fibonacci',
    desc: 'Support/resistance, Fibonacci retracements with educational tooltips, Golden Pocket zones, and liquidity levels — per symbol.',
    colorKey: 'red',
  },
  {
    iconKey: 'Calendar',
    title: 'Earnings Calendar',
    desc: 'Track earnings dates with EPS actuals, Surprise %, Reaction %, and sector filters. Know what moves markets before it happens.',
    colorKey: 'teal',
  },
  {
    iconKey: 'List',
    title: 'Watchlist & Pair Selector',
    desc: 'Your entire workspace syncs to your active pair. Switch once — charts, news, levels, journal, and alerts all update instantly.',
    colorKey: 'sky',
  },
  {
    iconKey: 'Bell',
    title: 'Smart Alerts',
    desc: 'Contextual alerts on your levels. Get notified when price touches support, resistance, or Fibonacci zones — per symbol, per timeframe.',
    colorKey: 'rose',
  },
  {
    iconKey: 'Layout',
    title: 'Modular Layouts',
    desc: 'Snap-to-grid widget system. Save and switch between custom layouts instantly. Desktop-first, built for multi-monitor setups.',
    colorKey: 'indigo',
  },
];

export const STATS = [
  { number: '25+', label: 'Instruments', sub: 'Crypto · FX · Indices · Metals · Energy · Bonds', color: 'emerald' },
  {
    number: '40+',
    label: 'Tools & Widgets',
    sub: 'Charts · Levels · Fib · Journal · News · Squawk · AI · FRED · More',
    color: 'blue',
  },
  { number: '24/7', label: 'Live Data', sub: 'Real-time prices · FRED · Marine Traffic', color: 'violet' },
];

export const BUILT_DIFFERENT = {
  badge: 'Built different',
  headline1: "We're not here to take over.",
  headline2: "We're here to make great tools even greater.",
};

export const PRICING_SECTION = {
  headline: 'Simple pricing.',
  subtext: 'Plans and pricing will be announced with the public launch.',
  priceText: 'Coming Soon',
  priceSub: 'No public pricing yet — join the waitlist to hear first.',
};

export const PRICING_PLANS: {
  tier: string;
  desc: string;
  features: string[];
  cta: string;
  highlight: boolean;
}[] = [
  {
    tier: 'Free',
    desc: 'Get started with the basics',
    features: ['Up to 5 layouts', 'Basic charting', 'Daily news feed', '3 active alerts'],
    cta: 'Join Waitlist',
    highlight: false,
  },
  {
    tier: 'Pro',
    desc: 'For active traders',
    features: [
      'Unlimited layouts',
      'Multi-timeframe charts',
      'Real-time news & squawk',
      'AI Desk access',
      'Unlimited alerts',
      'Trade journal analytics',
    ],
    cta: 'Join Waitlist',
    highlight: true,
  },
  {
    tier: 'Desk',
    desc: 'For prop desks & teams',
    features: [
      'Everything in Pro',
      'Team sharing & permissions',
      'Priority data feeds',
      'Custom AI personas',
      'API access',
      'Dedicated support',
    ],
    cta: 'Contact Sales',
    highlight: false,
  },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Do I need my own brokerage account?',
    a: 'Yes, Trading OS is a workspace and analysis tool, not a broker. You execute your trades on your preferred platform while doing all your research and planning here.',
  },
  {
    q: 'Is market data real-time?',
    a: 'Pro and Desk plans include real-time feeds for FX, Crypto, and major indices. We stream live prices via multiple providers including direct exchange feeds.',
  },
  {
    q: 'What instruments are supported?',
    a: 'We support 25+ instruments across Crypto (BTC, ETH, SOL, XRP, ADA, DOGE), FX (EUR/USD, GBP/USD, USD/JPY, AUD/USD, NZD/USD, USD/CHF, USD/CAD, EUR/GBP), Indices (NAS100, SPX500, US30, DAX40, FTSE100), Metals (Gold, Silver, Platinum), Energy (Crude Oil, Brent, Natural Gas), Bonds (US10Y, US02Y, US30Y), and Commodities (Wheat, Corn, Soybeans).',
  },
  {
    q: 'Can I use it on mobile?',
    a: 'Trading OS is optimized for desktop and tablet to maximize the modular widget experience. A companion mobile app for quick alerts and notes is on the roadmap.',
  },
  {
    q: 'What is the AI Desk?',
    a: 'The AI Desk runs GPT-powered commentary across five trading-style personas (scalper through macro) in one view. Ask about your chart, levels, or macro, or use voice commands for hands-free insight.',
  },
];

export const BOTTOM_CTA = {
  headline1: 'Ready to',
  headlineShimmer: 'level up',
  headline2: '?',
  subtext: 'Join the closed beta and experience your markets in a completely new way.',
  ctaDemo: 'Try the demo',
  ctaSignup: 'Get Started',
  ctaWaitlist: 'Join Waitlist',
};

export const FOOTER = {
  tagline: 'The all-in-one workspace for serious traders. Charts, intel, journal, and AI — unified.',
  copyright: 'Trading OS demo · Simulated data. Not financial advice. TradingView charts. ©2026',
};

