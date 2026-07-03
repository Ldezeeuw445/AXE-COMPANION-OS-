# Accounts Tab Frontend Flow

Deze frontend-laag is bedoeld om `Alpaca Connect` op exact dezelfde plek te laten landen als je bestaande `MT5 connect` flow:

- zelfde accounts tab
- zelfde broker connect hub
- extra tile voor `Alpaca`
- later zelfde patroon voor `IBKR`

## Bestand

- [alpaca-connect-flow.ts](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/alpaca-live-ready/frontend/alpaca-connect-flow.ts)

## Wat hier al in zit

- `buildAlpacaAuthorizeUrl(...)`
  - bouwt de officiële Alpaca authorize URL
- `startAlpacaConnect(...)`
  - redirect de gebruiker vanuit je accounts tab naar Alpaca
- `completeAlpacaCallback(...)`
  - handelt de callback af en maakt direct een broker connection via `/broker/connections`
- `refreshAlpacaConnection(...)`
  - triggert `PATCH /broker/connections` met `refresh_auth`
- `disconnectBrokerConnection(...)`
  - verwijdert de broker connection
- `buildAccountsTabBrokerTiles(...)`
  - zet broker connections om naar UI tiles voor `MT5 / Alpaca / IBKR`

## Bedoelde UX in je accounts tab

1. gebruiker opent `Accounts`
2. ziet tiles:
   - `MT5`
   - `Alpaca`
   - later `IBKR`
3. klikt `Connect Alpaca`
4. frontend gebruikt `startAlpacaConnect(...)`
5. Alpaca redirect terug naar jouw callback
6. callback page gebruikt `completeAlpacaCallback(...)`
7. nieuwe broker connection verschijnt terug in dezelfde accounts tab

## Aanbevolen schermen

### 1. Accounts tab

- bestaande `MT5` tile
- nieuwe `Alpaca` tile
- status:
  - `connected`
  - `reauth_required`
  - `disconnected`

### 2. Alpaca callback page

- leest `code`, `state`, `env`
- roept `completeAlpacaCallback(...)` aan
- redirect daarna terug naar `Accounts`

## Belangrijke notitie

Deze frontend helper verwacht dat je backend al deze routes heeft:

- `POST /broker/connections`
- `PATCH /broker/connections`
- `DELETE /broker/connections`

Die zijn in deze scaffold nu aanwezig.

Voor dezelfde Accounts-tab aanpak met IBKR, zie ook:

- [../../ibkr-live-ready/frontend/ibkr-connect-flow.ts](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/ibkr-live-ready/frontend/ibkr-connect-flow.ts)
- [../../ibkr-live-ready/ACCOUNTS_TAB_WIRING.md](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/ibkr-live-ready/ACCOUNTS_TAB_WIRING.md)
