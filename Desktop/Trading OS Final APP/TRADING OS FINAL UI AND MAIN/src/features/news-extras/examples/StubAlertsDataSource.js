/**
 * StubAlertsDataSource
 *
 * Demo implementation of AlertsDataSource. Replace with real adapter that
 * pipes into your existing alerts backend (Alpaca, Finnhub, FMP, Supabase
 * watchlist table, etc). Contract matches types.d.ts.
 */

const TEMPLATES = [
  // --- price ---
  {
    id: "tpl_price_breakout",
    category: "price",
    label: "Price breaks above daily high",
    description: "Fires when last trade > today's high-of-day.",
    hotkey: "A",
    badge: "POPULAR",
  },
  {
    id: "tpl_price_vwap_reclaim",
    category: "price",
    label: "VWAP reclaim",
    description: "Close back above VWAP after being below for >15m.",
    hotkey: "V",
  },
  {
    id: "tpl_price_round_number",
    category: "price",
    label: "Round number cross",
    description: "Price crosses a whole-dollar level (100, 200, 500).",
  },

  // --- technical ---
  {
    id: "tpl_tech_ema_cross",
    category: "technical",
    label: "9/21 EMA cross (5m)",
    description: "Fast EMA crosses above/below slow EMA on 5-minute chart.",
    hotkey: "E",
  },
  {
    id: "tpl_tech_rsi_oversold",
    category: "technical",
    label: "RSI oversold bounce",
    description: "RSI(14) exits < 30 zone on 15m timeframe.",
  },
  {
    id: "tpl_tech_macd_flip",
    category: "technical",
    label: "MACD histogram flip",
    description: "Histogram changes sign on daily close.",
    badge: "NEW",
  },

  // --- volume ---
  {
    id: "tpl_vol_relvol_spike",
    category: "volume",
    label: "RelVol > 3x",
    description: "Cumulative volume exceeds 3x 20-day average at same time.",
    hotkey: "R",
    badge: "POPULAR",
  },
  {
    id: "tpl_vol_1m_burst",
    category: "volume",
    label: "1-minute volume burst",
    description: "Single 1m bar > 10x average 1m volume.",
  },

  // --- short_interest ---
  {
    id: "tpl_short_ctb_spike",
    category: "short_interest",
    label: "Cost-to-borrow spike",
    description: "CTB fee jumps > 50% day-over-day.",
  },
  {
    id: "tpl_short_utilization",
    category: "short_interest",
    label: "Utilization > 95%",
    description: "Short utilization above 95% (hard-to-borrow).",
    badge: "NEW",
  },

  // --- options ---
  {
    id: "tpl_opt_unusual_calls",
    category: "options",
    label: "Unusual call sweep",
    description: "Aggressive call sweep > $250k premium, OTM.",
    hotkey: "U",
    badge: "POPULAR",
  },
  {
    id: "tpl_opt_iv_crush",
    category: "options",
    label: "IV crush post-earnings",
    description: "30d IV drops > 40% after earnings release.",
  },
  {
    id: "tpl_opt_put_call_flip",
    category: "options",
    label: "Put/Call ratio flip",
    description: "Intraday P/C crosses 1.0 either direction.",
  },

  // --- news ---
  {
    id: "tpl_news_headline",
    category: "news",
    label: "Breaking headline",
    description: "Any tier-1 newswire headline mentioning ticker.",
    hotkey: "N",
  },
  {
    id: "tpl_news_analyst",
    category: "news",
    label: "Analyst rating change",
    description: "Upgrade, downgrade, or price target revision.",
  },

  // --- macro ---
  {
    id: "tpl_macro_fed_speaker",
    category: "macro",
    label: "Fed speaker headline",
    description: "FOMC member on the wire (Powell, Williams, etc).",
    hotkey: "F",
  },
  {
    id: "tpl_macro_data_release",
    category: "macro",
    label: "Tier-1 data release",
    description: "CPI, NFP, PCE, FOMC decision crosses the tape.",
    badge: "NEW",
  },
];

const INITIAL_ACTIVE = [
  {
    id: "act_1",
    templateId: "tpl_price_breakout",
    label: "NVDA > daily high",
    symbol: "NVDA",
    createdAt: Date.now() - 1000 * 60 * 34,
    enabled: true,
  },
  {
    id: "act_2",
    templateId: "tpl_vol_relvol_spike",
    label: "TSLA RelVol > 3x",
    symbol: "TSLA",
    createdAt: Date.now() - 1000 * 60 * 12,
    enabled: true,
  },
  {
    id: "act_3",
    templateId: "tpl_opt_unusual_calls",
    label: "SPY unusual call sweep",
    symbol: "SPY",
    createdAt: Date.now() - 1000 * 60 * 6,
    enabled: true,
  },
  {
    id: "act_4",
    templateId: "tpl_macro_fed_speaker",
    label: "Powell on the wire",
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    enabled: false,
  },
];

export function createStubAlertsDataSource({ latencyMs = 120 } = {}) {
  let active = [...INITIAL_ACTIVE];

  const delay = (value) =>
    new Promise((resolve) => setTimeout(() => resolve(value), latencyMs));

  return {
    async listTemplates() {
      return delay(TEMPLATES.slice());
    },

    async listActive() {
      return delay(active.slice());
    },

    async createFromTemplate(templateId, symbol) {
      const tpl = TEMPLATES.find((t) => t.id === templateId);
      if (!tpl) throw new Error("Unknown template: " + templateId);
      const created = {
        id: "act_" + Math.random().toString(36).slice(2, 9),
        templateId,
        label: symbol ? `${symbol} — ${tpl.label}` : tpl.label,
        symbol: symbol || undefined,
        createdAt: Date.now(),
        enabled: true,
      };
      active = [created, ...active];
      return delay(created);
    },

    async toggle(activeId, enabled) {
      active = active.map((a) =>
        a.id === activeId ? { ...a, enabled } : a
      );
      return delay(undefined);
    },

    async remove(activeId) {
      active = active.filter((a) => a.id !== activeId);
      return delay(undefined);
    },
  };
}

export default createStubAlertsDataSource;
