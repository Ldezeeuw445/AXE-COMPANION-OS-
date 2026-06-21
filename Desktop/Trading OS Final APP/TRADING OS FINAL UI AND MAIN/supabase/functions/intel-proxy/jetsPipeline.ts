/**
 * Corporate jets: OpenSky → normalize → optional ADS-B enrichment → classify → rank → Top 50.
 * Deno Edge — no Node APIs.
 */

export type JetCategory = 'corporate' | 'likely_corporate' | 'unknown'

export type JetSignal = 'normal' | 'anomaly' | 'meeting' | 'regulatory'

export interface CorporateJet {
  id: string
  icao24: string
  callsign: string
  tailNumber?: string
  operator?: string
  aircraftType?: string
  latitude: number
  longitude: number
  altitude: number
  speed: number
  heading: number
  lastSeen: string
  source: string
  enrichmentSource: string | null
  category: JetCategory
}

export interface CorporateJetsMetrics {
  liveAircraftCount: number
  top50Count: number
  enrichedOperatorCount: number
  unknownOperatorCount: number
  enrichmentProvider: string | null
  lastEnrichmentError: string | null
  positionSource: string
}

/** ICAO aircraft type designators commonly used by business jets (partial list, conservative). */
const BIZJET_TYPES = new Set(
  [
    'C25A',
    'C25B',
    'C25C',
    'C56X',
    'C680',
    'C682',
    'C700',
    'C750',
    'CL30',
    'CL35',
    'CL60',
    'E135',
    'E145',
    'E35L',
    'E545',
    'E550',
    'E55P',
    'FA50',
    'FA7X',
    'FA8X',
    'G150',
    'G280',
    'GL5T',
    'GLF2',
    'GLF3',
    'GLF4',
    'GLF5',
    'GLF6',
    'GLEX',
    'G650',
    'GA7C',
    'PC12',
    'PC24',
    'LJ35',
    'LJ40',
    'LJ45',
    'LJ60',
    'LJ70',
    'LJ75',
    'LJ85',
    'HA4T',
    'BE40',
    'BE9L',
  ].map((s) => s.toUpperCase()),
)

export interface RawOpenSkyAircraft {
  icao24: string
  callsign: string
  lat: number
  lon: number
  altFt: number
  speedKts: number
  heading: number
  lastSeenSec: number
  originCountry: string
  onGround: boolean
  /** Mode A / squawk (OpenSky state index 14), 4-digit string when present. */
  squawk?: string
}

