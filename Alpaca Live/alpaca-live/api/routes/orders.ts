import { badRequest, json, methodNotAllowed, withErrorBoundary, type ApiRequest } from "../http";
import { brokerHubService } from "../hub";
import type { PlaceOrderInput, ReplaceOrderInput } from "../../types";

type OrderMutationBody =
  | ({ action: "place" } & PlaceOrderInput)
  | ({ action: "replace" } & ReplaceOrderInput)
  | { action: "cancel"; connectionId: string; brokerOrderId: string };

export async function brokerOrdersRoute(request: ApiRequest<OrderMutationBody>) {
  return withErrorBoundary(async () => {
    if (request.method === "GET") {
      const connectionId = request.query?.connectionId;
      const status = request.query?.status;
      if (!connectionId) return badRequest("Missing query.connectionId");
      const orders = await brokerHubService.getOrders(connectionId, status || "all");
      return json(200, { orders });
    }

    if (request.method === "POST") {
      const body = request.body;
      if (!body) return badRequest("Missing request body");

      if (body.action === "place") {
        const order = await brokerHubService.placeOrder(body);
        return json(201, { order });
      }

      if (body.action === "replace") {
        const order = await brokerHubService.replaceOrder(body);
        return json(200, { order });
      }

      if (body.action === "cancel") {
        await brokerHubService.cancelOrder(body.connectionId, body.brokerOrderId);
        return json(200, { ok: true });
      }

      return badRequest("Unsupported order action");
    }

    return methodNotAllowed(["GET", "POST"]);
  });
}
