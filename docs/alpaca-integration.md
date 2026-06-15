# Alpaca integration — AXE Companion

Roadmap for replacing the weak `demo_paper` localStorage book with a credible US equities paper stack.

## Goals

1. **First impression** — sceptical traders can practice without MT5 credentials.
2. **Real market data** — charts reflect actual US equity prices (not synthetic random walks).
3. **Resettable paper** — flatten positions + cancel orders in one tap (balance reset via new paper account in Phase 2).
4. **Live path later** — same adapter shape supports Alpaca live keys when users opt in.

## Phase 1 (implemented in this repo)

| Piece | Path | Status |
|-------|------|--------|
| REST client | `src/lib/alpaca/client.ts` | Done |
| Env config | `src/lib/alpaca/env.ts` | Done |
| Symbol map | `src/lib/alpaca/symbols.ts` | Done (US tickers) |
| Historical bars | `src/lib/alpaca/bars.ts` | Done |
| Auto-provision | `src/lib/alpaca/provision.ts` | Done |
| Paper reset | `src/lib/alpaca/reset.ts` | Done (cancel + close) |
| Hub adapter | `src/lib/broker/hub/adapters/alpacaLive.ts` | Done |
| API: provision | `POST /api/alpaca/provision` | Done |
| API: reset | `POST /api/alpaca/reset` | Done |
| API: order | `POST /api/alpaca/order` | Done |
| Demo chart data | `loadChartPageData` uses Alpaca bars when env set | Done |

### Server environment

```bash
# Paper trading (required for Alpaca features)
ALPACA_PAPER_API_KEY_ID=PK...
ALPACA_PAPER_API_SECRET_KEY=...

# Optional overrides
ALPACA_PAPER_BASE_URL=https://paper-api.alpaca.markets
ALPACA_DATA_BASE_URL=https://data.alpaca.markets
```

Get keys: [Alpaca dashboard](https://app.alpaca.markets) → Paper Trading → API Keys.

### Enable in Supabase (after migration)

```sql
update public.broker_providers
set enabled = true
where id = 'alpaca-style';
```

### User flow (API-level)

1. `POST /api/alpaca/provision` — creates `user_broker_accounts` row with `connection_method = cloud_alpaca`.
2. User selects **AXE Alpaca Paper** as active account (Settings / account switcher — UI hookup pending).
3. `POST /api/alpaca/order` — place/replace orders (tagged `axe-{userId}-…`).
4. `POST /api/alpaca/reset` — cancel all orders + close all positions.

### Demo account upgrade (no UI change required)

When Alpaca env vars are set, **AXE Demo** charts for supported symbols (AAPL, TSLA, NVDA, …) automatically load **real Alpaca bars** instead of `generateDemoCandles()`.

Symbols like **SPCXUSD** (SpaceX CFD on MT5) are **not** on Alpaca — those stay on MT5 live or synthetic demo.

## Phase 2 (next)

| Item | Notes |
|------|-------|
| Settings UI | "Enable Alpaca Paper" + "Reset paper" buttons |
| Account switcher | Show Alpaca paper alongside MT5 + AXE Demo |
| Chart live stream | Alpaca websocket → `useLiveChart` for cloud_alpaca |
| Per-user isolation | Alpaca **Broker API** sub-accounts OR encrypted BYO keys per user |
| Full balance reset | New paper account via dashboard / Broker API |
| Enable `broker_providers.enabled` in production | After smoke test |

## Phase 3 (optional)

- Alpaca live trading (`ALPACA_LIVE_*` env + user consent)
- Options / crypto asset classes
- Replace shared platform paper with 1:1 user paper accounts

## Architecture

```
┌─────────────┐     POST /api/alpaca/provision     ┌──────────────────┐
│  AXE Client │ ─────────────────────────────────►│ ensureAlpacaPaper│
└─────────────┘                                     └────────┬─────────┘
       │                                                     │
       │ chart load (demo / alpaca account)                  ▼
       ▼                                            user_broker_accounts
┌─────────────┐     fetchAlpacaCandles            ┌──────────────────┐
│ ChartScreen │ ◄─────────────────────────────────│ Alpaca Data API  │
└─────────────┘                                     └──────────────────┘
       │
       │ POST /api/alpaca/order
       ▼
┌──────────────────┐
│ Alpaca Trading   │
│ (paper-api)      │
└──────────────────┘
```

## Limitations (Phase 1)

- **Shared platform paper keys** — all provisioned users hit the same Alpaca paper account until Broker API lands. Orders are prefixed by user id; positions are not isolated yet.
- **No full $100k reset via API** — Alpaca removed balance reset; we cancel/close only.
- **US equities only** — forex/CFD (SPCX, XAU) remain on MT5.

## Testing checklist

- [ ] Set `ALPACA_PAPER_*` env on Railway/Vercel
- [ ] `GET /api/alpaca/provision` → `{ configured: true }`
- [ ] `POST /api/alpaca/provision` while signed in → account row created
- [ ] Open demo chart on **TSLA** → real candles (not flat synthetic)
- [ ] `POST /api/alpaca/order` limit buy → visible in Alpaca dashboard
- [ ] `POST /api/alpaca/reset` → orders gone, positions flat
