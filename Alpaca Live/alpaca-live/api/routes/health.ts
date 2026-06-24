import { badRequest, json, methodNotAllowed, withErrorBoundary, type ApiRequest } from "../http";
import { brokerHubService } from "../hub";

export async function brokerHealthRoute(request: ApiRequest) {
  return withErrorBoundary(async () => {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);

    const connectionId = request.query?.connectionId;
    if (!connectionId) return badRequest("Missing query.connectionId");

    const health = await brokerHubService.healthcheck(connectionId);
    return json(200, { health });
  });
}
