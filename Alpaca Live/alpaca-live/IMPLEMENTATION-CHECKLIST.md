# Implementation Checklist

## Phase 1 — Hub contracts

- [ ] Koppel `types.ts` aan je bestaande broker hub modellen
- [ ] Voeg `broker = mt5 | alpaca | ibkr` toe aan je connection records
- [ ] Voeg `environment = paper | live` toe
- [ ] Voeg `authMode = api_keys | oauth | local_gateway` toe
- [ ] Voeg capability flags toe in je broker resolver

## Phase 2 — Alpaca API key mode

- [ ] Build `connect alpaca paper`
- [ ] Build `connect alpaca live`
- [x] Add broker hub route scaffolding
- [x] Add persistent local connection store
- [x] Add broker event log route/store
- [x] Add encrypted broker credential store
- [ ] Valideer account via `/v2/account`
- [ ] Sync positions via `/v2/positions`
- [ ] Sync orders via `/v2/orders`
- [ ] Sync portfolio history via `/v2/account/portfolio/history`
- [ ] Koppel market data via `data.alpaca.markets`
- [ ] Koppel trade updates via `wss://paper-api.alpaca.markets/stream`
- [ ] Koppel live trade updates via `wss://api.alpaca.markets/stream`

## Phase 3 — UI / product

- [x] Broker connect modal/contracts: `MT5 / Alpaca / later IBKR`
- [ ] Environment switch: `Paper / Live`
- [ ] Status badges: `connected / degraded / reauth required`
- [ ] Account snapshot UI
- [ ] Positions / orders / fills UI
- [ ] Depth source label: `synthetic` for Alpaca
- [ ] Live trading warning / confirmation modal

## Phase 4 — Security

- [ ] Encrypt broker credentials at rest
- [ ] Never expose secret keys to frontend
- [ ] Use server-side order placement only
- [ ] Per-user rate limiting
- [ ] Audit log for place / cancel / replace
- [ ] Kill switch for Alpaca Live

## Phase 5 — OAuth Connect

- [ ] Register app in Alpaca Connect
- [ ] Add redirect URI
- [ ] Store OAuth token set
- [ ] Support one live + one paper account on same user when available
- [ ] Add reauth flow on expired / revoked token

## Phase 6 — IBKR later

- [ ] Reuse same contracts
- [ ] Add `IBKRAdapter`
- [ ] Start with local gateway mode
- [ ] Keep order / position / quote models unchanged

## Shipping gate for Alpaca Live

Alpaca Live should only be enabled when all of these are true:

- [ ] Paper and live are fully separated
- [ ] Order preview is correct
- [ ] Account and buying power sync are correct
- [ ] Trade update stream is stable
- [ ] Cancel / replace behavior is tested
- [ ] Retry logic is tested
- [ ] Human confirmation is required for live account order placement
