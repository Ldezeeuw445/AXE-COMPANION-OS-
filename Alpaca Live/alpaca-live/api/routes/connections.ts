import { badRequest, json, methodNotAllowed, withErrorBoundary, type ApiRequest } from "../http";
import { brokerHubService } from "../hub";
import type { BrokerOAuthExchangeInput, ConnectInput } from "../../types";

type BrokerConnectionsPatchBody = {
  action?: "refresh_auth";
  connectionId?: string;
};

type BrokerConnectionsPostBody = ConnectInput | BrokerOAuthExchangeInput;

function isOAuthExchangeBody(body: BrokerConnectionsPostBody): body is BrokerOAuthExchangeInput {
  return "code" in body;
}

export async function brokerConnectionsRoute(request: ApiRequest<BrokerConnectionsPostBody | BrokerConnectionsPatchBody>) {
  return withErrorBoundary(async () => {
    if (request.method === "GET") {
      const userId = request.query?.userId;
      if (!userId) return badRequest("Missing query.userId");
      const connections = await brokerHubService.listConnections(userId);
      return json(200, { connections });
    }

    if (request.method === "POST") {
      const body = request.body as BrokerConnectionsPostBody | undefined;
      if (!body) return badRequest("Missing request body");
      if (isOAuthExchangeBody(body)) {
        const connection = await brokerHubService.exchangeOAuthCode(body);
        return json(201, { connection });
      }
      const connection = await brokerHubService.connect(body);
      return json(201, { connection });
    }

    if (request.method === "DELETE") {
      const connectionId = request.query?.connectionId;
      if (!connectionId) return badRequest("Missing query.connectionId");
      await brokerHubService.disconnect(connectionId);
      return json(200, { ok: true });
    }

    if (request.method === "PATCH") {
      const body = request.body as BrokerConnectionsPatchBody | undefined;
      if (!body?.action) return badRequest("Missing body.action");
      if (body.action !== "refresh_auth") return badRequest("Unsupported body.action");
      if (!body.connectionId) return badRequest("Missing body.connectionId");
      const connection = await brokerHubService.refreshAuth(body.connectionId);
      return json(200, { ok: true, connection });
    }

    return methodNotAllowed(["GET", "POST", "PATCH", "DELETE"]);
  });
}
