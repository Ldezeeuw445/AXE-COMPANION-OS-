/**
 * Maps `engineAdapter.aiDataCenters()` into the DataCenterMap module contract.
 * Data remains PLACEHOLDER until a real Supabase table is wired in the engine.
 */
import type { DataCenterDataSource, DataCenterProject, DataCenterSnapshot, ProjectCategory, RegionKey } from '@/features/datacenter-map/types';
import { aiDataCenters, type DataCenter } from './engineAdapterLegacy';

function inferCategory(operator: string): ProjectCategory {
  const o = operator.toLowerCase();
  if (o.includes('oracle') || o.includes('stargate')) return 'stargate';
  if (o.includes('microsoft') || o.includes('google') || o.includes('meta') || o.includes('amazon')) return 'hyperscaler';
  if (o.includes('coreweave') || o.includes('neocloud')) return 'neocloud';
  if (o.includes('sovereign') || o.includes('government')) return 'sovereign';
  if (o.includes('crusoe') || o.includes('independent')) return 'independent';
  return 'independent';
}

function regionFromCountry(country: string): RegionKey {
  const c = country.toUpperCase();
  if (['USA', 'CAN', 'MEX'].includes(c)) return 'n_america';
  if (['GBR', 'DEU', 'FRA', 'NLD', 'SWE', 'DNK'].includes(c)) return 'europe';
  if (['CHN', 'JPN', 'KOR', 'SGP', 'IND', 'THA'].includes(c)) return 'asia';
  if (['ARE', 'SAU', 'ISR', 'KWT'].includes(c)) return 'middle_east';
  return 'world';
}

function mapRow(dc: DataCenter): DataCenterProject {
  const country = dc.country.length === 3 ? dc.country.toUpperCase() : 'USA';
  return {
    id: dc.id,
    name: dc.name,
    company: dc.operator,
    category: inferCategory(dc.operator),
    status: dc.status,
    country,
    countryName: dc.country,
    region: regionFromCountry(country),
    city: dc.city,
    latitude: dc.lat,
    longitude: dc.lon,
    powerMw: dc.capacityMW,
    investmentUsdM: null,
    expectedYear: dc.yearOnline ? Number(String(dc.yearOnline).replace(/\D/g, '').slice(0, 4)) || null : null,
    operator: dc.operator,
    updatedAt: new Date().toISOString(),
  };
}

export function createEngineAiDataCenterDataSource(): DataCenterDataSource {
  return {
    async fetchProjects({ signal: _signal }): Promise<DataCenterSnapshot> {
      const rows = await aiDataCenters();
      return {
        projects: rows.map(mapRow),
        fetchedAt: new Date().toISOString(),
      };
    },
  };
}
