# Broker API Routes

Deze routes zijn framework-neutraal opgezet. Elke file exporteert een handler die je direct kunt mappen in:

- Next.js route handlers
- Express controllers
- Hono / Workers routes
- jouw bestaande broker hub backend

## Beschikbare routes

### `brokerConnectionsRoute`

Bestand:

- [routes/connections.ts](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/alpaca-live-ready/api/routes/connections.ts)

Ondersteunt:

- `GET /broker/connections?userId=...`
- `POST /broker/connections`
  - met gewone `ConnectInput`
  - of met `BrokerOAuthExchangeInput` voor Alpaca authorization-code exchange
  - of met `ConnectInput` voor `ibkr` + `authMode = "local_gateway"`
- `PATCH /broker/connections` met `action = refresh_auth`
- `DELETE /broker/connections?connectionId=...`

### `brokerAccountsRoute`

Bestand:

- [routes/accounts.ts](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/alpaca-live-ready/api/routes/accounts.ts)

Ondersteunt:

- `GET /broker/accounts?connectionId=...`

### `brokerOrdersRoute`

Bestand:

- [routes/orders.ts](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/alpaca-live-ready/api/routes/orders.ts)

Ondersteunt:

- `GET /broker/orders?connectionId=...`
- `POST /broker/orders` met `action = place | replace | cancel`

### `brokerMarketDataRoute`

Bestand:

- [routes/market-data.ts](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/alpaca-live-ready/api/routes/market-data.ts)

Ondersteunt:

- `GET /broker/market-data?connectionId=...&symbol=...`

### `brokerHealthRoute`

Bestand:

- [routes/health.ts](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/alpaca-live-ready/api/routes/health.ts)

Ondersteunt:

- `GET /broker/health?connectionId=...`

### `brokerEventsRoute`

Bestand:

- [routes/events.ts](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/alpaca-live-ready/api/routes/events.ts)

Ondersteunt:

- `GET /broker/events?connectionId=...&limit=50`

## Voorbeeld connect body

```ts
{
  userId: "user_123",
  broker: "alpaca",
  environment: "live",
  authMode: "api_keys",
  credentials: {
    keyId: "LIVE_KEY_ID",
    secretKey: "LIVE_SECRET_KEY"
  }
}
```

## Voorbeeld IBKR gateway connect body

```ts
{
  userId: "user_123",
  broker: "ibkr",
  environment: "paper",
  authMode: "local_gateway",
  metadata: {
    accountId: "U1234567",
    username: "ibkr-user",
    gatewayHost: "127.0.0.1",
    gatewayPort: 4002,
    clientPortalBaseUrl: "https://localhost:5000/v1/api",
    ibkr: {
      accountId: "U1234567",
      gatewayHost: "127.0.0.1",
      gatewayPort: 4002
    }
  }
}
```

## Voorbeeld OAuth exchange body

```ts
{
  userId: "user_123",
  broker: "alpaca",
  environment: "live",
  code: "authorization_code_from_callback",
  redirectUri: "https://yourapp.com/broker/callback/alpaca"
}
```

## Belangrijk

De meegeleverde store is nu:

- in-memory

Dus voor productie moet je nog vervangen of uitbreiden:

- encrypted secret storage
- auth refresh persistence
- echte database-backed account/order snapshot tables als je historische sync wilt

Maar de routevorm en adapterkoppeling staan dan al goed.

## Server wiring example

Als je snel wilt zien hoe dit in een echte backend hangt:

- [examples/express-server-example.ts](/Users/lukadezeeuw/Desktop/AXE-COMPANION-OS--main/broker-hub/alpaca-live-ready/api/examples/express-server-example.ts)
