// ================================================================
// Public types for the AI Data Center Map module.
// Presentation is decoupled from data fetching through the
// DataCenterDataSource adapter — same pattern as the news and
// news-context modules.
// ================================================================

export type ProjectCategory =
  | 'stargate'
  | 'hyperscaler'
  | 'neocloud'
  | 'sovereign'
  | 'independent';

export type ProjectStatus =
  | 'operational'
  | 'under_construction'
  | 'announced'
  | 'planned';

export type RegionKey =
  | 'world'
  | 'n_america'
  | 'europe'
  | 'asia'
  | 'middle_east';

/** A single data center project rendered as a map marker + table row. */
export interface DataCenterProject {
  id: string;                      // stable unique id
  name: string;                    // e.g. "Stargate Abilene"
  company: string;                 // operator / sponsor (e.g. "xAI / Oracle")
  category: ProjectCategory;
  status: ProjectStatus;

  // Geo
  country: string;                 // ISO-3 code preferred (e.g. "USA", "DEU")
  countryName?: string;            // display name (e.g. "United States")
  region: RegionKey;               // region bucket for tabs
  city?: string;
  latitude: number;                // WGS84 decimal degrees, -90 ... 90
  longitude: number;               // WGS84 decimal degrees, -180 ... 180

  // Scale
  powerMw?: number | null;         // planned/operational capacity in MW
  investmentUsdM?: number | null;  // announced investment in millions USD
  expectedYear?: number | null;    // online year
  operator?: string | null;        // hosting operator if different from company

  // Meta
  sourceUrl?: string | null;       // optional link to announcement
  updatedAt?: string | null;       // ISO timestamp
}

/** Top-level payload the map consumes. */
export interface DataCenterSnapshot {
  projects: DataCenterProject[];
  fetchedAt: string;               // ISO timestamp of last successful fetch
}

/** Adapter contract — implement this and pass to <DataCenterMap />. */
export interface DataCenterDataSource {
  /**
   * Return the full snapshot. Must be idempotent; the hook handles
   * auto-refresh. Throw for real errors, return an empty list if the
   * source is reachable but has nothing yet.
   */
  fetchProjects(args: { signal?: AbortSignal }): Promise<DataCenterSnapshot>;
}

/** Optional selection state that the parent can control. */
export interface Selection {
  projectId: string | null;
}
