# Alpaca Live Ready

Deze map is bedoeld als directe aansluitlaag voor jouw bestaande broker hub.

Doel:

1. `MT5` blijft werken zoals nu
2. `Alpaca Paper` blijft ondersteund
3. `Alpaca Live` kan zonder architectuurwissel aangezet worden
4. `IBKR` kan later op exact dezelfde contracten aansluiten

## Wat hier al klaarstaat

- broker-agnostische types
- adapter contract
- Alpaca environment/config mapping
- Alpaca Live + Paper adapter skelet
- echte HTTP methodes voor account / positions / orders / quotes / portfolio history
- WebSocket helpers voor trade updates en quotes
- broker API route handlers voor connections / accounts / orders / market data / health / events
- persistente file-backed connection store voor lokale integratie-tests
- persistente event log voor broker events
- encrypted secret store voor broker credentials
- OAuth refresh/reconnect flow voor Alpaca Connect
- initial authorization-code exchange voor Alpaca Connect
- frontend accounts-tab flow helpers for Alpaca Connect
- capability flags
- connection payloads
- implementatiechecklist
- `.env` template

## Wat jij later nog hoeft te doen

1. deze contracten koppelen aan je bestaande broker hub service
2. credentials veilig opslaan
3. eventueel OAuth redirect/callback UI afhandelen in je auth backend
4. user connect UI eraan hangen
5. live trading pas aanzetten na end-to-end test

## Aanbevolen volgorde

1. `types.ts`
2. `broker-contract.ts`
3. `alpaca-config.ts`
4. `alpaca-adapter.ts`
5. `IMPLEMENTATION-CHECKLIST.md`

## Belangrijke keuze

Er zijn twee manieren om Alpaca te koppelen:

1. `API key mode`
   Snelste route voor jouw eigen account en interne live testing.
2. `OAuth Connect mode`
   Nodig als eindgebruikers met hun eigen Alpaca-account moeten inloggen via “Sign in with Alpaca”.

Deze map ondersteunt architectonisch beide routes, maar gaat uit van:

- `eerst API key mode live`
- `daarna OAuth Connect`

## Officiële bronnen

- Alpaca Authentication: https://docs.alpaca.markets/us/docs/authentication
- Alpaca OAuth / Connect: https://docs.alpaca.markets/us/docs/about-connect-api
- Using OAuth2 and Trading API: https://docs.alpaca.markets/us/docs/using-oauth2-and-trading-api
- Alpaca Trading API: https://docs.alpaca.markets/us/docs/trading-api
- Alpaca WebSocket Streaming: https://docs.alpaca.markets/us/docs/websocket-streaming
- Alpaca Market Data Stream: https://docs.alpaca.markets/us/docs/streaming-market-data
