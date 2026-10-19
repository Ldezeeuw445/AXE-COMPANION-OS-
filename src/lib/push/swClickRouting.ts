import { sanitizePushUrl, sessionPatchFromDeepLink, type PushSessionPatch } from "@/lib/push/deepLinks";

export const SW_PUSH_OPEN_MESSAGE = "AXE_PUSH_OPEN";

export type NotificationClickAction = "open" | "dismiss" | string;

export type NotificationClickInput = {
  action?: NotificationClickAction | null;
  dataUrl?: string | null;
  dataSession?: PushSessionPatch | null;
};

export type NotificationClickResult =
  | { kind: "close" }
  | { kind: "open"; url: string; session: PushSessionPatch; message: { type: typeof SW_PUSH_OPEN_MESSAGE; url: string; session: PushSessionPatch } };

export function resolveNotificationClick(input: NotificationClickInput): NotificationClickResult {
  if (input.action === "dismiss") {
    return { kind: "close" };
  }
  const url = sanitizePushUrl(input.dataUrl, "/chat");
  const session = {
    ...sessionPatchFromDeepLink(url),
    ...(input.dataSession ?? {}),
  };
  return {
    kind: "open",
    url,
    session,
    message: { type: SW_PUSH_OPEN_MESSAGE, url, session },
  };
}

export type FocusableClient = {
  url: string;
  focus?: () => unknown;
  navigate?: (url: string) => unknown;
  postMessage?: (data: unknown) => void;
};

export function pickSameOriginClient<T extends FocusableClient>(
  clients: readonly T[],
  origin: string,
): T | null {
  for (const client of clients) {
    if (typeof client.url === "string" && client.url.startsWith(origin)) {
      return client;
    }
  }
  return null;
}

export function applyClickToClient(
  client: FocusableClient,
  result: Extract<NotificationClickResult, { kind: "open" }>,
): "focused" {
  client.postMessage?.(result.message);
  if (typeof client.navigate === "function") {
    try {
      client.navigate(result.url);
    } catch {
      /* iOS may not implement navigate */
    }
  }
  client.focus?.();
  return "focused";
}
