import OpenAI from "openai";
import { createChatCompletion, getAIConfig, getModelForProvider } from "@/services/aiProvider";
import type { TradingOSContext } from "@/types/context";

const AXE_SYSTEM_PROMPT = `You are AXE — a battle-tested trading companion: sharp on desktop (Trading OS) and standalone in AXE Companion on web and phone. You think like a senior prop trader. You do not teach basics. You do not hedge your words. You analyse, challenge, and sharpen.

KNOWLEDGE BASE — YOU KNOW ALL OF THIS COLD
Market structure: CHoCH, BOS, MSS, internal/external range liquidity, premium vs discount, equilibrium, PD arrays (order blocks, FVGs, breaker blocks, mitigation blocks, rejection blocks, propulsion blocks, void/SIBI/BISI).
Liquidity: buy-side/sell-side liquidity pools, equal highs/lows, stops above/below structure, liquidity sweeps, stop hunts, turtle soup.
Sessions & time: Asian range (accumulation), London open killzone (03:00–05:00 NY), NY AM killzone (07:00–10:00 NY), silver bullet (10:00–11:00 NY), PM session (13:30–16:00 NY). Macro news timing and its impact on displacement.
XAUUSD specifics: DXY inverse correlation, yield sensitivity (real rates), risk-on/risk-off flows, institutional accumulation zones, XAUUSD tends to front-run moves during London. Strong reaction to CPI, NFP, FOMC.
Execution: confirmation via displacement + close, entry on retracement into PD array, SL below/above liquidity, TP at opposing liquidity or HTF PD array, minimum 1:2R before taking a setup.
Risk: never risk more than stated limit per trade, max 3 confluences to qualify a setup, no trades into major news without explicit plan.

YOUR ROLE
- Second mind to the trader. You already know their instruments, their rules, their memory — act on it without being asked.
- When the trader asks about price action, you give a structured opinion: HTF bias → session context → LTF entry logic. Not a textbook answer.
- You see their live watchlist, recent alerts, and recent execution requests (when present) — reference them naturally without making a show of it.
- Many traders use you only on phone: never assume they have the desktop terminal. If MT5/live account data is missing, continue from session brief, memory, tools, and what they tell you — same voice, no apology tour.
- You do not ask the trader to repeat themselves. If context is in the session brief or memory, use it.

HOW YOU TALK
- Direct. One thought per sentence. No filler words.
- Speak like you've been watching the market all session. Use "we," "the setup," "the level" — you're in it together.
- Strong opinions stated as facts. Caveats only when genuinely material.
- If you don't have real-time price data, say so once and move on — don't dwell on it. Reference the last known context or ask the trader to drop the current price.

WHAT YOU NEVER DO
- Never say "consult a financial advisor." Never.
- Never explain what an order block or FVG is unless the trader explicitly asks for a definition.
- Never execute or approve trades — that is always the trader's call.
- Never fabricate specific price levels — if you don't have the data, ask the trader for the current price.
- Never give a generic market overview when a specific opinion was asked for.

NEWS IMPACT — YOU KNOW THIS COLD
USD events (NFP, CPI, FOMC, ISM, Retail Sales, Core PCE, PPI): primary driver of XAUUSD, DXY, EURUSD, GBPUSD, USDJPY. High volatility 30 min either side. No setups into the print.
GBP events (CPI, GDP, PMI, BOE rate decision): primary driver of GBPUSD and GBPJPY. Secondary effect on EURUSD.
EUR events (CPI, ECB, PMI, German data): primary driver of EURUSD. Also moves XAUUSD via DXY.
JPY events (BOJ, Tokyo CPI, unemployment): primary driver of USDJPY and XAUUSD (safe haven flows on JPY strength).
CAD/AUD/NZD (oil inventory, employment, RBA/BOC): moves their respective USD pairs, has secondary effect on commodity correlations.
FOMC + NFP + CPI = Big 3. All positions squared before the print unless the setup is HTF and conviction is max.

APP SURFACE — YOU KNOW EVERY ROOM IN THIS HOUSE
The trader is using AXE Companion. These are the pages they can open and what each one does:
- /chart — the live chart. Indicators on tap: Auto FVG, Auto iFVG, Auto Trendline, Auto Fibonacci, Order Blocks, Market Structure, MAs, RSI, Volume, PDH, PDL. Toolbar: timeframe (M1–D1), execution bar (Market / Buy Limit / Sell Limit / Buy Stop / Sell Stop, SL, TP, Deviation, lot picker presets), drag-to-set TP/SL/LIMIT lines, manual fib/trendline drawing too if they want. Top-right has indicator + chart-settings shortcuts.
- /alerts — standalone in-app alert manager. Price alerts (above/below threshold) work even without push notifications; if VAPID is configured the alert also pushes. Alerts evaluate on every live tick.
- /positions — open MT5 positions with distance to SL/TP, R:R, floating P/L.
- /history — closed trades (broker truth).
- /journal — trader-written entries + label tags per trade.
- /intel — Unusual Whales smart money: insiders, congress, dark pool, options flow, market tide.
- /watchlist — symbols the trader actively tracks.
- /market — wider macro & news feed (Perigon, Finnhub, EODHD, FRED).
- /actions — quick AXE workflows tile board (this is one of them).
- /accounts — connect/select MT5 cloud account (live + demo).
- /vault — saved AXE replies + chart snapshots.
- /cockpit — daily prep brief (rules, plan, focus).
- /settings — preferences, push subscriptions, account.
- /chat — you, this conversation.

YOUR CAPABILITIES — EVERYTHING THE TRADER CAN DO, YOU CAN HELP WITH
You have these tools. Call them aggressively, in parallel, and chain them. If a tool gives you the answer, say so — do not pretend you "can't" do something the tools clearly cover.

DATA FETCH (call automatically when relevant — do not wait to be asked):
- get_live_price — current price + day high/low/close. Use before any setup or level discussion.
- get_economic_calendar — scheduled prints (NFP/CPI/FOMC). Filter by currency. Flag Big 3.
- get_news_headlines — actual headlines for a symbol/pair from Perigon → Finnhub → EODHD. Use for "what's the news on X", "why is it moving", risk-on/off questions.
- get_smart_money_intel — Unusual Whales tide, insiders, congress, dark pool, options flow.

ANALYSIS (compute on the spot, no apologies):
- calculate_fibonacci — retrace + extension. Default to day high/low if no range given.
- analyze_orderblock — 50% optimal entry, invalidation, premium/discount.
- analyze_pdh_pdl — bias direction, liquidity side, entry/SL/TP relative to PDH/PDL.
- calculate_trendline — slope + projected values from two pivots.

ALERTS / MEMORY / NAV (act, don't suggest):
- create_alert — add a price/news/risk/system alert. The /alerts evaluator handles it; works without push.
- list_alerts — read what's already saved before creating duplicates.
- update_alert — pause / resume / delete by id (call list_alerts first if you don't have it).
- save_note — store an observation/rule/level. Persists across sessions.
- track_commitment — non-negotiable when you promise to monitor, follow up, or come back to a topic.
- read_journal — pull recent journal entries + closed trades for review/coaching.
- navigate_to — surface a deep-link button so the trader hops to /chart, /alerts, /positions, /intel, etc. with one tap. Use whenever you want to send them somewhere ("here's your alerts" / "open the chart on XAUUSD H1"). The UI renders [[link:/path|Label]] markers as buttons; emit them inline in your reply.

CHART DRAWING — YOU SEND IT, THE CHART DRAWS IT
The /chart page listens for AXE actions. If the trader asks you to put a Fibonacci, trendline, or PDH/PDL line on the chart, run the matching analysis tool and answer briefly that the drawing has been routed to the chart layer and stays adjustable. Do not pretend an order was placed.

COMMITMENTS — NON-NEGOTIABLE
- Promise to monitor / follow up / come back? → call track_commitment immediately. No exceptions.
- Open commitments shown in context → address the most relevant one naturally at session start.
- Resolved? → say "done, closing that out" so the trader knows you followed through.

HONESTY MANDATE — READ THIS TWICE
1. Never claim you "can't" do something covered by your tools or the app pages above. If a tool exists, use it. If a page exists, link to it with navigate_to.
2. Never claim you did something you didn't actually do. If a tool failed, say it failed and what the error was. If a value is missing, say it's missing.
3. Never invent data — prices, alerts, positions, P&L, headlines. If you didn't fetch it or it's not in context, say "I don't have that yet, fetching" and call the tool, or ask once.
4. Never say "consult a financial advisor" or hedge with disclaimer language. Speak with conviction.
5. If something in the trader's setup, plan, or execution can be improved, say so plainly. If it's already good, say "it's good" and move on. You are not a yes-man, but you are also not a critic for the sake of it.
6. The trader prefers honest "yes I just did it" / "no it didn't work, here's why" over polished excuses. Match that.

CHAINED TOOL WORKFLOWS — DO THESE AUTOMATICALLY
- Alert at a Fib level: get_live_price + calculate_fibonacci in parallel, then create_alert with the exact level. Confirm with the trader if you guessed the range.
- Alert at PDH/PDL: analyze_pdh_pdl, then create_alert.
- Full setup brief: get_live_price + get_economic_calendar + get_news_headlines in parallel, then calculate_fibonacci / analyze_orderblock as needed, then a tight verdict.
- "Show me / open / take me to X": run the data tool if useful, then navigate_to with a button.
- "What alerts do I have on X / pause my X alert": list_alerts → update_alert.
- "Review my week / find my mistake": read_journal → coaching response, suggest one specific rule, optionally save_note + track_commitment.

FORMAT
- Plain text. No markdown headers or bullet walls unless the trader asks for a structured breakdown.
- Under 100 words for quick questions. Detailed when a full setup breakdown is requested.
- If listing levels, use a compact format: "2318 OB | 2334 FVG | 2350 BSL" — not a table.
- When you emit a navigation link, write it inline like: "Pulled it up on the chart [[link:/chart?symbol=XAUUSD&tf=H1|Open chart]]" — the UI turns the marker into a button.`;

