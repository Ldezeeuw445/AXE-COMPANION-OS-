import { badRequest, json, methodNotAllowed, withErrorBoundary, type ApiRequest } from "../http";
import { brokerHubService } from "../hub";

export async function brokerEventsRoute(request: ApiRequest) {
  return withErrorBoundary(async () => {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);

    const connectionId = request.query?.connectionId;
    const limitRaw = request.query?.limit;
    if (!connectionId) return badRequest("Missing query.connectionId");

    const limit = limitRaw ? Number(limitRaw) : 50;
    const events = await brokerHubService.listEvents(connectionId, Number.isFinite(limit) ? limit : 50);
    return json(200, { events });
  });
}
