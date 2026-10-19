import { PUSH_CATEGORY_SEVERITY, type PushCategory } from "@/lib/push/categories";
import { buildPushDeepLink, type PushDeepLinkInput, type PushSessionPatch } from "@/lib/push/deepLinks";

export type PushAction = { action: string; title: string; icon?: string };

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  severity: "info" | "alert" | "risk";
  requireInteraction: boolean;
  silent: boolean;
  category: PushCategory;
  eventKey: string;
  actions: PushAction[];
  data: {
    url: string;
    category: PushCategory;
    eventKey: string;
    severity: "info" | "alert" | "risk";
    session: PushSessionPatch;
  };
};

export type BuildPushPayloadInput = PushDeepLinkInput & {
  title: string;
  body?: string | null;
  eventKey: string;
  tag?: string | null;
  silent?: boolean;
  requireInteraction?: boolean;
  actions?: PushAction[];
};

function clipBody(body: string, max = 180): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildPushPayload(input: BuildPushPayloadInput): PushPayload {
  const { url, session } = buildPushDeepLink(input);
  const severity = PUSH_CATEGORY_SEVERITY[input.category];
  const requireInteraction = input.requireInteraction ?? severity === "risk";
  const tag = (input.tag?.trim() || `${input.category}:${input.eventKey}`).slice(0, 120);
  const actions =
    input.actions ??
    (severity === "risk"
      ? [
          { action: "open", title: "Open" },
          { action: "dismiss", title: "Dismiss" },
        ]
      : [{ action: "open", title: "Open" }]);

  return {
    title: input.title.trim() || "AXE",
    body: clipBody(input.body ?? ""),
    url,
    tag,
    severity,
    requireInteraction,
    silent: input.silent === true,
    category: input.category,
    eventKey: input.eventKey,
    actions,
    data: {
      url,
      category: input.category,
      eventKey: input.eventKey,
      severity,
      session,
    },
  };
}

export function serializePushPayload(payload: PushPayload): string {
  return JSON.stringify(payload);
}
