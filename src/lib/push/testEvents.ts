import { PUSH_CATEGORIES, type PushCategory } from "@/lib/push/categories";
import { buildPushPayload, type PushPayload } from "@/lib/push/payload";

export type TestPushEvent = {
  category: PushCategory;
  eventKey: string;
  title: string;
  body: string;
  symbol?: string;
  timeframe?: string;
  threadId?: string;
  payload: PushPayload;
};

export function buildTestPushEvents(now = new Date()): TestPushEvent[] {
  const stamp = now.toISOString();
  const specs: Array<Omit<TestPushEvent, "payload">> = [
    {
      category: "price_alert",
      eventKey: `test:price_alert:${stamp}`,
      title: "AXE · test · price alert",
      body: "EURUSD crossed 1.0850 — open the chart.",
      symbol: "EURUSD",
      timeframe: "m15",
    },
    {
      category: "risk_alert",
      eventKey: `test:risk_alert:${stamp}`,
      title: "AXE · test · risk alert",
      body: "Three tickets, one USD bet — review exposure.",
      symbol: "EURUSD",
      timeframe: "h1",
    },
    {
      category: "broker_disconnect",
      eventKey: `test:broker_disconnect:${stamp}`,
      title: "AXE · test · broker disconnect",
      body: "The last successful sync is stale — numbers on screen may be old.",
    },
    {
      category: "economic_event",
      eventKey: `test:economic_event:${stamp}`,
      title: "AXE · test · economic event",
      body: "High-impact USD print in 30 minutes.",
      symbol: "EURUSD",
      timeframe: "m15",
    },
    {
      category: "axe_finding",
      eventKey: `test:axe_finding:${stamp}`,
      title: "AXE · test · finding",
      body: "You hold losers longer than winners — open the thread.",
      threadId: "demo-thread",
    },
  ];

  return specs.map((spec) => ({
    ...spec,
    payload: buildPushPayload({
      category: spec.category,
      eventKey: spec.eventKey,
      title: spec.title,
      body: spec.body,
      symbol: spec.symbol,
      timeframe: spec.timeframe,
      threadId: spec.threadId,
    }),
  }));
}

export function assertAllTestCategories(events: TestPushEvent[]): void {
  const got = new Set(events.map((e) => e.category));
  for (const category of PUSH_CATEGORIES) {
    if (!got.has(category)) {
      throw new Error(`test suite missing category ${category}`);
    }
  }
}
