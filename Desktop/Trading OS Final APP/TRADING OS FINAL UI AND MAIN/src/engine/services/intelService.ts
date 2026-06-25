import { CacheEngine } from '../core/cache';
import { InflightDeduper } from '../core/dedupe';
import { Normalizer } from '../core/normalize';
import { SourceRouter } from '../core/router';
import { ProviderHealthTracker } from '../core/health';
import { DEFAULT_POLICIES } from '../core/policies';
import type { SourcePolicy } from '../core/policies';
import { withRetry } from '../core/retry';
import { costUnits } from '../core/cost';
import type { JetPosition, Vessel, VesselAlert } from '../types/intel';
import { OpenSkyProvider } from '../providers/opensky';
import { AISStreamProvider } from '../providers/aisstream';

export interface JetProviderConfig {
  id: string;
  provider: OpenSkyProvider;
  weight: number;
  monthlyLimit: number;
  dailyLimit: number;
  avgLatencyMs: number;
  dataQuality: number;
  costPerCall?: number;
}

export interface VesselProviderConfig {
  id: string;
  provider: AISStreamProvider;
  weight: number;
  monthlyLimit: number;
  dailyLimit: number;
  avgLatencyMs: number;
  dataQuality: number;
  costPerCall?: number;
}

export class IntelService {
  private cache: CacheEngine;
  private deduper: InflightDeduper;
  private router: SourceRouter;
  private health: ProviderHealthTracker;
  private policy: SourcePolicy;
  private jetProviders: Map<string, JetProviderConfig>;
  private vesselProviders: Map<string, VesselProviderConfig>;

  constructor(
    cache: CacheEngine,
    deduper: InflightDeduper,
    router: SourceRouter,
    health: ProviderHealthTracker,
    jets: JetProviderConfig[],
    vessels: VesselProviderConfig[],
  ) {
    this.cache = cache;
    this.deduper = deduper;
    this.router = router;
    this.health = health;
    this.policy = DEFAULT_POLICIES.scanner; // fast + fallback
    this.jetProviders = new Map(jets.map((c) => [c.id, c]));
    this.vesselProviders = new Map(vessels.map((c) => [c.id, c]));

    for (const config of jets) {
      router.register({
        id: config.id,
        provider: config.id.split('_')[0],
        weight: config.weight,
        monthlyLimit: config.monthlyLimit,
        dailyLimit: config.dailyLimit,
        usedThisMonth: 0,
        usedToday: 0,
        avgLatencyMs: config.avgLatencyMs,
        dataQuality: config.dataQuality,
        costPerCall: config.costPerCall ?? 1,
      });
    }
    for (const config of vessels) {
      router.register({
        id: config.id,
        provider: config.id.split('_')[0],
        weight: config.weight,
        monthlyLimit: config.monthlyLimit,
        dailyLimit: config.dailyLimit,
        usedThisMonth: 0,
        usedToday: 0,
        avgLatencyMs: config.avgLatencyMs,
        dataQuality: config.dataQuality,
        costPerCall: config.costPerCall ?? 1,
      });
    }
  }

  async getCorporateJets(): Promise<JetPosition[]> {
    const cacheKey = Normalizer.cacheKey('intel_jets', {});
    const result = await this.cache.getOrFetch(
      cacheKey,
      60_000,
      true,
      () => this.deduper.dedupe(cacheKey, () => this.fetchJets()),
    );
    return (result.data as JetPosition[]) ?? [];
  }

  async getVesselStream(): Promise<{ vessels: Vessel[]; alerts: VesselAlert[] }> {
    const cacheKey = Normalizer.cacheKey('intel_vessels', {});
    const result = await this.cache.getOrFetch(
      cacheKey,
      60_000,
      true,
      () => this.deduper.dedupe(cacheKey, () => this.fetchVessels()),
    );
    return (result.data as { vessels: Vessel[]; alerts: VesselAlert[] }) ?? { vessels: [], alerts: [] };
  }

  private selectChain<T>(m: Map<string, T>): { chain: string[]; primaryId: string } {
    const ids = Array.from(m.keys());
    const primaryId = this.router.select(ids, this.policy.priority);
    if (!primaryId) throw new Error('No healthy intel provider available');
    const chain = this.router.buildFallbackChain(primaryId, ids, this.policy.fallback);
    return { chain, primaryId };
  }

