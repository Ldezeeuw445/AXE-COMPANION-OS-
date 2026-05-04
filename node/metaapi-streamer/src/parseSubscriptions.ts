import type { Subscription } from "./types.js";

const ALLOWED_TF = new Set(["m5", "m15", "m30", "h1", "h4", "d1"]);

export function parseSubscriptions(raw: string | undefined): Subscription[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split("|").map((s) => s.trim());
      if (parts.length !== 6) {
        console.warn(`[streamer] skipping malformed subscription: ${line}`);
        return [];
      }
      const [userId, accountId, metaApiAccountId, displaySymbol, brokerSymbol, timeframe] = parts;
      const tf = timeframe.toLowerCase();
      if (!ALLOWED_TF.has(tf)) {
        console.warn(`[streamer] skipping unsupported timeframe ${timeframe} on ${displaySymbol}`);
        return [];
      }
      const sub: Subscription = {
        userId,
        accountId,
        metaApiAccountId,
        displaySymbol: displaySymbol.toUpperCase(),
        brokerSymbol,
        timeframe: tf,
      };
      return [sub];
    });
}
