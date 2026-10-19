import { badRequest, json, methodNotAllowed, withErrorBoundary, type ApiRequest } from "../http";
import { brokerHubService } from "../hub";

export async function brokerAccountsRoute(request: ApiRequest) {
  return withErrorBoundary(async () => {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);

    const connectionId = request.query?.connectionId;
    if (!connectionId) return badRequest("Missing query.connectionId");

    const accounts = await brokerHubService.getAccounts(connectionId);
    const positions = await brokerHubService.getPositions(connectionId);
    return json(200, { accounts, positions });
  });
}
