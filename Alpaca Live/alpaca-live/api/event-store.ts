import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BrokerEventStore } from "../broker-contract";
import type { BrokerEvent } from "../types";

const DATA_DIR = path.resolve(process.cwd(), "broker-hub/alpaca-live-ready/data");
const EVENTS_FILE = path.join(DATA_DIR, "broker-events.json");
const MAX_EVENTS_PER_CONNECTION = 200;

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

export class FileBrokerEventStore implements BrokerEventStore {
  private readonly cache = new Map<string, BrokerEvent[]>();
  private loaded = false;

  private async load() {
    if (this.loaded) return;
    const items = await readJsonFile<Record<string, BrokerEvent[]>>(EVENTS_FILE, {});
    this.cache.clear();
    for (const [connectionId, events] of Object.entries(items)) {
      this.cache.set(connectionId, events);
    }
    this.loaded = true;
  }

  private async persist() {
    const data = Object.fromEntries(this.cache.entries());
    await writeJsonFile(EVENTS_FILE, data);
  }

  async append(event: BrokerEvent) {
    await this.load();
    const current = this.cache.get(event.connectionId) || [];
    const next = [...current, event].slice(-MAX_EVENTS_PER_CONNECTION);
    this.cache.set(event.connectionId, next);
    await this.persist();
  }

  async listByConnection(connectionId: string, limit = 50) {
    await this.load();
    const items = this.cache.get(connectionId) || [];
    return items.slice(-limit);
  }
}

export const brokerEventStore = new FileBrokerEventStore();
