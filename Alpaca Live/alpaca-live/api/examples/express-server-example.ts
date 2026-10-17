/**
 * Minimal example showing how to mount the broker hub routes in Express.
 * This file is intentionally not imported anywhere in this repo.
 */

import express from "express";

import { brokerAccountsRoute } from "../routes/accounts";
import { brokerConnectionsRoute } from "../routes/connections";
import { brokerEventsRoute } from "../routes/events";
import { brokerHealthRoute } from "../routes/health";
import { brokerMarketDataRoute } from "../routes/market-data";
import { brokerOrdersRoute } from "../routes/orders";
import type { ApiRequest } from "../http";

function toApiRequest(req: express.Request): ApiRequest {
  return {
    method: req.method as ApiRequest["method"],
    query: req.query as Record<string, string | undefined>,
    params: req.params as Record<string, string | undefined>,
    headers: req.headers as Record<string, string | undefined>,
    body: req.body,
  };
}

async function sendRouteResponse(
  route: (request: ApiRequest) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>,
  req: express.Request,
  res: express.Response
) {
  const response = await route(toApiRequest(req));
  for (const [key, value] of Object.entries(response.headers || {})) {
    res.setHeader(key, value);
  }
  res.status(response.status).json(response.body);
}

const app = express();
app.use(express.json());

app.all("/broker/connections", (req, res) => void sendRouteResponse(brokerConnectionsRoute, req, res));
app.all("/broker/accounts", (req, res) => void sendRouteResponse(brokerAccountsRoute, req, res));
app.all("/broker/orders", (req, res) => void sendRouteResponse(brokerOrdersRoute, req, res));
app.all("/broker/market-data", (req, res) => void sendRouteResponse(brokerMarketDataRoute, req, res));
app.all("/broker/health", (req, res) => void sendRouteResponse(brokerHealthRoute, req, res));
app.all("/broker/events", (req, res) => void sendRouteResponse(brokerEventsRoute, req, res));

app.listen(8787, () => {
  console.log("Broker hub example listening on http://localhost:8787");
});
