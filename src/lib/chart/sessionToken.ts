/**
 * Runtime-agnostic HS256 JWT for short-lived chart-session tokens.
 * Works in Node 20+ and Cloudflare Workers — both expose Web Crypto.
 *
 * The Cloudflare ChartLiveRoom Durable Object uses the same secret to verify.
 */

export type ChartSessionPayload = {
  userId: string;
  accountId: string;
  metaApiAccountId: string;
  /** MetaApi cloud region (london | new-york | singapore) for edge polling. */
  metaapiRegion?: string;
  displaySymbol: string;
  brokerSymbol: string;
  /** tf key (m5..d1) — same shape as URL `tf` param. */
  timeframe: string;
  /** Unix seconds. */
  exp: number;
  iat: number;
};

const HEADER_B64 = bytesToB64Url(textEncode('{"alg":"HS256","typ":"JWT"}'));

function textEncode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function textDecode(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function bytesToB64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // btoa is available in Node 18+ globals and CF Workers
  return btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function b64UrlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncode(secret) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signHs256(data: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, textEncode(data) as unknown as BufferSource);
  return bytesToB64Url(new Uint8Array(sig));
}

export async function signChartSessionToken(
  payload: Omit<ChartSessionPayload, "iat" | "exp"> & { ttlSeconds?: number },
  secret: string,
): Promise<{ token: string; expiresIn: number }> {
  const ttl = Math.max(30, Math.min(600, payload.ttlSeconds ?? 120));
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttl;
  const body: ChartSessionPayload = {
    userId: payload.userId,
    accountId: payload.accountId,
    metaApiAccountId: payload.metaApiAccountId,
    ...(payload.metaapiRegion ? { metaapiRegion: payload.metaapiRegion } : {}),
    displaySymbol: payload.displaySymbol,
    brokerSymbol: payload.brokerSymbol,
    timeframe: payload.timeframe,
    iat,
    exp,
  };
  const payloadB64 = bytesToB64Url(textEncode(JSON.stringify(body)));
  const signingInput = `${HEADER_B64}.${payloadB64}`;
  const signature = await signHs256(signingInput, secret);
  return { token: `${signingInput}.${signature}`, expiresIn: ttl };
}

export async function verifyChartSessionToken(
  token: string,
  secret: string,
): Promise<ChartSessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (headerB64 !== HEADER_B64) return null;

  const expected = await signHs256(`${headerB64}.${payloadB64}`, secret);
  if (expected.length !== sigB64.length) return null;

  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sigB64.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const payloadJson = textDecode(b64UrlToBytes(payloadB64));
    const payload = JSON.parse(payloadJson) as ChartSessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    if (
      typeof payload.userId !== "string" ||
      typeof payload.accountId !== "string" ||
      typeof payload.metaApiAccountId !== "string" ||
      typeof payload.brokerSymbol !== "string" ||
      typeof payload.timeframe !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
