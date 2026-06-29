import "server-only";

import { SQUAWK_STATIONS } from "@/lib/squawk/streams";

const CACHE = new Map<string, { url: string; expires: number }>();
const CACHE_MS = 45 * 60 * 1000;

function fromCache(key: string): string | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    CACHE.delete(key);
    return null;
  }
  return hit.url;
}

function toCache(key: string, url: string) {
  CACHE.set(key, { url, expires: Date.now() + CACHE_MS });
}

async function resolvePodcastFeed(feedUrl: string): Promise<string | null> {
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": "AXE-Companion/1.0" },
    next: { revalidate: 1800 },
  });
  if (!res.ok) return null;
  const xml = await res.text();
  const match = xml.match(/<enclosure[^>]+url="([^"]+)"/i);
  return match?.[1] ?? null;
}

async function resolveStreamTheWorldMount(mount: string): Promise<string | null> {
  const res = await fetch(
    `https://playerservices.streamtheworld.com/api/livestream?version=1.5&mount=${encodeURIComponent(mount)}&lang=EN&transports=http`,
    { cache: "no-store", headers: { "User-Agent": "AXE-Companion/1.0" } },
  );
  if (!res.ok) return null;
  const xml = await res.text();
  if (xml.includes("<status-code>404</status-code>")) return null;

  const host = xml.match(/<ip>([^<]+)<\/ip>/)?.[1];
  const mountName = xml.match(/<mount>([^<]+)<\/mount>\s*<\/mountpoint>/)?.[1];
  const port = xml.match(/<port type="http">(\d+)<\/port>/)?.[1] ?? "80";
  if (!host || !mountName) return null;
  return `http://${host}:${port}/${mountName}`;
}

async function resolveAmperwave(directUrl: string): Promise<string | null> {
  const res = await fetch(directUrl, {
    redirect: "manual",
    headers: { "User-Agent": "AXE-Companion/1.0" },
  });
  const location = res.headers.get("location");
  if (location?.startsWith("http")) return location;
  if (res.ok && directUrl.startsWith("http")) return directUrl;
  return null;
}

/** Resolve playable URL for a squawk station (live, podcast latest, or dynamic mount). */
export async function resolveSquawkStreamUrl(stationId: string): Promise<string | null> {
  const cached = fromCache(stationId);
  if (cached) return cached;

  const station = SQUAWK_STATIONS.find((s) => s.id === stationId);
  if (!station) return null;

  let url: string | null = null;

  if (station.feedUrl) {
    url = await resolvePodcastFeed(station.feedUrl);
  } else if (station.mount) {
    url = await resolveStreamTheWorldMount(station.mount);
  } else if (station.amperwaveUrl) {
    url = await resolveAmperwave(station.amperwaveUrl);
  } else {
    url = station.url;
  }

  if (!url && station.fallbackUrl) url = station.fallbackUrl;
  if (url) toCache(stationId, url);
  return url;
}
