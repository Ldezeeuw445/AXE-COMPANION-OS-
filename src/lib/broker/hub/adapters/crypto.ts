import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const KEY_ENV = "BROKER_HUB_ENCRYPTION_KEY";
const ALGO = "aes-256-gcm";

function getKeyMaterial(): Buffer {
  const raw = process.env[KEY_ENV]?.trim();
  if (!raw) {
    throw new Error(`${KEY_ENV} is missing. Set it before using live broker credential storage.`);
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptJson(payload: unknown): string {
  const iv = randomBytes(12);
  const key = getKeyMaterial();
  const cipher = createCipheriv(ALGO, key, iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptJson<T>(sealed: string): T {
  const [ivPart, tagPart, bodyPart] = sealed.split(".");
  if (!ivPart || !tagPart || !bodyPart) {
    throw new Error("Encrypted broker secret payload is malformed.");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const body = Buffer.from(bodyPart, "base64url");
  const key = getKeyMaterial();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted) as T;
}
