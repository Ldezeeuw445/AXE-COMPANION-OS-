import "server-only";
import { timingSafeEqual } from "node:crypto";

/** True when the request carries `Authorization: Bearer <CRON_SECRET>`. */
export function hasCronSecret(headers: Headers): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const a = Buffer.from(bearer);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