  private async fetchJets(): Promise<JetPosition[]> {
    const { chain, primaryId } = this.selectChain(this.jetProviders);
    let lastError: Error | null = null;

    for (const id of chain) {
      const config = this.jetProviders.get(id);
      if (!config) continue;
      try {
        if (id !== primaryId) this.router.recordFallbackUsed('intel_jets');
        const { value: states } = await withRetry(
          async () => {
            this.router.recordUsage(id, costUnits({ domain: 'intel', provider: id.split('_')[0], endpoint: 'fetchStatesAll' as any }));
            return await config.provider.fetchStatesAll();
          },
          { maxAttempts: 2, baseDelayMs: 200, maxDelayMs: 1200 },
        );
        this.health.recordSuccess(id);
        return this.mapOpenSky(states);
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    throw lastError || new Error('All jet providers failed');
  }

  private mapOpenSky(states: any[]): JetPosition[] {
    const now = new Date().toISOString();
    const out: JetPosition[] = [];
    for (const s of (states ?? []).slice(0, 20)) {
      const icao24 = String(s?.[0] ?? '').trim();
      const callsign = String(s?.[1] ?? '').trim() || 'UNKNOWN';
      const country = String(s?.[2] ?? '').trim() || 'Unknown';
      const lon = Number(s?.[5]);
      const lat = Number(s?.[6]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const altitudeM = Number(s?.[7]);
      const speedMs = Number(s?.[9]);
      out.push({
        icao24: icao24 || `icao_${Math.random().toString(16).slice(2)}`,
        company: country,
        ticker: '—',
        aircraft: callsign,
        lat,
        lon,
        altitude: Number.isFinite(altitudeM) ? Math.round(altitudeM * 3.28084) : 0,
        speed: Number.isFinite(speedMs) ? Math.round(speedMs * 1.94384) : 0,
        origin: '—',
        destination: '—',
        departureTime: now,
        eta: '—',
        signal: 'normal',
        route: '—',
      });
    }
    return out;
  }

  private async fetchVessels(): Promise<{ vessels: Vessel[]; alerts: VesselAlert[] }> {
    const { chain, primaryId } = this.selectChain(this.vesselProviders);
    let lastError: Error | null = null;

    for (const id of chain) {
      const config = this.vesselProviders.get(id);
      if (!config) continue;
      try {
        if (id !== primaryId) this.router.recordFallbackUsed('intel_vessels');
        const { value: events } = await withRetry(
          async () => {
            this.router.recordUsage(id, costUnits({ domain: 'intel', provider: id.split('_')[0], endpoint: 'fetchSnapshot' as any }));
            return await config.provider.fetchSnapshot();
          },
          { maxAttempts: 2, baseDelayMs: 200, maxDelayMs: 1200 },
        );
        this.health.recordSuccess(id);
        return this.mapAis(events);
      } catch (e) {
        lastError = e as Error;
        this.health.recordFailure(id, e);
      }
    }

    throw lastError || new Error('All vessel providers failed');
  }

  private mapAis(events: any[]): { vessels: Vessel[]; alerts: VesselAlert[] } {
    const byMmsi = new Map<string, any>();

    for (const e of events ?? []) {
      const meta = e?.Metadata ?? {};
      const msgType = String(e?.MessageType ?? '');
      const mmsi = String(meta?.MMSI ?? meta?.UserID ?? meta?.ShipMMSI ?? '');
      if (!mmsi) continue;

      const lat = Number(meta?.Latitude);
      const lon = Number(meta?.Longitude);
      const speed = Number(meta?.Sog ?? meta?.Speed ?? 0);
      const name =
        String(meta?.ShipName ?? '') ||
        String(e?.Message?.ShipStaticData?.ShipName ?? '') ||
        `Vessel ${mmsi}`;
      const type =
        String(meta?.ShipType ?? '') ||
        String(e?.Message?.ShipStaticData?.ShipType ?? '') ||
        'Vessel';
      const destination = String(meta?.Destination ?? e?.Message?.ShipStaticData?.Destination ?? '—') || '—';
      const eta = String(meta?.Eta ?? e?.Message?.ShipStaticData?.Eta ?? '—') || '—';

      const prev = byMmsi.get(mmsi) ?? {
        mmsi,
        name,
        type,
        lat: Number.isFinite(lat) ? lat : 0,
        lon: Number.isFinite(lon) ? lon : 0,
        speed: Number.isFinite(speed) ? speed : 0,
        destination,
        status: 'in_transit',
        eta,
      };

      if (Number.isFinite(lat)) prev.lat = lat;
      if (Number.isFinite(lon)) prev.lon = lon;
      if (Number.isFinite(speed)) prev.speed = speed;
      if (name) prev.name = name;
      if (type) prev.type = type;
      if (destination) prev.destination = destination;
      if (eta) prev.eta = eta;

      if (prev.speed <= 0.2) prev.status = 'anchored';
      else if (prev.speed <= 1.0) prev.status = 'loitering';
      else prev.status = 'in_transit';

      prev.__sawPosition = prev.__sawPosition || msgType === 'PositionReport';
      byMmsi.set(mmsi, prev);
    }

    const vessels: Vessel[] = Array.from(byMmsi.values())
      .map((v) => {
        if (!v.__sawPosition) v.status = 'ais_gap';
        delete v.__sawPosition;
        return v;
      })
      .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lon))
      .slice(0, 30);

    const alerts: VesselAlert[] = [];
    const loitering = vessels.filter((v) => v.status === 'loitering').length;
    const gaps = vessels.filter((v) => v.status === 'ais_gap').length;
    if (loitering > 8) {
      alerts.push({ id: 'loitering', message: `${loitering} vessels loitering in chokepoints`, category: 'GLOBAL TRADE', severity: 'high', timestamp: 'live' });
    }
    if (gaps > 4) {
      alerts.push({ id: 'ais_gap', message: `${gaps} vessels with AIS gaps`, category: 'GLOBAL TRADE', severity: 'medium', timestamp: 'live' });
    }

    return { vessels, alerts };
  }
}

