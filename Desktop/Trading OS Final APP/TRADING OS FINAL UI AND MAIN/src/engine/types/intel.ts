export type JetSignal = 'normal' | 'anomaly' | 'meeting' | 'regulatory';

export interface JetPosition {
  icao24: string;
  company: string;
  ticker: string;
  aircraft: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  origin: string;
  destination: string;
  departureTime: string;
  eta: string;
  signal: JetSignal;
  route: string;
}

export type CorporateJetCategory = 'corporate' | 'likely_corporate' | 'unknown';

/** Enriched corporate jet row (intel-proxy Top 50 pipeline). */
export interface CorporateJet {
  id: string;
  icao24: string;
  callsign: string;
  tailNumber?: string;
  operator?: string;
  aircraftType?: string;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  heading: number;
  lastSeen: string;
  source: string;
  enrichmentSource: string | null;
  category: CorporateJetCategory;
  /** Derived (e.g. emergency squawk); defaults to `normal` when absent in cached payloads. */
  signal: JetSignal;
}

export interface CorporateJetsMetrics {
  liveAircraftCount: number;
  top50Count: number;
  enrichedOperatorCount: number;
  unknownOperatorCount: number;
  enrichmentProvider: string | null;
  lastEnrichmentError: string | null;
  positionSource: string;
}

export type VesselStatus = 'in_transit' | 'anchored' | 'loitering' | 'ais_gap';

export interface Vessel {
  mmsi: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  speed: number;
  destination: string;
  status: VesselStatus;
  eta: string;
  operatorTicker?: string;
}

export interface VesselAlert {
  id: string;
  message: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

