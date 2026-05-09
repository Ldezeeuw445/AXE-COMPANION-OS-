# Market context providers

The `/market` page and `/api/market/context` route blend macro, news and the
economic calendar with the user's active pair, watchlist and open positions.
Each provider is independent and gracefully degrades when its key is missing
— no fake data is ever returned.

## Provider matrix

| Layer | Primary | Fallback chain | Env var |
|---|---|---|---|
| Macro snapshot (yields, rates, CPI, USD index, VIX) | **FRED** | — | `FRED_API_KEY` |
| Symbol news (paid, equities + crypto + FX context) | **Polygon.io** | Perigon → Finnhub → EODHD → Google News | `POLYGON_API_KEY` |
| Topical news / sentiment | **Perigon** | covered above | `PERIGON_API_KEY` |
| Economic calendar (high-impact events) | **Finnhub** | — | `FINNHUB_API_KEY` |
| News fallback | **EODHD** | — | `EODHD_API_KEY` |
| Smart-money intel | **Unusual Whales** | — | `UNUSUAL_WHALES_TOKEN` |

The router picks the first provider that returns content. Providers report
their state via `detectProviders()` so the UI shows honest "off" badges.

## Set keys on Vercel

```bash
cd "/Users/luka/Desktop/AXE Companion Final APP/AXE COMPANION FINAL APP"

# Macro
vercel env add FRED_API_KEY production
vercel env add FRED_API_KEY preview

# News (pick what you have)
vercel env add POLYGON_API_KEY production    # paid feed, primary
vercel env add PERIGON_API_KEY production    # free tier, secondary
vercel env add FINNHUB_API_KEY production
vercel env add EODHD_API_KEY production
# repeat for `preview` for preview deploys

vercel deploy --prod
```

After redeploy, `/market` will pick them up automatically.

## Caching

| Provider | Revalidate |
|---|---|
| FRED | 1h (data updates daily/monthly) |
| News (any) | 5 min |
| Calendar | 30 min |

Per-symbol cache tags live under `news:<provider>` and `news:<symbol>` so
selective invalidation is straightforward via Next's `revalidateTag` later.

## Observability

`/api/market/context` returns the full structured payload — useful for tool
calls in chat or external clients. Auth is required; only returns the user's
own context.

## Future hardening

- Inject `summarizeMarketContext()` into the chat prompt when the user
  references a symbol; gated to keep token cost low.
- Wire SEC filings (`SEC_API_KEY`) for stock-aware flows once we add stock
  pages.
- Add Supabase persistence for "favourite" headlines saved into Vault.
