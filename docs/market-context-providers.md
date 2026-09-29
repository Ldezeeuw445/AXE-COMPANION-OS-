# Market context providers

The `/market` page and `/api/market/context` route blend macro, news and the
economic calendar with the user's active pair, watchlist and open positions.
Each provider is independent and gracefully degrades when its key is missing
— no fake data is ever returned.

Production is **IONOS** (`www.axecompanion.com`), not Vercel.

## Provider matrix

| Layer | Primary | Fallback chain | Env var |
|---|---|---|---|
| Macro snapshot (yields, rates, CPI, USD index, VIX) | **FRED** | market-proxy Edge Function | `FRED_API_KEY` |
| Symbol news (paid, equities + crypto + FX context) | **Polygon.io** | Perigon → Finnhub → EODHD → Google News | `POLYGON_API_KEY` |
| Topical news / sentiment | **Perigon** | covered above | `PERIGON_API_KEY` |
| Economic calendar (high-impact events) | **Finnhub** | market-proxy → Forex Factory | `FINNHUB_API_KEY` |
| News fallback | **EODHD** | — | `EODHD_API_KEY` |
| Smart-money intel | **Unusual Whales** | — | `UNUSUAL_WHALES_TOKEN` |

The router picks the first provider that returns content. Providers report
their state via `detectProviders()` so the UI shows honest "off" badges.

## Set keys on IONOS

On the IONOS Next.js host (server-only env, never `NEXT_PUBLIC_`):

```bash
# Direct providers (optional — skip if you keep keys only on Supabase Edge)
FRED_API_KEY=...
FINNHUB_API_KEY=...

# Required for market-proxy fallback when those keys are absent on IONOS:
# prefer a dedicated EDGE_SECRET; CRON_SECRET is accepted if EDGE_SECRET is unset.
# Use the same value as the Supabase Edge secret (see below).
EDGE_SECRET=...          # or CRON_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...   # production fallback if EDGE/CRON secret is not set yet
```

Restart the Next process after changing env. Demo anonymous sign-in is
unchanged; the browser never calls `market-proxy`.

## market-proxy auth + redeploy

`market-proxy` used to run with `verify_jwt=false` and no Authorization check,
so anyone who knew the project URL could burn FRED/Finnhub quota. JWT
verification is **not** the fix: the public anon key is a JWT, and the demo
route must keep anonymous sign-in enabled.

The function now requires `Authorization: Bearer <shared secret>` matching
`EDGE_SECRET`, `CRON_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY`. Keep
`verify_jwt=false` — the dedicated secret is not a user JWT.

Redeploy the function (after setting the secret):

```bash
# same value as IONOS EDGE_SECRET or CRON_SECRET
supabase secrets set EDGE_SECRET='<same as IONOS>' --project-ref pqnngpcgbdwxavbatbia

supabase functions deploy market-proxy \
  --project-ref pqnngpcgbdwxavbatbia \
  --no-verify-jwt
```

Order so production does not flap:

1. Set `EDGE_SECRET` or `CRON_SECRET` on IONOS **and** as a Supabase Edge secret (same string).
2. Deploy / restart Next.js on IONOS (this PR's callers).
3. Deploy `market-proxy` with the CLI above. The `intel-proxy` GitHub Action does not deploy this function.

Until a dedicated secret is set, Next.js still sends `SUPABASE_SERVICE_ROLE_KEY`,
which the function also accepts. The public anon key is never accepted.

Do **not** deploy `intel-proxy`, `ring-webhook`, or `ai-proxy*` as part of this change.

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
