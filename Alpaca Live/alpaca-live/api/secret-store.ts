import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import type { BrokerSecretStore } from "../broker-contract";

const DATA_DIR = path.resolve(process.cwd(), "broker-hub/alpaca-live-ready/data/secrets");
const ALGO = "aes-256-gcm";

type EncryptedPayload = {
  iv: string;
  authTag: string;
  ciphertext: string;
};

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function getEncryptionKey() {
  const raw = process.env.BROKER_HUB_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing BROKER_HUB_ENCRYPTION_KEY. Set it before storing broker credentials.");
  }
  return createHash("sha256").update(raw).digest();
}

function encryptObject(input: Record<string, unknown>): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(input), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

function decryptObject<T extends Record<string, unknown>>(payload: EncryptedPayload): T {
  const decipher = createDecipheriv(ALGO, getEncryptionKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

export class FileBrokerSecretStore implements BrokerSecretStore {
  private filePath(connectionId: string) {
    return path.join(DATA_DIR, `${connectionId}.json`);
  }

  async saveCredentials(connectionId: string, credentials: Record<string, unknown>) {
    await ensureDataDir();
    const payload = encryptObject(credentials);
    await writeFile(this.filePath(connectionId), JSON.stringify(payload, null, 2), "utf8");
  }

  async getCredentials<T extends Record<string, unknown>>(connectionId: string): Promise<T | null> {
    try {
      const raw = await readFile(this.filePath(connectionId), "utf8");
      return decryptObject<T>(JSON.parse(raw) as EncryptedPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("ENOENT")) return null;
      throw error;
    }
  }

  async deleteCredentials(connectionId: string) {
    await rm(this.filePath(connectionId), { force: true });
  }
}

export const brokerSecretStore = new FileBrokerSecretStore();
