import "server-only";

const INTERNAL_PUSH_HEADER = "x-internal-push-secret";

export function getInternalPushSecret(): string | null {
  return (
    process.env.PUSH_INTERNAL_SECRET?.trim() ||
    process.env.PUSH_WEBHOOK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null
  );
}

export function internalPushHeaders(): HeadersInit {
  const secret = getInternalPushSecret();
  return {
    "Content-Type": "application/json",
    ...(secret ? { [INTERNAL_PUSH_HEADER]: secret } : {}),
  };
}

export function verifyInternalPushRequest(headers: Headers): "ok" | "missing_secret" | "forbidden" {
  const secret = getInternalPushSecret();
  if (!secret) {
    return process.env.NODE_ENV === "production" ? "missing_secret" : "ok";
  }

  const headerSecret = headers.get(INTERNAL_PUSH_HEADER);
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return headerSecret === secret || bearer === secret ? "ok" : "forbidden";
}
