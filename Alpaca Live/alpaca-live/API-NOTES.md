# API Notes

Dit zijn de belangrijkste Alpaca Live punten waar jouw broker hub rekening mee moet houden.

## Environment split

Volgens Alpaca docs:

- `live trading`: `https://api.alpaca.markets`
- `paper trading`: `https://paper-api.alpaca.markets`
- `market data`: `https://data.alpaca.markets`

Live en paper credentials zijn gescheiden. Je kunt live credentials niet op paper gebruiken en andersom.

Bron:

- https://docs.alpaca.markets/us/docs/authentication

## Trade updates

Trading/account/order updates komen via:

- `wss://paper-api.alpaca.markets/stream`
- `wss://api.alpaca.markets/stream`

Belangrijk:

- `trade_updates` stream luisteren voor order/account state
- paper stream gebruikt binary frames

Bron:

- https://docs.alpaca.markets/us/docs/websocket-streaming

## Market data

Realtime market data komt via:

- `wss://stream.data.alpaca.markets/{version}/{feed}`

Je wilt dit capability-based behandelen in AXE:

- top-of-book / quotes: `broker`
- depth drawer: voorlopig `synthetic`

Bron:

- https://docs.alpaca.markets/us/docs/streaming-market-data

## OAuth Connect

Als eindgebruikers met hun eigen Alpaca-account moeten inloggen:

- gebruik Alpaca Connect / OAuth
- live trading voor andere gebruikers vraagt approval van Alpaca

Bronnen:

- https://docs.alpaca.markets/us/docs/about-connect-api
- https://docs.alpaca.markets/us/docs/using-oauth2-and-trading-api
