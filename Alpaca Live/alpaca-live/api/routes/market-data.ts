import { badRequest, json, methodNotAllowed, withErrorBoundary, type ApiRequest } from "../http";
import { brokerHubService } from "../hub";

export async function brokerMarketDataRoute(request: ApiRequest) {
  return withErrorBoundary(async () => {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);

    const connectionId = request.query?.connectionId;
    const symbol = request.query?.symbol;
    if (!connectionId) return badRequest("Missing query.connectionId");
    if (!symbol) return badRequest("Missing query.symbol");

    const quote = await brokerHubService.getQuote(connectionId, symbol);
    return json(200, { quote });
  });
}
