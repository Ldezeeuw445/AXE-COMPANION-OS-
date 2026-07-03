export type SquawkTier = "core" | "session" | "context";

export type SquawkStation = {
  id: string;
  name: string;
  tag: string;
  tier: SquawkTier;
  /** Static stream URL (used when no dynamic resolver is set). */
  url: string;
  /** Fallback when primary stream fails. */
  fallbackUrl?: string;
  /** Latest-episode podcast RSS feed. */
  feedUrl?: string;
  /** StreamTheWorld mount — resolved server-side before play. */
  mount?: string;
  /** Amperwave direct URL — follows redirect server-side. */
  amperwaveUrl?: string;
};

/**
 * Curated trader squawk rotation (10 channels).
 * Streams are public internet radio / podcast feeds — availability varies by region.
 *
 * Rotation tiers:
 * - core: always-on (Bloomberg, Reuters, CNBC Live, BBC)
 * - session: US/EU cash hours (Schwab, CNBC Radio, Fox Business)
 * - context: lighter / macro (NPR, Sky, FT briefing)
 */
export const SQUAWK_STATIONS: SquawkStation[] = [
  {
    id: "bbc-world",
    name: "BBC World Service",
    tag: "Global news",
    tier: "core",
    url: "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service",
    fallbackUrl: "https://npr-ice.streamguys1.com/live.mp3",
  },
  {
    id: "npr-news",
    name: "NPR News",
    tag: "US news",
    tier: "context",
    url: "https://npr-ice.streamguys1.com/live.mp3",
  },
  {
    id: "bloomberg-radio",
    name: "Bloomberg Radio",
    tag: "Markets",
    tier: "core",
    url: "https://17563.live.streamtheworld.com/WBBRAMAAC48.mp3",
    mount: "WBBRAMAAC48",
    fallbackUrl: "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service",
  },
  {
    id: "cnbc-radio",
    name: "CNBC Radio",
    tag: "Business",
    tier: "session",
    url: "https://17563.live.streamtheworld.com/CNBCAAC48.mp3",
    fallbackUrl: "https://npr-ice.streamguys1.com/live.mp3",
  },
  {
    id: "reuters-world",
    name: "Reuters World News",
    tag: "Breaking news",
    tier: "core",
    url: "https://npr-ice.streamguys1.com/live.mp3",
    feedUrl: "https://feeds.megaphone.fm/reutersworldnews",
  },
  {
    id: "cnbc-live",
    name: "CNBC Live",
    tag: "US market open",
    tier: "core",
    url: "https://17563.live.streamtheworld.com/CNBCAAC48.mp3",
    fallbackUrl: "https://17563.live.streamtheworld.com/WBBRAMAAC48.mp3",
  },
  {
    id: "fox-business",
    name: "Fox Business",
    tag: "Business TV",
    tier: "session",
    url: "https://live.amperwave.net/direct/foxnewsradio-foxnewsradioaac-imc",
    amperwaveUrl: "https://live.amperwave.net/direct/foxnewsradio-foxnewsradioaac-imc",
    fallbackUrl: "https://npr-ice.streamguys1.com/live.mp3",
  },
  {
    id: "schwab-network",
    name: "Schwab Network",
    tag: "Active trading",
    tier: "session",
    url: "https://17563.live.streamtheworld.com/WBBRAMAAC48.mp3",
    feedUrl: "https://anchor.fm/s/f589d064/podcast/rss",
  },
  {
    id: "sky-news",
    name: "Sky News",
    tag: "Europe breaking",
    tier: "context",
    url: "https://video.news.sky.com/snr/news/snrnews.mp3",
    fallbackUrl: "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service",
  },
  {
    id: "ft-briefing",
    name: "FT News Briefing",
    tag: "Macro briefing",
    tier: "context",
    url: "https://npr-ice.streamguys1.com/live.mp3",
    feedUrl: "https://feeds.acast.com/public/shows/73fe3ede-5c5c-4850-96a8-30db8dbae8bf",
  },
];

/** Recommended default enabled set (user's top 6 + existing 4 overlap). */
export const SQUAWK_DEFAULT_ENABLED_IDS = [
  "bloomberg-radio",
  "reuters-world",
  "cnbc-live",
  "bbc-world",
  "schwab-network",
  "sky-news",
  "cnbc-radio",
  "npr-news",
  "fox-business",
  "ft-briefing",
] as const;
