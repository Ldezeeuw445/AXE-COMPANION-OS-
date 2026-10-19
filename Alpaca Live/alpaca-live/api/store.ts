import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrokerConnectionStore } from "../broker-contract";
import type { BrokerConnection } from "../types";

const DATA_DIR = path.resolve(process.cwd(), "broker-hub/alpaca-live-ready/data");
const CONNECTIONS_FILE = path.join(DATA_DIR, "broker-connections.json");

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("ENOENT")) return fallback;
    throw error;
  }
}

async function writeJsonFile<T>(filePath: string, data: T) {
  await ensureDataDir();
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export class InMemoryBrokerConnectionStore implements BrokerConnectionStore {
  private readonly connections = new Map<string, BrokerConnection>();

  async saveConnection(connection: BrokerConnection) {
    this.connections.set(connection.id, connection);
  }

  async getConnection(connectionId: string) {
    return this.connections.get(connectionId) || null;
  }

  async listUserConnections(userId: string) {
    return Array.from(this.connections.values()).filter((item) => item.userId === userId);
  }

  async updateConnectionStatus(connectionId: string, status: BrokerConnection["status"]) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.set(connectionId, {
      ...connection,
      status,
      updatedAt: new Date().toISOString(),
    });
  }
}

export class FileBrokerConnectionStore implements BrokerConnectionStore {
  private readonly cache = new Map<string, BrokerConnection>();
  private loaded = false;

  private async load() {
    if (this.loaded) return;
    const items = await readJsonFile<BrokerConnection[]>(CONNECTIONS_FILE, []);
    this.cache.clear();
    for (const item of items) this.cache.set(item.id, item);
    this.loaded = true;
  }

  private async persist() {
    await writeJsonFile(CONNECTIONS_FILE, Array.from(this.cache.values()));
  }

  async saveConnection(connection: BrokerConnection) {
    await this.load();
    this.cache.set(connection.id, connection);
    await this.persist();
  }

  async getConnection(connectionId: string) {
    await this.load();
    return this.cache.get(connectionId) || null;
  }

  async listUserConnections(userId: string) {
    await this.load();
    return Array.from(this.cache.values()).filter((item) => item.userId === userId);
  }

  async updateConnectionStatus(connectionId: string, status: BrokerConnection["status"]) {
    await this.load();
    const connection = this.cache.get(connectionId);
    if (!connection) return;
    this.cache.set(connectionId, {
      ...connection,
      status,
      updatedAt: new Date().toISOString(),
    });
    await this.persist();
  }
}

export const brokerConnectionStore = new FileBrokerConnectionStore();
