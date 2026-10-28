/**
 * C6 — the push half of recordProactiveFeedEvent, kept import-free so the
 * delivery test can load the real source.
 *
 * The push is awaited (bounded by a timeout) rather than fired with `void`:
 * on serverless runtimes work left running after the handler returns can be
 * frozen or dropped, so a detached fetch may never reach /api/push/send.
 */

export const FEED_PUSH_TIMEOUT_MS = 8_000;
const FEED_PUSH_BODY_MAX = 180;

export type FeedPushRequest = {
  userId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
};

export function resolveFeedPushBaseUrl(
  env: Record<string, string | undefined>,
): string | null {
  return (
    env.NEXT_PUBLIC_APP_URL ??
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null)
  );
}

export function buildFeedPushRequest(
  userId: string,
  title: string,
  body: string,
  url: string,
  now: number = Date.now(),
): FeedPushRequest {
  return {
    userId,
    title: `AXE · ${title}`,
    body:
      body.length > FEED_PUSH_BODY_MAX
        ? `${body.slice(0, FEED_PUSH_BODY_MAX - 3)}…`
        : body,
    url,
    tag: `feed-${now}`,
  };
}

/**
 * POST the request to /api/push/send and wait for the answer. Best-effort:
 * never throws, and returns whether the route accepted it.
 */
export async function deliverFeedPush(opts: {
  baseUrl: string | null;
  headers: HeadersInit;
  request: FeedPushRequest;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<boolean> {
  if (!opts.baseUrl) return false;
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${opts.baseUrl}/api/push/send`, {
      method: "POST",
      headers: opts.headers,
      body: JSON.stringify(opts.request),
      signal: AbortSignal.timeout(opts.timeoutMs ?? FEED_PUSH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
