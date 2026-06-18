export type SquawkStation = {
  id: string;
  name: string;
  tag: string;
  url: string;
  /** Fallback when primary stream fails */
  fallbackUrl?: string;
};

/**
 * Curated 24/7 business / news audio streams for trader squawk.
 * Streams are public internet radio — availability varies by region.
 */
export const SQUAWK_STATIONS: SquawkStation[] = [
  {
    id: "bbc-world",
    name: "BBC World Service",
    tag: "Global news",
    url: "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service",
  },
  {
    id: "npr-news",
    name: "NPR News",
    tag: "US markets",
    url: "https://npr-ice.streamguys1.com/live.mp3",
  },
  {
    id: "bloomberg-radio",
    name: "Bloomberg Radio",
    tag: "Markets",
    url: "https://17563.live.streamtheworld.com/WBBRAMAAC48.mp3",
    fallbackUrl: "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service",
  },
  {
    id: "cnbc-radio",
    name: "CNBC Radio",
    tag: "Business",
    url: "https://17563.live.streamtheworld.com/CNBCAAC48.mp3",
    fallbackUrl: "https://npr-ice.streamguys1.com/live.mp3",
  },
];
