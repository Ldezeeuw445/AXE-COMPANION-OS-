# AXE Companion — where every key lives

Verified on 2026-09-22 by calling each provider from the VPS. Status columns are
measurements, not assumptions. Re-check any time with:

```bash
ssh axe-api 'cd /root/AXE-COMPANION-OS- && S=$(grep -E "^CRON_SECRET=" .env.local | tail -1 | cut -d= -f2-) && curl -s -H "Authorization: Bearer $S" http://127.0.0.1:5000/api/internal/key-health'
```

## The three places a secret can live

| Store | File / UI | Read by | Applies after |
|---|---|---|---|
| **VPS app env** | `/root/AXE-COMPANION-OS-/.env.local` | the Next server (`next start`) | `systemctl restart axe-companion` — but any `NEXT_PUBLIC_*` is baked into the bundle and needs a full `./deploy.sh deployed` |
| **Supabase Edge secrets** | Supabase dashboard → Edge Functions → Secrets | `intel-proxy`, `market-proxy` | redeploying the function |
| **Supabase Vault** | `vault.secrets` | `axe_ops.dispatch_cron` (pg_cron) | immediately |

A fourth store exists on the same box and is the reason several keys look
missing: **`/opt/axe-core-api/.env`** (AXE Core). The values are there and valid;
Companion simply never received them when the app moved off Vercel — its own
`.env.local` has the names present but empty.

## What is actually broken, and where the fix goes

| Key | Belongs in | Measured status | Powers |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | VPS app env | **wrong value** — holds a Supabase `sb_secret_…` | checkout, portal |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `NEXT_PUBLIC_STRIPE_PAYMENT_LINK*` | VPS app env | **empty** | Pro unlocking after payment |
| `PERIGON_API_KEY` | VPS app env | **valid in AXE Core env**, empty in Companion | news for `get_news_headlines`, feed |
| `POLYGON_API_KEY` | VPS app env | **valid in AXE Core env**, empty in Companion | reference news |
| `FINNHUB_API_KEY` | VPS app env **and** Edge secrets | **valid in AXE Core env**, empty in both | calendar, and the intel fallbacks for tide / dark pool / options |
| `EODHD_API_KEY` | VPS app env | **valid in AXE Core env**, empty in Companion | news fallback |
| `EIA_API_KEY` | Edge secrets | **valid in AXE Core env** | energy flows |
| `FMP_API_KEY` | Edge secrets | **valid**, but the app calls the retired `/api/v3` endpoint — FMP answers "Legacy Endpoint"; use `/stable` | congress trades |
| `UNUSUAL_WHALES_TOKEN` | Edge secrets (+ app env) | **revoked** — 401 "valid format but is not recognized" on both the Edge value and AXE Core's | market tide, dark pool, options flow, insiders, congress |
| `RAPIDAPI_KEY`, `AISSTREAM_API_KEY`, `ACLED_MAIL`/`ACLED_PASSWORD`, `GREYNOISE_API_KEY`, `QUIVER_API_KEY` | Edge secrets only | not present anywhere on the VPS; `intel-proxy` answers `invalid_token` | radar, emergency, vessels, conflict, cyber, congress |
| `COINGECKO_API_KEY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | VPS app env | empty | wallet balances / connect |
| `KRATER_API_KEY` | — | **retired**, no longer read | the feed is written locally now |

## Working, leave alone

`METAAPI_TOKEN` (MT5), `SUPABASE_SERVICE_ROLE_KEY`, `OLLAMA_BASE_URL`,
`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `FRED_API_KEY`, `CRON_SECRET` (app env
and Vault agree — pg_cron reaches the app with HTTP 200),
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`,
`CHART_SESSION_JWT_SECRET`, `AXE_CORE_TOOLS_SECRET`.

## Needs no key at all

News falls back to Google News RSS, and the economic calendar to the Forex
Factory mirror. Both were live on 2026-09-22. Corporate jets runs on adsb.lol.
So the feed and AXE's headline tool work without buying anything — provider keys
only improve coverage.

## Intel: the DB is the second source

`intelClient` tries `intel-proxy` first and falls back to the `intel_*` tables,
so whatever writes those rows keeps the tiles alive even while the Edge secrets
are wrong. `intel_sync_log` shows the last writes: corporate jets, options
(finnhub), insiders (sec_edgar) and tide (finnhub) on 2026-08-14, vessels and
conflict on 2026-08-13, energy on 2026-07-24, radar on 2026-07-09, cyber on
2026-06-09. Nothing since.

That is the seam for AXE Core: it already fetches free intel sources
(`backend/adapters/intel.py` — USGS, CISA KEV — plus an AISStream service and a
Supabase sync). If AXE Core writes the `intel_*` tables on its own schedule with
its own keys, Companion shows the data without holding those keys at all. The
column list per table is in `information_schema`; match it before writing.