export function normalizeOpenSkyStates(states: any[], maxRaw = 2500): RawOpenSkyAircraft[] {
  const out: RawOpenSkyAircraft[] = []
  if (!Array.isArray(states)) return out
  for (const s of states) {
    if (!Array.isArray(s) || out.length >= maxRaw) break
    const icao24 = String(s[0] ?? '')
      .trim()
      .toLowerCase()
    const callsignRaw = String(s[1] ?? '').trim()
    const callsign = callsignRaw.replace(/\s+$/g, '') || 'UNKNOWN'
    const lon = Number(s[5])
    const lat = Number(s[6])
    if (!icao24 || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const baroM = Number(s[7])
    const geoM = Number(s[13])
    const altM = Number.isFinite(baroM) ? baroM : Number.isFinite(geoM) ? geoM : NaN
    const altFt = Number.isFinite(altM) ? Math.round(altM * 3.28084) : 0
    const speedMs = Number(s[9])
    const speedKts = Number.isFinite(speedMs) ? Math.round(speedMs * 1.94384) : 0
    const heading = Number.isFinite(Number(s[10])) ? Number(s[10]) : 0
    const onGround = s[8] === true || s[8] === 1
    const tPos = Number(s[3])
    const lastC = Number(s[4])
    const lastSeenSec = Number.isFinite(lastC) ? lastC : Number.isFinite(tPos) ? tPos : Math.floor(Date.now() / 1000)
    const originCountry = String(s[2] ?? '').trim() || 'Unknown'
    let squawk: string | undefined
    const sqRaw = s[14]
    if (sqRaw != null && sqRaw !== '') {
      const n = Number(sqRaw)
      if (Number.isFinite(n) && n >= 0) squawk = String(Math.floor(n)).padStart(4, '0').slice(-4)
      else {
        const t = String(sqRaw).trim().replace(/\s/g, '')
        if (/^\d{1,4}$/.test(t)) squawk = t.padStart(4, '0').slice(-4)
      }
    }
    out.push({
      icao24,
      callsign,
      lat,
      lon,
      altFt,
      speedKts,
      heading,
      lastSeenSec,
      originCountry,
      onGround,
      squawk,
    })
  }
  return out
}

export type AdsbRow = Record<string, unknown>

export function adsbRowToEnrichment(row: AdsbRow): {
  hex: string
  type?: string
  registration?: string
  flight?: string
  operator?: string
} {
  const hex = String(row.hex ?? row.icao ?? '')
    .trim()
    .toLowerCase()
  const type = String(row.type ?? row.category ?? '')
    .trim()
    .toUpperCase() || undefined
  const registration = String(row.r ?? row.registration ?? '')
    .trim() || undefined
  const flight = String(row.flight ?? row.callsign ?? '')
    .trim() || undefined
  const operator =
    String(row.ownop ?? row.owner ?? row.op ?? row.ownername ?? row.owner_name ?? '')
      .trim() || undefined
  return { hex, type, registration, flight, operator }
}

export function buildAdsbHexMap(ac: AdsbRow[]): Map<string, ReturnType<typeof adsbRowToEnrichment>> {
  const m = new Map<string, ReturnType<typeof adsbRowToEnrichment>>()
  for (const row of ac) {
    const e = adsbRowToEnrichment(row)
    if (e.hex) m.set(e.hex, e)
  }
  return m
}

function classify(
  operator: string | undefined,
  aircraftType: string | undefined,
): JetCategory {
  const op = (operator ?? '').trim()
  if (op.length > 1 && !/^ads-?b$/i.test(op) && !/^unknown$/i.test(op)) return 'corporate'
  const t = (aircraftType ?? '').trim().toUpperCase()
  if (t && BIZJET_TYPES.has(t)) return 'likely_corporate'
  return 'unknown'
}

function tier(cat: JetCategory): number {
  if (cat === 'corporate') return 0
  if (cat === 'likely_corporate') return 1
  return 2
}

/** Emergency / security transponder codes → table + map signal. */
export function signalFromSquawk(squawk: string | undefined): JetSignal {
  const code = (squawk ?? '').replace(/\s/g, '')
  if (code === '7500' || code === '7600' || code === '7700') return 'anomaly'
  return 'normal'
}

export function sortCorporateJets(rows: CorporateJet[]): CorporateJet[] {
  return [...rows].sort((a, b) => {
    const td = tier(a.category) - tier(b.category)
    if (td !== 0) return td
    return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  })
}

export function rawToCorporateJet(
  r: RawOpenSkyAircraft,
  adsb: Map<string, ReturnType<typeof adsbRowToEnrichment>>,
  positionSource: string,
  enrichmentSource: string | null,
): CorporateJet {
  const en = adsb.get(r.icao24)
  const aircraftType = en?.type
  const tailNumber = en?.registration
  const operatorFromAdsb = en?.operator
  const operator = operatorFromAdsb?.trim() || undefined
  const category = classify(operator, aircraftType)
  const lastSeen = new Date(r.lastSeenSec * 1000).toISOString()
  const signal = signalFromSquawk(r.squawk)
  return {
    id: `${r.icao24}-${r.lastSeenSec}`,
    icao24: r.icao24,
    callsign: r.callsign,
    tailNumber,
    operator,
    aircraftType,
    latitude: r.lat,
    longitude: r.lon,
    altitude: r.altFt,
    speed: r.speedKts,
    heading: r.heading,
    lastSeen,
    source: positionSource,
    enrichmentSource,
    category,
    signal,
  }
}

export function corporateJetToJetPosition(j: CorporateJet): Record<string, unknown> {
  const opLabel = j.operator?.trim() ? j.operator : 'Unknown operator'
  const acLabel = (j.aircraftType?.trim() || j.callsign || j.tailNumber || j.icao24).trim()
  const routeParts = [j.callsign, j.tailNumber].filter(Boolean)
  return {
    icao24: j.icao24,
    company: opLabel,
    ticker: '—',
    aircraft: acLabel,
    lat: j.latitude,
    lon: j.longitude,
    altitude: j.altitude,
    speed: j.speed,
    origin: j.tailNumber ? String(j.tailNumber) : '—',
    destination: '—',
    departureTime: j.lastSeen,
    eta: '—',
    signal: j.signal,
    route: routeParts.join(' · ') || j.icao24.toUpperCase(),
  }
}

export function computeMetrics(
  liveAircraftCount: number,
  top50: CorporateJet[],
  enrichmentProvider: string | null,
  lastEnrichmentError: string | null,
  positionSource: string,
): CorporateJetsMetrics {
  let enrichedOperatorCount = 0
  let unknownOperatorCount = 0
  for (const j of top50) {
    if (j.operator?.trim()) enrichedOperatorCount++
    else unknownOperatorCount++
  }
  return {
    liveAircraftCount,
    top50Count: top50.length,
    enrichedOperatorCount,
    unknownOperatorCount,
    enrichmentProvider,
    lastEnrichmentError,
    positionSource,
  }
}