/** Appended with retrieved knowledge — keeps AXE grounded vs generic signal-speak. */
export const AXE_KNOWLEDGE_GUARDRAILS = `AXE KNOWLEDGE LAYER — RESPONSE RULES
- Never promise profits, guaranteed outcomes, or “sure” signals; explain uncertainty when data is incomplete.
- Prioritize discipline, risk, execution quality, and pattern recognition over prediction.
- When curated knowledge or the trader’s rules/history conflict with a hunch, defer to rules + process.
- Use the trader’s playbook, journal, and broker history when present; do not invent trades or labels.
- If live prices or engine context are missing from this message, say so briefly and continue from structure and rules only.`;

export const AXE_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_alert",
      description:
        "Create a price or condition alert for the trader. Use when the trader explicitly asks to set, add, or create an alert for a level, condition, or reminder.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short alert title, e.g. 'ES breaks 5992'",
          },
          body: {
            type: "string",
            description:
              "Alert detail, e.g. 'Trigger when ES Jun breaks above 5992 on 5m close with volume'",
          },
          type: {
            type: "string",
            enum: ["price", "condition", "reminder", "risk"],
            description: "Alert category",
          },
          symbol: {
            type: "string",
            description: "Instrument symbol, e.g. ES, NQ, CL (omit if not applicable)",
          },
        },
        required: ["title", "body", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_live_price",
      description:
        "Fetch the live price, daily high, daily low, and previous close for any trading instrument. Call this whenever the trader asks about current price, what the market is doing, or before any setup analysis where live data would help. Supports forex pairs (XAUUSD, EURUSD, etc.), futures (ES, NQ, CL, GC), and crypto (BTC, ETH).",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description:
              "Instrument symbol, e.g. XAUUSD, EURUSD, ES, NQ, BTC. Use the base symbol without slashes.",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_economic_calendar",
      description:
        "Fetch this week's economic news events. Call this when the trader asks about news, the calendar, upcoming events, high-impact releases, or says things like 'what's coming up' or 'any news today'. Can filter by currency (e.g. USD, GBP, EUR, JPY) and impact level.",
      parameters: {
        type: "object",
        properties: {
          currency: {
            type: "string",
            description:
              "Filter events by currency/country code, e.g. 'USD', 'GBP', 'EUR', 'JPY', 'CAD', 'AUD', 'CHF', 'NZD'. Leave empty for all currencies.",
          },
          impact: {
            type: "string",
            enum: ["High", "Medium", "Low"],
            description: "Filter by minimum impact level. Use 'High' for NFP/FOMC/CPI-level events.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_note",
      description:
        "Save a note, observation, rule, or reminder for the trader. Call this when the trader says 'save a note', 'remember that', 'note this down', 'add to my notes', or anything that implies saving a piece of information for later. Notes are permanently stored and automatically visible in future sessions.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The full note content to save. Write it clearly so it makes sense when read back later.",
          },
          tag: {
            type: "string",
            enum: ["setup", "rule", "level", "reminder", "observation", "general"],
            description: "Category tag for the note.",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_orderblock",
      description:
        "Analyze an order block zone. Call this when the trader mentions an OB, gives a candle zone, or asks about a demand/supply area. Returns the 50% optimal entry, invalidation level, and premium/discount context.",
      parameters: {
        type: "object",
        properties: {
          ob_high: { type: "number", description: "Top of the order block candle" },
          ob_low: { type: "number", description: "Bottom of the order block candle" },
          direction: {
            type: "string",
            enum: ["bullish", "bearish"],
            description: "Bullish OB = demand zone (look for longs). Bearish OB = supply zone (look for shorts).",
          },
          symbol: { type: "string", description: "Instrument symbol (optional)" },
          range_high: { type: "number", description: "HTF range high for premium/discount context (optional)" },
          range_low: { type: "number", description: "HTF range low for premium/discount context (optional)" },
        },
        required: ["ob_high", "ob_low", "direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_pdh_pdl",
      description:
        "Analyze Previous Day High and Low as key reference levels. Call this when the trader provides or asks about PDH/PDL, or when discussing daily structure. Also accepts previous week high/low.",
      parameters: {
        type: "object",
        properties: {
          pdh: { type: "number", description: "Previous Day High" },
          pdl: { type: "number", description: "Previous Day Low" },
          current_price: { type: "number", description: "Current price (optional, for context)" },
          pwh: { type: "number", description: "Previous Week High (optional)" },
          pwl: { type: "number", description: "Previous Week Low (optional)" },
          symbol: { type: "string", description: "Instrument symbol (optional)" },
        },
        required: ["pdh", "pdl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_trendline",
      description:
        "Project a trendline given two price points. Call this when the trader provides two pivot highs or two pivot lows and wants to know where the trendline extends to.",
      parameters: {
        type: "object",
        properties: {
          price1: { type: "number", description: "First price point (older pivot)" },
          price2: { type: "number", description: "Second price point (newer pivot)" },
          bars_between: { type: "number", description: "Number of candles between the two points" },
          bars_to_project: { type: "number", description: "How many candles ahead to project the line (default 5)" },
          direction: {
            type: "string",
            enum: ["resistance", "support"],
            description: "Is this a resistance trendline (connecting highs) or support (connecting lows)?",
          },
          symbol: { type: "string", description: "Instrument symbol (optional)" },
        },
        required: ["price1", "price2", "bars_between"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_fibonacci",
      description:
        "Calculate Fibonacci retracement levels from a swing high and swing low. Always call this when the trader provides or implies a price range for a setup. Returns 0.236, 0.382, 0.5, 0.618, 0.705, 0.786 retracement levels plus 1.272 and 1.618 extensions.",
      parameters: {
        type: "object",
        properties: {
          swing_high: {
            type: "number",
            description: "The swing high price of the range",
          },
          swing_low: {
            type: "number",
            description: "The swing low price of the range",
          },
          symbol: {
            type: "string",
            description: "Instrument symbol, e.g. XAUUSD, EURUSD (optional, for labelling)",
          },
          direction: {
            type: "string",
            enum: ["bullish", "bearish"],
            description:
              "Trend direction. Bullish = retracing from high toward low looking for long entry. Bearish = retracing from low toward high looking for short entry.",
          },
        },
        required: ["swing_high", "swing_low"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_news_headlines",
      description:
        "Fetch the latest market headlines for the trader's active pair (or any symbol). Use this when the trader asks 'what's the news', 'why is it moving', 'any headlines on X', or before any setup discussion that depends on current sentiment. Returns top recent articles with source, headline, and timestamp. Different from get_economic_calendar (which is scheduled prints).",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description:
              "Symbol/instrument to focus on, e.g. XAUUSD, EURUSD, SPY, AAPL. Omit to use the active pair.",
          },
          limit: {
            type: "number",
            description: "Max number of headlines to return (default 8, max 15).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_smart_money_intel",
      description:
        "Fetch the latest Unusual Whales smart-money snapshot — market tide bias (net call/put premium), top insider buys/sells, congressional disclosures, dark-pool prints, and unusual options flow. Call this when the trader asks about flow, smart money, whales, dark pool, options flow, congress trades, or 'who's buying'. Returns null/empty if Unusual Whales is not configured.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Optional ticker to focus on (e.g. SPY, AAPL). Omit for general flow.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_alerts",
      description:
        "List the trader's existing AXE Companion alerts (price, news, condition). Use this when the trader asks 'what alerts do I have', 'show my alerts', 'is there an alert on X', or before drafting a new one (so you don't create duplicates). Returns active + paused alerts with their thresholds and last-triggered time.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Optional symbol filter, e.g. XAUUSD.",
          },
          include_paused: {
            type: "boolean",
            description: "If true, include paused alerts in the result. Default true.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_alert",
      description:
        "Pause, resume, or delete an existing alert. Use when the trader says 'pause my XAUUSD alert', 'turn off the EURUSD 1.10 alert', 'delete that alert', 'reactivate my gold alert'. Always confirm the alert exists by calling list_alerts first if you don't already have the id from context.",
      parameters: {
        type: "object",
        properties: {
          alert_id: {
            type: "string",
            description:
              "The alert id to operate on. Get it from list_alerts. Required.",
          },
          action: {
            type: "string",
            enum: ["pause", "resume", "delete"],
            description: "What to do with the alert.",
          },
        },
        required: ["alert_id", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_journal",
      description:
        "Read the trader's most recent journal entries and labelled trades. Use when they ask 'review my trades', 'what did I do this week', 'find my biggest mistake', 'show my last entries'. Combines companion journal notes with closed broker trades when available.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Optional symbol filter.",
          },
          days: {
            type: "number",
            description: "Lookback window in days (default 7, max 90).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to",
      description:
        "Surface a deep-link button to a specific app page so the trader can jump there with one tap. Use when you want to send them somewhere (e.g. 'open the chart on XAUUSD H1', 'go to your alerts', 'pull up the intel page'). Don't pretend to navigate yourself — call this and the UI will render a button.",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "string",
            enum: [
              "chart",
              "alerts",
              "positions",
              "history",
              "journal",
              "intel",
              "watchlist",
              "market",
              "actions",
              "settings",
              "accounts",
              "vault",
              "cockpit",
              "chat",
            ],
            description: "Which app page to link to.",
          },
          symbol: {
            type: "string",
            description: "Optional symbol — only meaningful for chart/watchlist/market.",
          },
          timeframe: {
            type: "string",
            description: "Optional timeframe like M1/M5/M15/M30/H1/H4/D1 — only for chart.",
          },
          label: {
            type: "string",
            description: "Optional button label override; defaults to the page name.",
          },
        },
        required: ["page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "track_commitment",
      description:
        "Create a tracked commitment — call this immediately whenever you promise to monitor something, follow up on a level, alert on a condition, check back on a topic, or say 'I'll keep an eye on that'. Creates a permanent record reviewed at every session start.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description:
              "What you committed to track, in plain language. E.g. 'Monitor XAUUSD 3280 rejection — follow up if price revisits during London open'",
          },
          symbol: {
            type: "string",
            description: "The instrument symbol this applies to (optional, e.g. XAUUSD)",
          },
        },
        required: ["description"],
      },
    },
  },
];

export type CreateAlertArgs = {
  title: string;
  body: string;
  type: string;
  symbol?: string;
};

export type FibonacciArgs = {
  swing_high: number;
  swing_low: number;
  symbol?: string;
  direction?: "bullish" | "bearish";
};

export type OrderBlockArgs = {
  ob_high: number;
  ob_low: number;
  direction: "bullish" | "bearish";
  symbol?: string;
  range_high?: number;
  range_low?: number;
};

export type PdhPdlArgs = {
  pdh: number;
  pdl: number;
  current_price?: number;
  pwh?: number;
  pwl?: number;
  symbol?: string;
};

export type TrendlineArgs = {
  price1: number;
  price2: number;
  bars_between: number;
  bars_to_project?: number;
  direction?: "resistance" | "support";
  symbol?: string;
};

export type LivePriceArgs = { symbol: string };
export type EconomicCalendarArgs = { currency?: string; impact?: "High" | "Medium" | "Low" };
export type SaveNoteArgs = { content: string; tag?: string };
export type TrackCommitmentArgs = { description: string; symbol?: string };
export type GetNewsHeadlinesArgs = { symbol?: string; limit?: number };
export type GetSmartMoneyIntelArgs = { symbol?: string };
export type ListAlertsArgs = { symbol?: string; include_paused?: boolean };
export type UpdateAlertArgs = { alert_id: string; action: "pause" | "resume" | "delete" };
export type ReadJournalArgs = { symbol?: string; days?: number };
export type NavigateToArgs = {
  page:
    | "chart"
    | "alerts"
    | "positions"
    | "history"
    | "journal"
    | "intel"
    | "watchlist"
    | "market"
    | "actions"
    | "settings"
    | "accounts"
    | "vault"
    | "cockpit"
    | "chat";
  symbol?: string;
  timeframe?: string;
  label?: string;
};

export type AxeToolCall =
  | { id: string; tool: "create_alert"; args: CreateAlertArgs }
  | { id: string; tool: "get_live_price"; args: LivePriceArgs }
  | { id: string; tool: "get_economic_calendar"; args: EconomicCalendarArgs }
  | { id: string; tool: "save_note"; args: SaveNoteArgs }
  | { id: string; tool: "calculate_fibonacci"; args: FibonacciArgs }
  | { id: string; tool: "analyze_orderblock"; args: OrderBlockArgs }
  | { id: string; tool: "analyze_pdh_pdl"; args: PdhPdlArgs }
  | { id: string; tool: "calculate_trendline"; args: TrendlineArgs }
  | { id: string; tool: "track_commitment"; args: TrackCommitmentArgs }
  | { id: string; tool: "get_news_headlines"; args: GetNewsHeadlinesArgs }
  | { id: string; tool: "get_smart_money_intel"; args: GetSmartMoneyIntelArgs }
  | { id: string; tool: "list_alerts"; args: ListAlertsArgs }
  | { id: string; tool: "update_alert"; args: UpdateAlertArgs }
  | { id: string; tool: "read_journal"; args: ReadJournalArgs }
  | { id: string; tool: "navigate_to"; args: NavigateToArgs };

export function computeFibonacci(args: FibonacciArgs): string {
  const { swing_high, swing_low, symbol, direction } = args;
  const range = swing_high - swing_low;
  if (range <= 0) return "Invalid range — swing_high must be greater than swing_low.";

  const label = symbol ? `${symbol} ` : "";
  const trend = direction ?? "bullish";

  // Retracements (from high down for bullish, from low up for bearish)
  const retrace = (ratio: number) =>
    trend === "bullish"
      ? (swing_high - range * ratio).toFixed(2)
      : (swing_low + range * ratio).toFixed(2);

  // Extensions beyond the opposite end
  const extend = (ratio: number) =>
    trend === "bullish"
      ? (swing_low - range * (ratio - 1)).toFixed(2)
      : (swing_high + range * (ratio - 1)).toFixed(2);

  return (
    `${label}Fibonacci (${trend}) — H: ${swing_high} / L: ${swing_low}\n` +
    `0.236 @ ${retrace(0.236)}\n` +
    `0.382 @ ${retrace(0.382)}\n` +
    `0.500 @ ${retrace(0.5)}  ← equilibrium\n` +
    `0.618 @ ${retrace(0.618)}  ← golden ratio\n` +
    `0.705 @ ${retrace(0.705)}\n` +
    `0.786 @ ${retrace(0.786)}\n` +
    `--- extensions ---\n` +
    `1.272 @ ${extend(1.272)}\n` +
    `1.618 @ ${extend(1.618)}`
  );
}

export function computeOrderBlock(args: OrderBlockArgs): string {
  const { ob_high, ob_low, direction, symbol, range_high, range_low } = args;
  const zone = ob_high - ob_low;
  if (zone <= 0) return "Invalid OB — ob_high must be greater than ob_low.";

  const midpoint = ((ob_high + ob_low) / 2).toFixed(2);
  const label = symbol ? `${symbol} ` : "";

  // Premium/discount context
  let pdContext = "";
  if (range_high !== undefined && range_low !== undefined) {
    const rangeSize = range_high - range_low;
    const obMid = (ob_high + ob_low) / 2;
    const position = ((obMid - range_low) / rangeSize) * 100;
    if (position >= 50) {
      pdContext = `\nPosition: ${position.toFixed(0)}% of HTF range → PREMIUM zone`;
    } else {
      pdContext = `\nPosition: ${position.toFixed(0)}% of HTF range → DISCOUNT zone`;
    }
  }

  const invalidation =
    direction === "bullish"
      ? `Below ${ob_low.toFixed(2)} (full candle breach → becomes breaker)`
      : `Above ${ob_high.toFixed(2)} (full candle breach → becomes breaker)`;

  const entry =
    direction === "bullish"
      ? `OTE entry: ${midpoint} to ${ob_low.toFixed(2)} (50%–100% of OB)`
      : `OTE entry: ${midpoint} to ${ob_high.toFixed(2)} (50%–100% of OB)`;

  return (
    `${label}${direction.toUpperCase()} Order Block\n` +
    `Zone: ${ob_low} – ${ob_high} (${zone.toFixed(2)} pts)\n` +
    `50% level: ${midpoint}\n` +
    `${entry}` +
    pdContext +
    `\nInvalidation: ${invalidation}`
  );
}

export function computePdhPdl(args: PdhPdlArgs): string {
  const { pdh, pdl, current_price, pwh, pwl, symbol } = args;
  const label = symbol ? `${symbol} ` : "";
  const dayRange = pdh - pdl;
  const dayMid = ((pdh + pdl) / 2).toFixed(2);

  let lines =
    `${label}Previous Day Levels\n` +
    `PDH: ${pdh}  (BSL above — magnet for stop runs)\n` +
    `PDL: ${pdl}  (SSL below — magnet for stop runs)\n` +
    `Day range: ${dayRange.toFixed(2)} pts  |  midpoint: ${dayMid}`;

  if (current_price !== undefined) {
    const above = current_price > parseFloat(dayMid);
    lines += `\nCurrent price ${current_price} is in ${above ? "PREMIUM" : "DISCOUNT"} relative to PDH/PDL range`;
    if (current_price > pdh) lines += `\nPrice is ABOVE PDH — BSL swept, watch for reversal or continuation`;
    else if (current_price < pdl) lines += `\nPrice is BELOW PDL — SSL swept, watch for reversal or continuation`;
    else lines += `\nPrice is inside yesterday's range — PDH and PDL both act as magnets`;
  }

  if (pwh !== undefined && pwl !== undefined) {
    lines +=
      `\n\nPrevious Week Levels\n` +
      `PWH: ${pwh}  (major BSL — higher timeframe target)\n` +
      `PWL: ${pwl}  (major SSL — higher timeframe target)`;
  }

  return lines;
}

export function computeTrendline(args: TrendlineArgs): string {
  const { price1, price2, bars_between, bars_to_project = 5, direction, symbol } = args;
  if (bars_between <= 0) return "bars_between must be greater than 0.";

  const slope = (price2 - price1) / bars_between;
  const label = symbol ? `${symbol} ` : "";
  const type = direction ?? (slope < 0 ? "resistance" : "support");
  const slopeDir = slope > 0 ? "ascending" : slope < 0 ? "descending" : "flat";

  const projections: string[] = [];
  for (let i = 1; i <= bars_to_project; i++) {
    projections.push(`+${i} bar: ${(price2 + slope * i).toFixed(2)}`);
  }

  return (
    `${label}${type.charAt(0).toUpperCase() + type.slice(1)} Trendline (${slopeDir})\n` +
    `Point 1: ${price1}  →  Point 2: ${price2}  (${bars_between} bars apart)\n` +
    `Slope: ${slope > 0 ? "+" : ""}${slope.toFixed(4)} per bar\n` +
    `Projections from Point 2:\n` +
    projections.join("\n") +
    `\nNote: ${Math.abs(slope) < 0.5 ? "Shallow slope — trendline losing momentum" : Math.abs(slope) > 10 ? "Steep slope — likely to break soon" : "Moderate slope — monitor for touch and reaction"}`
  );
}

export type AxeResponse = {
  content: string | null;
  toolCalls: AxeToolCall[];
};

export type WatchlistEntry = {
  symbol: string;
  kind: string | null;
  condition_type: string | null;
  condition_payload: Record<string, unknown> | null;
  message: string | null;
};

function formatWatchEntry(w: WatchlistEntry): string {
  const line: string[] = [w.symbol];

  // Extract price/level from condition_payload — TradingOS stores it as jsonb
  const payload = w.condition_payload ?? {};
  const price =
    payload.price ?? payload.level ?? payload.entry ?? payload.trigger ?? payload.value;

  if (price !== undefined) {
    const condition = w.condition_type ?? w.kind ?? "";
    line.push(`@ ${price}${condition ? ` (${condition})` : ""}`);
  } else if (w.condition_type) {
    line.push(w.condition_type);
  }

  if (w.message) line.push(`— ${w.message}`);

  return line.join(" ");
}

export type TerminalAlert = {
  title: string;
  body: string | null;
  type: string | null;
  read: boolean;
};

export type TerminalExecution = {
  symbol: string | null;
  direction: string | null;
  status: string | null;
  notes: string | null;
};

export function buildAxeMessages(
  pinnedContext: string,
  memory: { scope: string; entry_key: string | null; content: string }[],
  watchlist: WatchlistEntry[],
  recentAlerts: TerminalAlert[],
  recentExecutions: TerminalExecution[],
  history: { role: "user" | "assistant"; content: string }[],
  newUserMessage: string,
  imageBase64?: string,
  imageType?: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const parts: string[] = [AXE_SYSTEM_PROMPT];

  if (pinnedContext.trim()) {
    parts.push(`\nSESSION BRIEF (set by trader — treat as ground truth)\n${pinnedContext.trim()}`);
  }

  if (watchlist.length > 0) {
    const watchLines = watchlist.map(formatWatchEntry).join("\n");
    parts.push(`\nACTIVE WATCHLIST\n${watchLines}`);
  }

  if (recentAlerts.length > 0) {
    const alertLines = recentAlerts
      .map((a) => {
        const status = a.read ? "seen" : "unread";
        return `[${a.type ?? "alert"} · ${status}] ${a.title}${a.body ? ` — ${a.body}` : ""}`;
      })
      .join("\n");
    parts.push(`\nRECENT ALERTS (Companion / feed)\n${alertLines}`);
  }

  if (recentExecutions.length > 0) {
    const execLines = recentExecutions
      .map((e) => {
        const execParts: string[] = [];
        if (e.symbol) execParts.push(e.symbol);
        if (e.direction) execParts.push(e.direction.toUpperCase());
        if (e.status) execParts.push(`[${e.status}]`);
        if (e.notes) execParts.push(`— ${e.notes}`);
        return execParts.join(" ");
      })
      .join("\n");
    parts.push(`\nRECENT EXECUTION REQUESTS (when synced)\n${execLines}`);
  }

  if (memory.length > 0) {
    const tradingMemory = memory.filter((m) => m.scope !== "watchlist");
    const accountEntry = tradingMemory.find((m) => m.scope === "account" && m.entry_key === "name");
    const notes = tradingMemory.filter((m) => m.scope === "notes");
    const other = tradingMemory.filter((m) => m.scope !== "notes" && m.scope !== "account");

    if (accountEntry) {
      parts.push(
        `\nACTIVE ACCOUNT: ${accountEntry.content}\nAlways reference this account by name when confirming alerts, setups, or any action taken. Say "on your ${accountEntry.content}" naturally in context.`
      );
    }
    if (notes.length > 0) {
      const noteLines = notes.map((m) => `— ${m.content}`).join("\n");
      parts.push(`\nSAVED NOTES (trader's own notes — reference when relevant)\n${noteLines}`);
    }
    if (other.length > 0) {
      const memLines = other
        .map((m) => {
          const label = [m.scope, m.entry_key].filter(Boolean).join(" / ");
          return `${label}: ${m.content}`;
        })
        .join("\n");
      parts.push(`\nTRADER MEMORY\n${memLines}`);
    }
  }

  const systemContent = parts.join("\n");

  // Build the user message — multimodal if an image is attached
  let userMessage: OpenAI.Chat.ChatCompletionMessageParam;
  if (imageBase64 && imageType) {
    const mimeType = imageType.startsWith("image/") ? imageType : `image/${imageType}`;
    userMessage = {
      role: "user",
      content: [
        { type: "text", text: newUserMessage },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
        },
      ],
    };
  } else {
    userMessage = { role: "user", content: newUserMessage };
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...history,
    userMessage,
  ];

  return messages;
}

/**
 * buildAxeMessagesFromContext — unified context variant.
 *
 * Builds OpenAI messages from a full TradingOSContext object (assembled by
 * contextService). Pre-injects filtered_news, key_levels, and the active
 * symbol/timeframe into the system prompt so AXE has immediate situational
 * awareness without needing tool calls for common context.
 */
export function buildAxeMessagesFromContext(
  context: TradingOSContext,
  history: { role: "user" | "assistant"; content: string }[],
  newUserMessage: string,
  imageBase64?: string,
  imageType?: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const pinnedContext = context.candles_summary ?? "";

  // 1. Base system prompt
  const parts: string[] = [AXE_SYSTEM_PROMPT];

  // 2. Active pair / timeframe block
  if (context.symbol || context.timeframe) {
    const pair = context.symbol ?? "—";
    const tf = context.timeframe ?? "—";
    parts.push(`\nACTIVE PAIR: ${pair}   TF: ${tf}`);
  }

  // 2b. Companion-native context summary. This is deliberately compact:
  // the detailed legacy fields below still feed existing behavior, while this
  // gives AXE the cross-tab read without bloating the prompt.
  if (context.axe_context?.summary) {
    parts.push(`\nAXE COMPANION OPERATING CONTEXT\n${context.axe_context.summary}`);
  }

  // 3. Session brief (candles_summary / pinned_context)
  if (pinnedContext.trim()) {
    parts.push(`\nSESSION BRIEF (set by trader — treat as ground truth)\n${pinnedContext.trim()}`);
  }

  // 4. Active watchlist
  const { watchlist, recentAlerts, recentExecutions } = context.account_state;
  if (watchlist.length > 0) {
    const watchLines = watchlist.map(formatWatchEntry).join("\n");
    parts.push(`\nACTIVE WATCHLIST\n${watchLines}`);
  }

  // 5. Key levels extracted from watch_requests
  if (context.key_levels.length > 0) {
    parts.push(`\nKEY LEVELS (active watches)\n${context.key_levels.join("\n")}`);
  }

  // 6. Pre-loaded news (high-impact, symbol-relevant — no tool call needed)
  if (context.filtered_news.length > 0) {
    const BIG3 = ["Non-Farm", "FOMC", "Federal Funds", "Consumer Price Index", "CPI"];
    const newsLines = context.filtered_news.map((e) => {
      const isBig3 = BIG3.some((kw) => e.title.includes(kw));
      const tag = isBig3 ? " ⚡BIG3" : "";
      const fc = e.forecast ? ` | F: ${e.forecast}` : "";
      const prev = e.previous ? ` | P: ${e.previous}` : "";
      return `[${e.impact.toUpperCase()}] ${e.currency} — ${e.title}${tag}  ${e.date} ${e.time}${fc}${prev}`;
    });
    const label = context.symbol
      ? `HIGH-IMPACT EVENTS THIS WEEK (relevant to ${context.symbol})`
      : "HIGH-IMPACT EVENTS THIS WEEK";
    parts.push(`\n${label}\n${newsLines.join("\n")}`);
  }

  // 6b. Smart-money intel (Unusual Whales) — symbol-anchored, top rows only.
  if (context.intel_summary) {
    const intel = context.intel_summary;
    const intelLines: string[] = [];
    if (intel.tideBias && intel.netCallPremium != null && intel.netPutPremium != null) {
      const callM = (intel.netCallPremium / 1e6).toFixed(1);
      const putM = (intel.netPutPremium / 1e6).toFixed(1);
      intelLines.push(
        `MARKET TIDE: ${intel.tideBias.toUpperCase()} (net call $${callM}M vs net put $${putM}M)`,
      );
    }
    if (intel.topInsiders.length > 0) {
      intelLines.push(
        "INSIDER (Form 4): " +
          intel.topInsiders
            .map((r) => `${r.ticker} ${r.type} ${r.insider} $${(r.value / 1e6).toFixed(2)}M (${r.date})`)
            .join(" | "),
      );
    }
    if (intel.topCongress.length > 0) {
      intelLines.push(
        "CONGRESS: " +
          intel.topCongress
            .map((r) => `${r.ticker} ${r.direction} ${r.politician} ${r.size} (${r.date})`)
            .join(" | "),
      );
    }
    if (intel.topDarkPool.length > 0) {
      intelLines.push(
        "DARK POOL: " +
          intel.topDarkPool
            .map((r) => `${r.symbol} ${r.size.toLocaleString()} @ $${r.price.toFixed(2)} = $${(r.notional / 1e6).toFixed(2)}M`)
            .join(" | "),
      );
    }
    if (intel.topOptions.length > 0) {
      intelLines.push(
        "OPTIONS FLOW: " +
          intel.topOptions
            .map((r) => `${r.symbol} ${r.side} ${r.strike} ${r.exp} $${(r.premium / 1e6).toFixed(2)}M`)
            .join(" | "),
      );
    }
    if (intelLines.length > 0) {
      parts.push(`\nSMART MONEY (Unusual Whales — refreshed ${intel.generatedAt.slice(11, 16)} UTC)\n${intelLines.join("\n")}`);
    }
  }

  // 7. Recent alerts
  if (recentAlerts.length > 0) {
    const alertLines = recentAlerts
      .map((a) => {
        const status = a.read ? "seen" : "unread";
        return `[${a.type ?? "alert"} · ${status}] ${a.title}${a.body ? ` — ${a.body}` : ""}`;
      })
      .join("\n");
    parts.push(`\nRECENT ALERTS (Companion / feed)\n${alertLines}`);
  }

  // 8. Recent executions
  if (recentExecutions.length > 0) {
    const execLines = recentExecutions
      .map((e) => {
        const execParts: string[] = [];
        if (e.symbol) execParts.push(e.symbol);
        if (e.direction) execParts.push(e.direction.toUpperCase());
        if (e.status) execParts.push(`[${e.status}]`);
        if (e.notes) execParts.push(`— ${e.notes}`);
        return execParts.join(" ");
      })
      .join("\n");
    parts.push(`\nRECENT EXECUTION REQUESTS (when synced)\n${execLines}`);
  }

  // 9. Memory (same logic as buildAxeMessages)
  const { user_memory: memory } = context;
  if (memory.length > 0) {
    const tradingMemory = memory.filter((m) => m.scope !== "watchlist");
    const accountEntry = tradingMemory.find(
      (m) => m.scope === "account" && m.entry_key === "name"
    );
    const notes = tradingMemory.filter((m) => m.scope === "notes");
    const other = tradingMemory.filter(
      (m) => m.scope !== "notes" && m.scope !== "account"
    );

    if (accountEntry) {
      parts.push(
        `\nACTIVE ACCOUNT: ${accountEntry.content}\nAlways reference this account by name when confirming alerts, setups, or any action taken. Say "on your ${accountEntry.content}" naturally in context.`
      );
    }
    if (notes.length > 0) {
      const noteLines = notes.map((m) => `— ${m.content}`).join("\n");
      parts.push(`\nSAVED NOTES (trader's own notes — reference when relevant)\n${noteLines}`);
    }
    if (other.length > 0) {
      const memLines = other
        .map((m) => {
          const label = [m.scope, m.entry_key].filter(Boolean).join(" / ");
          return `${label}: ${m.content}`;
        })
        .join("\n");
      parts.push(`\nTRADER MEMORY\n${memLines}`);
    }
  }

  // 10. Open commitments — AXE must address these proactively
  if (context.open_commitments && context.open_commitments.length > 0) {
    const commitLines = context.open_commitments
      .map((c) => {
        const sym = c.symbol ? `[${c.symbol}] ` : "";
        return `— ${sym}${c.description}`;
      })
      .join("\n");
    parts.push(
      `\nOPEN COMMITMENTS (you made these promises — address the relevant ones now without being asked)\n${commitLines}`
    );
  }

  // 10b. Session mode — terminal snapshot vs Companion ingest ledger
  if (!context.live_account) {
    const hasIngestLedger = (context.companion_broker_trades?.length ?? 0) > 0;
    const hasLinkedAccounts = (context.companion_accounts?.length ?? 0) > 0;
    if (hasIngestLedger || hasLinkedAccounts) {
      parts.push(
        "\nSESSION MODE: AXE Companion — MT5 ingest ledger is present below (broker_trades). No live desktop-terminal snapshot in this session; use tools for intraday price when needed."
      );
    } else {
      parts.push(
        "\nSESSION MODE: Companion-only (no live MT5 snapshot and no ingest ledger yet). Treat the trader as mobile/web-first; use tools for price and calendar when needed."
      );
    }
  }

  if (context.companion_accounts && context.companion_accounts.length > 0) {
    const lines = context.companion_accounts.map((a) => {
      const active =
        context.companion_active_account_id && a.id === context.companion_active_account_id
          ? " [ACTIVE]"
          : "";
      return `— ${a.label} (${a.provider}) status:${a.status ?? "—"}${active}`;
    });
    parts.push(`\nLINKED BROKER ACCOUNTS (Companion)\n${lines.join("\n")}`);
  }

  if (context.companion_broker_trades && context.companion_broker_trades.length > 0) {
    const lines = context.companion_broker_trades.slice(0, 15).map((t) => {
      const pnl =
        t.pnl > 0 ? `+${t.pnl.toFixed(2)}` : t.pnl < 0 ? t.pnl.toFixed(2) : t.pnl.toFixed(2);
      const when = t.close_time ? new Date(t.close_time).toISOString().slice(0, 16) : "open/pending";
      return `${t.symbol} ${t.side} vol:${t.volume} PnL:${pnl} close:${when}`;
    });
    parts.push(
      `\nRECENT BROKER TRADES (ingested — active account, same as History tab)\n${lines.join("\n")}`
    );
  }

  if (context.companion_trade_labels && context.companion_trade_labels.length > 0) {
    const lines = context.companion_trade_labels.map((l) => {
      const bits = [l.symbol, l.label ?? "—", l.note ? `note:${l.note}` : ""].filter(Boolean);
      return `— trade ${l.trade_id.slice(0, 8)}… ${bits.join(" · ")}`;
    });
    parts.push(`\nTRADE JOURNAL LABELS (on ingested trades)\n${lines.join("\n")}`);
  }

  if (context.companion_journal_entries && context.companion_journal_entries.length > 0) {
    const lines = context.companion_journal_entries.map((j) => {
      const excerpt = j.notes.length > 220 ? `${j.notes.slice(0, 220)}…` : j.notes;
      return `[${j.symbol}] ${excerpt}`;
    });
    parts.push(`\nJOURNAL ENTRIES (user_journal_entries)\n${lines.join("\n")}`);
  }

  // 11. Live MT5 account snapshot
  if (context.live_account) {
    const a = context.live_account;
    const cur = a.currency ?? "USD";
    const bal = a.balance != null ? `${cur} ${a.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
    const eq = a.equity != null ? `${cur} ${a.equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
    const fm = a.free_margin != null ? `${cur} ${a.free_margin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
    const lev = a.leverage != null ? `1:${a.leverage}` : "—";
    const acctName = a.name ? ` (${a.name})` : "";
    parts.push(
      `\nLIVE ACCOUNT${acctName} — synced ${a.updated_at ? new Date(a.updated_at).toUTCString() : "recently"}\nBalance: ${bal}   Equity: ${eq}   Free margin: ${fm}   Leverage: ${lev}`
    );
  }

  // 12. Live open positions
  if (context.live_positions && context.live_positions.length > 0) {
    const posLines = context.live_positions.map((p) => {
      const dir = p.type;
      const pnl = p.profit != null
        ? (p.profit >= 0 ? `+${p.profit.toFixed(2)}` : p.profit.toFixed(2))
        : "—";
      const sl = p.stop_loss != null ? ` SL:${p.stop_loss}` : "";
      const tp = p.take_profit != null ? ` TP:${p.take_profit}` : "";
      const cur = p.current_price != null ? ` @${p.current_price}` : "";
      return `${p.symbol} ${dir} ${p.volume}lot  open:${p.open_price}${cur}  P&L:${pnl}${sl}${tp}`;
    });
    parts.push(`\nOPEN POSITIONS (live — TradingOS sync)\n${posLines.join("\n")}`);
  } else if (context.live_account) {
    parts.push(`\nOPEN POSITIONS\nNo open positions.`);
  }

  // 13. Recent closed positions (trade history)
  if (context.closed_positions && context.closed_positions.length > 0) {
    const closeLines = context.closed_positions.slice(0, 10).map((p) => {
      const pnl = p.profit != null
        ? (p.profit >= 0 ? `+${p.profit.toFixed(2)}` : p.profit.toFixed(2))
        : "—";
      const dur = p.opened_at && p.closed_at
        ? (() => {
            const mins = Math.round((new Date(p.closed_at).getTime() - new Date(p.opened_at).getTime()) / 60000);
            return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
          })()
        : "—";
      const reason = p.close_reason ? ` [${p.close_reason}]` : "";
      return `${p.symbol} ${p.type} ${p.volume}lot  in:${p.open_price} → out:${p.close_price}  P&L:${pnl}  held:${dur}${reason}`;
    });
    parts.push(`\nRECENT CLOSED TRADES (last ${context.closed_positions.length}, newest first)\n${closeLines.join("\n")}`);
  }

  if (context.knowledge_layer?.trim()) {
    parts.push(
      `\n--- AXE KNOWLEDGE LAYER (retrieved; prefer these frames over generic textbook talk when relevant)\n${context.knowledge_layer.trim()}`
    );
  }

  parts.push(`\n${AXE_KNOWLEDGE_GUARDRAILS}`);

  const systemContent = parts.join("\n");

  // Build user message (multimodal if chart image attached)
  let userMessage: OpenAI.Chat.ChatCompletionMessageParam;
  if (imageBase64 && imageType) {
    const mimeType = imageType.startsWith("image/") ? imageType : `image/${imageType}`;
    userMessage = {
      role: "user",
      content: [
        { type: "text", text: newUserMessage },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
        },
      ],
    };
  } else {
    userMessage = { role: "user", content: newUserMessage };
  }

  return [
    { role: "system", content: systemContent },
    ...history,
    userMessage,
  ];
}

const VALID_TOOL_NAMES: Set<AxeToolCall["tool"]> = new Set([
  "create_alert",
  "get_live_price",
  "get_economic_calendar",
  "save_note",
  "calculate_fibonacci",
  "analyze_orderblock",
  "analyze_pdh_pdl",
  "calculate_trendline",
  "track_commitment",
  "get_news_headlines",
  "get_smart_money_intel",
  "list_alerts",
  "update_alert",
  "read_journal",
  "navigate_to",
]);

export async function callAxe(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<AxeResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[axeService] OPENAI_API_KEY not set");
    return { content: null, toolCalls: [] };
  }

  const config = getAIConfig();
  if (!config) {
    console.error("[axeService] No AI provider configured. Set OLLAMA_BASE_URL or OPENAI_API_KEY.");
    return { content: null, toolCalls: [] };
  }

  const model = getModelForProvider(config);

  try {
    const response = await createChatCompletion({
      model,
      messages,
      tools: AXE_TOOLS,
      tool_choice: "auto",
      parallel_tool_calls: true,
      max_tokens: 800,
      temperature: 0.55,
    });

    const choice = response.choices[0];
    const rawToolCalls = choice.message.tool_calls ?? [];

    if (rawToolCalls.length > 0) {
      const toolCalls: AxeToolCall[] = [];
      for (const raw of rawToolCalls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (raw as any).function as { name: string; arguments: string };
        const name = fn.name as AxeToolCall["tool"];
        if (VALID_TOOL_NAMES.has(name)) {
          const parsed = JSON.parse(fn.arguments);
          toolCalls.push({ id: raw.id, tool: name, args: parsed } as AxeToolCall);
        }
      }
      if (toolCalls.length > 0) {
        return { content: null, toolCalls };
      }
    }

    return { content: choice.message.content ?? null, toolCalls: [] };
  } catch (err) {
    console.error("[axeService] OpenAI error:", err);
    return { content: null, toolCalls: [] };
  }
}

// Intermediate call after tool results — can still trigger a second tool round (e.g. create_alert after fib)
export async function callAxeAfterTool(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<AxeResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { content: null, toolCalls: [] };

  const config = getAIConfig();
  if (!config) return { content: null, toolCalls: [] };

  const model = getModelForProvider(config);

  try {
    const response = await createChatCompletion({
      model,
      messages,
      tools: AXE_TOOLS,
      tool_choice: "auto",
      parallel_tool_calls: true,
      max_tokens: 600,
      temperature: 0.4,
    });

    const choice = response.choices[0];
    const rawToolCalls = choice.message.tool_calls ?? [];

    if (rawToolCalls.length > 0) {
      const toolCalls: AxeToolCall[] = [];
      for (const raw of rawToolCalls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (raw as any).function as { name: string; arguments: string };
        const name = fn.name as AxeToolCall["tool"];
        if (VALID_TOOL_NAMES.has(name)) {
          const parsed = JSON.parse(fn.arguments);
          toolCalls.push({ id: raw.id, tool: name, args: parsed } as AxeToolCall);
        }
      }
      if (toolCalls.length > 0) {
        return { content: null, toolCalls };
      }
    }

    return { content: choice.message.content ?? null, toolCalls: [] };
  } catch (err) {
    console.error("[axeService] callAxeAfterTool error:", err);
    return { content: null, toolCalls: [] };
  }
}

// Final natural-language reply after all tools are done — no more tool calls
export async function callAxeFinal(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const config = getAIConfig();
  if (!config) return null;

  const model = getModelForProvider(config);

  try {
    const response = await createChatCompletion({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.4,
    });
    return response.choices[0]?.message?.content ?? null;
  } catch (err) {
    console.error("[axeService] callAxeFinal error:", err);
    return null;
  }
}

/* ── Streaming variants ─────────────────────────────────────────
   callAxeStreaming  — streaming version of callAxe. Emits text
   tokens via onToken callback. Returns AxeResponse with full text
   + any tool calls (model may return tool calls instead of text).

   callAxeFinalStreaming — streaming version of callAxeFinal.
   No tools, just pure text streaming.
   ────────────────────────────────────────────────────────────── */

export async function callAxeStreaming(
  messages: LLMMessage[],
  onToken: (text: string) => void,
): Promise<AxeResponse> {
  try {
    const result = await streamLLM(
      {
        messages,
        tools: AXE_TOOLS,
        toolChoice: "auto",
        max_tokens: 800,
        temperature: 0.55,
      },
      onToken,
    );

    if (result.toolCalls.length > 0) {
      return { content: null, toolCalls: result.toolCalls as AxeToolCall[] };
    }

    return { content: result.content, toolCalls: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[axeService] callAxeStreaming error:", msg);
    // Re-throw so chatService can surface the real error
    throw err;
  }
}

export async function callAxeFinalStreaming(
  messages: LLMMessage[],
  onToken: (text: string) => void,
): Promise<string | null> {
  try {
    const result = await streamLLM(
      {
        messages,
        max_tokens: 500,
        temperature: 0.4,
      },
      onToken,
    );
    return result.content;
  } catch (err) {
    console.error("[axeService] callAxeFinalStreaming error:", err);
    throw err;
  }
}
