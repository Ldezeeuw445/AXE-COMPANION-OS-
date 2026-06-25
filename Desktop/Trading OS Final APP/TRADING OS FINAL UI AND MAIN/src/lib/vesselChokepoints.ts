/**
 * Strategic maritime chokepoints — shown on the vessel map when the feed is live.
 * Coordinates are approximate centre points for map markers.
 */
export interface VesselChokepoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  /** Short context for popup (commodity / flow) */
  note: string;
}

export const VESSEL_CHOKEPOINTS: VesselChokepoint[] = [
  {
    id: 'hormuz',
    name: 'Strait of Hormuz',
    lat: 26.55,
    lon: 56.55,
    region: 'Middle East',
    note: 'Oil · ~21% seaborne crude transits',
  },
  {
    id: 'malacca',
    name: 'Strait of Malacca',
    lat: 2.85,
    lon: 101.25,
    region: 'Asia-Pacific',
    note: 'Energy & container funnel · piracy/climate risk',
  },
  {
    id: 'suez',
    name: 'Suez Canal',
    lat: 30.05,
    lon: 32.55,
    region: 'MENA / Europe',
    note: 'Asia–Europe shortcut · congestion & grounding risk',
  },
  {
    id: 'bab',
    name: 'Bab el-Mandeb',
    lat: 12.58,
    lon: 43.35,
    region: 'Red Sea',
    note: 'Red Sea · Suez / Gulf access',
  },
  {
    id: 'panama',
    name: 'Panama Canal',
    lat: 9.08,
    lon: -79.72,
    region: 'Americas',
    note: 'Pacific–Atlantic · draft & locks',
  },
  {
    id: 'bosphorus',
    name: 'Turkish Straits',
    lat: 41.12,
    lon: 29.08,
    region: 'Black Sea',
    note: 'Black Sea ↔ Mediterranean',
  },
  {
    id: 'danish',
    name: 'Danish Straits',
    lat: 56.05,
    lon: 11.0,
    region: 'Baltic',
    note: 'Baltic ↔ North Sea',
  },
  {
    id: 'dover',
    name: 'English Channel',
    lat: 50.9,
    lon: 1.45,
    region: 'Europe',
    note: 'UK–EU short sea · high density traffic',
  },
];
