// Supabase Edge: intel-proxy (HTTP snapshots for Intel page)
// - Auth: requires Bearer JWT
// - Secrets ONLY via Supabase (Edge Function secrets), not the Vite .env:
//   OPENSKY_USERNAME, OPENSKY_PASSWORD; FMP_API_KEY* (insiders); AISSTREAM_API_KEY* (vessels);
//   WHALEALERT_API_KEY* | WHALE_ALERT_API_KEY* | WHALEALERT_KEYS (whales)
//   Jets: OpenSky positions + optional ADS-B enrichment (RAPIDAPI_KEY + AVIATION_RAPIDAPI_HOST).
//   Optional fallbacks: AVIATION_API_KEY (Aviationstack flights), same RapidAPI host for ADS-B-only.
//   AIRTOP_FOR_TRADING_OS / DataDocked: not wired (no stable documented HTTP contract in-repo).
// - Output: fixed contracts matching existing UI types in engineAdapterLegacy.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import * as Jets from './jetsPipeline.ts'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function jsonResponse(payload: unknown, init: { status?: number; headers?: Headers } = {}) {
  const headers = init.headers ?? new Headers()
  if (!headers.get('content-type')) headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(payload), { status: init.status ?? 200, headers })
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseWhaleAlertKeys(env: Record<string, string>): string[] {
  const primary = parseKeyList(env, { listName: 'WHALEALERT_API_KEYS', singleName: 'WHALEALERT_API_KEY', numberedPrefix: 'WHALEALERT_API_KEY_' })
  if (primary.length > 0) return primary
  const alt = parseKeyList(env, { listName: 'WHALE_ALERT_API_KEYS', singleName: 'WHALE_ALERT_API_KEY', numberedPrefix: 'WHALE_ALERT_API_KEY_' })
  if (alt.length > 0) return alt
  return parseKeyList(env, { listName: 'WHALEALERT_KEYS', singleName: 'WHALEALERT_KEY', numberedPrefix: 'WHALEALERT_KEY_' })
}

function parseKeyList(env: Record<string, string>, opts: { listName: string; singleName: string; numberedPrefix: string }): string[] {
  const out: string[] = []
  const listRaw = env[opts.listName]
  if (listRaw) {
    for (const part of listRaw.split(',')) {
      const key = part.trim()
      if (key) out.push(key)
    }
  }
  const numbered = Object.keys(env)
    .filter((k) => k.startsWith(opts.numberedPrefix))
    .sort((a, b) => {
      const ai = Number(a.slice(opts.numberedPrefix.length)) || 0
      const bi = Number(b.slice(opts.numberedPrefix.length)) || 0
      return ai - bi
    })
    .map((k) => (env[k] ?? '').trim())
    .filter(Boolean)
  out.push(...numbered)
  const single = (env[opts.singleName] ?? '').trim()
  if (single) out.push(single)
  const seen = new Set<string>()
  return out.filter((k) => (seen.has(k) ? false : (seen.add(k), true)))
}

const PUBLIC_INTEL_ACTIONS = new Set([
  'corporateJets',
  'insiderTrades',
  'whaleTransactions',
  'vesselStream',
])

async function authorizeIntelRequest(req: Request, action: string) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null
  if (!token) return { ok: false as const, status: 401, error: 'missing_authorization' }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnon) return { ok: false as const, status: 500, error: 'missing_supabase_env' }

  // Allow anonymous JWT for public intel reads (same pattern as engine-proxy public chart reads).
  // This keeps the Intel page + Live Data Proof working without requiring a signed-in user session.
  if (PUBLIC_INTEL_ACTIONS.has(action) && token === supabaseAnon) {
    return { ok: true as const, token, uid: null as string | null }
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return { ok: false as const, status: 401, error: 'invalid_token' }

  return { ok: true as const, token, uid: data.user.id }
}

async function fetchOpenSkyJets(): Promise<any[]> {
  const username = (Deno.env.get('OPENSKY_USERNAME') ?? Deno.env.get('OPENSKY_USER') ?? Deno.env.get('OPENSKY_EMAIL') ?? '').trim()
  const password = (Deno.env.get('OPENSKY_PASSWORD') ?? Deno.env.get('OPENSKY_PASS') ?? '').trim()
  if (!username || !password) throw new Error('missing_opensky_credentials')

  const basic = btoa(`${username}:${password}`)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8_000)
  let res: Response
  try {
    res = await fetch('https://opensky-network.org/api/states/all', {
      headers: { Authorization: `Basic ${basic}` },
      signal: ctrl.signal,
    })
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'AbortError' || (e instanceof Error && /abort/i.test(e.message))) {
      throw new Error('opensky_timeout')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`opensky_error_${res.status}`)
  const json = await res.json()
  return Array.isArray(json.states) ? json.states : []
}

const JETS_FETCH_MS = 8_000

async function fetchAviationStackActiveFlights(accessKey: string): Promise<any[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), JETS_FETCH_MS)
  let res: Response
  try {
    const u = `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(accessKey)}&flight_status=active&limit=40`
    res = await fetch(u, { signal: ctrl.signal })
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'AbortError' || (e instanceof Error && /abort/i.test(e.message))) throw new Error('aviationstack_timeout')
    throw e
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`aviationstack_error_${res.status}`)
  const json = await res.json()
  const data = Array.isArray(json?.data) ? json.data : []
  return data.filter((f: any) => f?.live && Number.isFinite(Number(f.live.latitude)) && Number.isFinite(Number(f.live.longitude)))
}

function mapAviationStackToJetPositions(flights: any[]): any[] {
  const out: any[] = []
  for (const f of flights.slice(0, 20)) {
    const live = f?.live ?? {}
    const lat = Number(live.latitude)
    const lon = Number(live.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const cs =
      String(f?.flight?.iata ?? f?.flight?.icao ?? f?.flight?.number ?? f?.airline?.name ?? '').trim() || 'UNKNOWN'
    const country = String(f?.airline?.country ?? f?.departure?.timezone ?? 'Unknown').trim() || 'Unknown'
    const icaoHex = String(f?.aircraft?.icao24 ?? f?.aircraft?.registration ?? '').trim()
    const altFt = Number(live.altitude)
    const spdKts = Number(live.speed_horizontal ?? live.speed)
    out.push({
      icao24: icaoHex || `flight_${String(cs).replace(/\s+/g, '_')}`,
      company: country,
      ticker: '—',
      aircraft: cs,
      lat,
      lon,
      altitude: Number.isFinite(altFt) ? Math.round(altFt) : 0,
      speed: Number.isFinite(spdKts) ? Math.round(spdKts) : 0,
      origin: String(f?.departure?.iata ?? f?.departure?.airport ?? '—'),
      destination: String(f?.arrival?.iata ?? f?.arrival?.airport ?? '—'),
      departureTime: String(f?.departure?.scheduled ?? f?.departure?.estimated ?? nowIso()),
      eta: String(f?.arrival?.estimated ?? '—'),
      signal: 'normal',
      route: '—',
    })
  }
  return out
}

async function fetchAdsbRapidApiAircraft(rapidApiKey: string, host: string, lat: number, lon: number, distNm: number): Promise<any[]> {
  const path = `/v2/lat/${lat}/lon/${lon}/dist/${distNm}/`
  const url = `https://${host.replace(/^https?:\/\//, '')}${path}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), JETS_FETCH_MS)
  let res: Response
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': host.replace(/^https?:\/\//, ''),
      },
    })
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'AbortError' || (e instanceof Error && /abort/i.test(e.message))) throw new Error('rapidapi_adsb_timeout')
    throw e
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`rapidapi_adsb_error_${res.status}`)
  const json = await res.json()
  const ac = Array.isArray(json?.ac) ? json.ac : Array.isArray(json?.aircraft) ? json.aircraft : []
  return ac
}

function mapAdsbAcToJetPositions(ac: any[]): any[] {
  const out: any[] = []
  for (const row of ac.slice(0, 20)) {
    const lat = Number(row?.lat ?? row?.latitude)
    const lon = Number(row?.lon ?? row?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const hex = String(row?.hex ?? row?.icao ?? '').trim()
    const flight = String(row?.flight ?? row?.callsign ?? '').trim() || 'UNKNOWN'
    // ADS-B Exchange: alt_baro / alt_geom are typically feet; gs is knots.
    const altFt = Number(row?.alt_baro ?? row?.alt_geom ?? row?.altitude ?? 0)
    const gsKts = Number(row?.gs ?? row?.speed ?? 0)
    out.push({
      icao24: hex || `icao_${Math.random().toString(16).slice(2)}`,
      company: String(row?.category ?? 'ADS-B'),
      ticker: '—',
      aircraft: flight,
      lat,
      lon,
      altitude: Number.isFinite(altFt) ? Math.round(altFt) : 0,
      speed: Number.isFinite(gsKts) ? Math.round(gsKts) : 0,
      origin: '—',
      destination: '—',
      departureTime: nowIso(),
      eta: '—',
      signal: 'normal',
      route: '—',
    })
  }
  return out
}

function legacyJetRowToCorporate(j: any, source: string, idx: number): Jets.CorporateJet {
  const icao24 =
    String(j.icao24 ?? '')
      .trim()
      .toLowerCase() || `unk_${idx}`
  const lastSeen = typeof j.departureTime === 'string' && j.departureTime ? String(j.departureTime) : nowIso()
  const op = String(j.company ?? '').trim()
  const hasOp =
    op.length > 1 &&
    !/^unknown/i.test(op) &&
    !/^ads-?b$/i.test(op)
  const rawSig = j.signal
  const signal: Jets.JetSignal =
    rawSig === 'anomaly' || rawSig === 'meeting' || rawSig === 'regulatory' || rawSig === 'normal'
      ? rawSig
      : 'normal'
  return {
    id: `${icao24}-${idx}`,
    icao24,
    callsign: String(j.aircraft ?? '').trim() || 'UNKNOWN',
    tailNumber: j.origin && j.origin !== '—' ? String(j.origin) : undefined,
    operator: hasOp ? op : undefined,
    aircraftType: undefined,
    latitude: Number(j.lat),
    longitude: Number(j.lon),
    altitude: Number(j.altitude) || 0,
    speed: Number(j.speed) || 0,
    heading: 0,
    lastSeen,
    source,
    enrichmentSource: null,
    category: hasOp ? 'corporate' : 'unknown',
    signal,
  }
}

/** When `top50` is empty but `positions` has rows (wire/cache edge), rebuild table rows from map positions. */
function corporateRowsFromJetPositions(positions: any[], source: string): Jets.CorporateJet[] {
  return (positions ?? []).slice(0, 50).map((p, i) =>
    legacyJetRowToCorporate(
      {
        icao24: p.icao24,
        company: p.company,
        aircraft: p.aircraft,
        lat: p.lat,
        lon: p.lon,
        altitude: p.altitude,
        speed: p.speed,
        departureTime: p.departureTime,
        origin: p.origin,
        signal: p.signal,
      },
      source,
      i,
    ),
  )
}

function bundleFromLegacyRows(
  rows: any[],
  source: string,
  positionSource: string,
  enrichProv: string | null,
  enrichErr: string | null,
): { positions: any[]; top50: Jets.CorporateJet[]; metrics: Jets.CorporateJetsMetrics; source: string } {
  const corporate = rows.map((j, i) => legacyJetRowToCorporate(j, source, i))
  const sorted = Jets.sortCorporateJets(corporate)
  let top50 = sorted.slice(0, 50)
  const positions = sorted.slice(0, 100).map(Jets.corporateJetToJetPosition)
  if (positions.length > 0 && top50.length === 0) {
    top50 = Jets.sortCorporateJets(corporateRowsFromJetPositions(positions, positionSource)).slice(0, 50)
  }
  const metrics = Jets.computeMetrics(rows.length, top50, enrichProv, enrichErr, positionSource)
  return { positions, top50, metrics, source }
}

async function buildCorporateJetsBundle(env: Record<string, string>): Promise<{
  positions: any[]
  top50: Jets.CorporateJet[]
  metrics: Jets.CorporateJetsMetrics
  source: string
}> {
  let openSkyErr = ''
  try {
    const states = await fetchOpenSkyJets()
    const raw = Jets.normalizeOpenSkyStates(states).filter((r) => !r.onGround && r.altFt >= 400)
    let adsbMap = new Map<string, ReturnType<typeof Jets.adsbRowToEnrichment>>()
    let enrichProv: string | null = null
    let enrichErr: string | null = null
    const rapid = (env['RAPIDAPI_KEY'] ?? '').trim()
    if (rapid) {
      try {
        const hostRaw = (env['AVIATION_RAPIDAPI_HOST'] ?? 'adsbexchange-com1.p.rapidapi.com').trim()
        const host = hostRaw.replace(/^https?:\/\//, '')
        let sumLat = 0
        let sumLon = 0
        let n = 0
        for (const r of raw.slice(0, 800)) {
          sumLat += r.lat
          sumLon += r.lon
          n++
        }
        const lat = n ? sumLat / n : Number(env['JETS_FALLBACK_LAT'] ?? 40.7128)
        const lon = n ? sumLon / n : Number(env['JETS_FALLBACK_LON'] ?? -74.006)
        const distRaw = Number(env['JETS_FALLBACK_DIST_NM'] ?? '200')
        const distNm = Number.isFinite(distRaw) ? Math.min(250, Math.max(50, distRaw)) : 200
        const ac = await fetchAdsbRapidApiAircraft(rapid, host, lat, lon, distNm)
        adsbMap = Jets.buildAdsbHexMap(ac)
        enrichProv = 'rapidapi_adsb'
      } catch (e) {
        enrichErr = e instanceof Error ? e.message : String(e)
      }
    }
    if (raw.length === 0) {
      const metrics = Jets.computeMetrics(0, [], enrichProv, enrichErr, 'opensky')
      return { positions: [], top50: [], metrics, source: 'opensky' }
    }
    const jets = raw.map((r) => Jets.rawToCorporateJet(r, adsbMap, 'opensky', enrichProv))
    const sorted = Jets.sortCorporateJets(jets)
    let top50 = sorted.slice(0, 50)
    const positions = sorted.slice(0, 100).map(Jets.corporateJetToJetPosition)
    if (positions.length > 0 && top50.length === 0) {
      top50 = Jets.sortCorporateJets(corporateRowsFromJetPositions(positions, 'opensky')).slice(0, 50)
    }
    const metrics = Jets.computeMetrics(raw.length, top50, enrichProv, enrichErr, 'opensky')
    return { positions, top50, metrics, source: 'opensky' }
  } catch (e) {
    openSkyErr = e instanceof Error ? e.message : String(e)
    console.warn('opensky_jets_failed', openSkyErr)
  }

  const avKey = (env['AVIATION_API_KEY'] ?? env['AVIATIONSTACK_API_KEY'] ?? '').trim()
  if (avKey) {
    try {
      const flights = await fetchAviationStackActiveFlights(avKey)
      const jets = mapAviationStackToJetPositions(flights)
      if (jets.length > 0) return bundleFromLegacyRows(jets, 'aviationstack', 'aviationstack', null, null)
    } catch (e) {
      console.warn('aviationstack_jets_failed', e instanceof Error ? e.message : e)
    }
  }

  const rapidOnly = (env['RAPIDAPI_KEY'] ?? '').trim()
  if (rapidOnly) {
    const hostRaw = (env['AVIATION_RAPIDAPI_HOST'] ?? 'adsbexchange-com1.p.rapidapi.com').trim()
    const host = hostRaw.replace(/^https?:\/\//, '')
    const lat = Number(env['JETS_FALLBACK_LAT'] ?? '40.7128')
    const lon = Number(env['JETS_FALLBACK_LON'] ?? '-74.0060')
    const distRaw = Number(env['JETS_FALLBACK_DIST_NM'] ?? '100')
    const distNm = Number.isFinite(distRaw) ? Math.min(250, Math.max(25, distRaw)) : 100
    try {
      const ac = await fetchAdsbRapidApiAircraft(rapidOnly, host, lat, lon, distNm)
      const jets = mapAdsbAcToJetPositions(ac)
      if (jets.length > 0) return bundleFromLegacyRows(jets, 'rapidapi_adsb', 'rapidapi_adsb', 'rapidapi_adsb', null)
    } catch (e) {
      console.warn('rapidapi_adsb_jets_failed', e instanceof Error ? e.message : e)
    }
  }

  const tried: string[] = ['opensky']
  if (avKey) tried.push('aviationstack')
  if (rapidOnly) tried.push('rapidapi_adsb')
  throw new Error(`jets_unavailable:${openSkyErr || 'opensky_failed'}|tried=${tried.join(',')}`)
}

async function fetchFmpInsiderRows(symbol: string | undefined, apiKey: string): Promise<any[]> {
  // Per-trade rows: `latest` = market-wide feed; `search` = one symbol (avoid statistics rollup — wrong for table UI).
  const sym = String(symbol ?? '').trim().toUpperCase()
  const path = sym
    ? `https://financialmodelingprep.com/stable/insider-trading/search?page=0&limit=100&symbol=${encodeURIComponent(sym)}`
    : `https://financialmodelingprep.com/stable/insider-trading/latest?page=0&limit=100`
  const url = `${path}&apikey=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, { headers: { apikey: apiKey } })
  if (!res.ok) throw new Error(`fmp_insider_error_${res.status}`)
  const json = await res.json()
  return Array.isArray(json) ? json : []
}

function mapFmpInsiderRows(raw: any[]): any[] {
  const out: any[] = []
  for (const r of raw) {
    const ticker = String(r?.symbol ?? r?.ticker ?? '').trim().toUpperCase()
    if (!ticker) continue

    const insider = String(r?.reportingName ?? r?.name ?? r?.insiderName ?? '—').trim() || '—'
    const tt = String(r?.transactionType ?? r?.typeOfTransaction ?? r?.type ?? '').toUpperCase()
    const isSale = tt.includes('S-SALE') || tt.includes('SALE') || tt === 'S' || /^S[-\s]/.test(tt)
    const isPurchase = tt.includes('P-PURCHASE') || tt.includes('PURCHASE') || tt.includes('BUY') || tt === 'P' || /^P[-\s]/.test(tt)
    const type: 'BUY' | 'SELL' = isSale && !isPurchase ? 'SELL' : 'BUY'

    const shares = Number(r?.securitiesTransacted ?? r?.shares ?? 0)
    const price = Number(r?.price ?? r?.transactionPrice ?? 0)
    let value = Number(r?.value ?? r?.notional ?? 0)
    if (!Number.isFinite(value) || value <= 0) {
      const prod = shares * price
      value = Number.isFinite(prod) && prod > 0 ? prod : 0
    }

    const date = String(r?.transactionDate ?? r?.filingDate ?? r?.date ?? '').slice(0, 10) || nowIso().slice(0, 10)
    out.push({ ticker, insider, type, value, date })
    if (out.length >= 40) break
  }
  return out
}

async function fetchAisStreamSnapshot(apiKey: string): Promise<any[]> {
  // Supabase Edge (Deno) may EarlyDrop/crash on outbound WebSockets depending on runtime/network.
  // Do not attempt websockets here.
  void apiKey
  throw new Error('aisstream_not_supported_in_edge')
}

function mapAisToVesselsAndAlerts(events: any[]): { vessels: any[]; alerts: any[] } {
  const byMmsi = new Map<string, any>()

  for (const e of events) {
    const meta = e?.Metadata ?? {}
    const msgType = String(e?.MessageType ?? '')
    const mmsi = String(meta?.MMSI ?? meta?.UserID ?? meta?.ShipMMSI ?? '')
    if (!mmsi) continue

    const lat = Number(meta?.Latitude)
    const lon = Number(meta?.Longitude)
    const speed = Number(meta?.Sog ?? meta?.Speed ?? 0)
    const name =
      String(meta?.ShipName ?? '') ||
      String(e?.Message?.ShipStaticData?.ShipName ?? '') ||
      `Vessel ${mmsi}`
    const type =
      String(meta?.ShipType ?? '') ||
      String(e?.Message?.ShipStaticData?.ShipType ?? '') ||
      'Vessel'
    const destination = String(meta?.Destination ?? e?.Message?.ShipStaticData?.Destination ?? '—') || '—'
    const eta = String(meta?.Eta ?? e?.Message?.ShipStaticData?.Eta ?? '—') || '—'

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
    }

    if (Number.isFinite(lat)) prev.lat = lat
    if (Number.isFinite(lon)) prev.lon = lon
    if (Number.isFinite(speed)) prev.speed = speed
    if (name) prev.name = name
    if (type) prev.type = type
    if (destination) prev.destination = destination
    if (eta) prev.eta = eta

    // Simple status heuristic
    if (prev.speed <= 0.2) prev.status = 'anchored'
    else if (prev.speed <= 1.0) prev.status = 'loitering'
    else prev.status = 'in_transit'

    // If we only got static data and no position updates, mark ais_gap later.
    prev.__sawPosition = prev.__sawPosition || msgType === 'PositionReport'

    byMmsi.set(mmsi, prev)
  }

  const vessels = Array.from(byMmsi.values())
    .map((v) => {
      if (!v.__sawPosition) v.status = 'ais_gap'
      delete v.__sawPosition
      return v
    })
    .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lon))
    .slice(0, 30)

  const alerts: any[] = []
  const loitering = vessels.filter((v) => v.status === 'loitering').length
  const gaps = vessels.filter((v) => v.status === 'ais_gap').length
  if (loitering > 8) {
    alerts.push({
      id: 'loitering',
      message: `${loitering} vessels loitering near chokepoints`,
      category: 'GLOBAL TRADE',
      severity: 'high',
      timestamp: 'now',
    })
  }
  if (gaps > 0) {
    alerts.push({
      id: 'ais_gap',
      message: `${gaps} vessel(s) with AIS gaps`,
      category: 'GLOBAL TRADE',
      severity: gaps > 5 ? 'high' : 'medium',
      timestamp: 'now',
    })
  }

  return { vessels, alerts }
}

function minutesAgoLabel(tsSec: number): string {
  const deltaSec = Math.max(0, Math.floor(Date.now() / 1000) - tsSec)
  const min = Math.floor(deltaSec / 60)
  if (min <= 0) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  return `${h}h ago`
}

async function fetchWhaleAlert(apiKey: string): Promise<any[]> {
  const start = Math.floor(Date.now() / 1000) - 60 * 60 // last 1h
  const url = `https://api.whale-alert.io/v1/transactions?start=${start}&min_value=500000&limit=50&api_key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`whalealert_error_${res.status}`)
  const json = await res.json()
  return Array.isArray(json.transactions) ? json.transactions : []
}

function mapWhaleAlert(raw: any[]): any[] {
  return raw.slice(0, 30).map((t: any) => {
    const chain = String(t?.blockchain ?? '').toUpperCase() || 'UNKNOWN'
    const from = String(t?.from?.owner || t?.from?.address || 'unknown')
    const to = String(t?.to?.owner || t?.to?.address || 'unknown')
    const amount = Number(t?.amount ?? 0)
    const amountUsd = Number(t?.amount_usd ?? 0)
    const type = String(t?.transaction_type ?? t?.type ?? 'transfer')
    const ts = Number(t?.timestamp ?? Math.floor(Date.now() / 1000))
    const timestamp = minutesAgoLabel(ts)
    const txHash = String(t?.hash ?? t?.tx_hash ?? '')
    return { chain, from, to, amount, amountUsd, type, timestamp, txHash }
  })
}

Deno.serve(async (req) => {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', ...cors })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405, headers })

  let body: { action?: string; args?: Record<string, unknown> }
  try {
    body = (await req.json()) as { action?: string; args?: Record<string, unknown> }
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400, headers })
  }

  const action = body.action
  const args = body.args ?? {}
  if (!action) return jsonResponse({ ok: false, error: 'missing_action' }, { status: 400, headers })

  let auth: Awaited<ReturnType<typeof authorizeIntelRequest>>
  try {
    auth = await authorizeIntelRequest(req, action)
  } catch (e) {
    console.error('auth_error', e)
    return jsonResponse({ ok: false, error: 'auth_failed' }, { status: 500, headers })
  }
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, { status: auth.status, headers })

  try {
    const env = Deno.env.toObject()
    console.log('calling_provider', action)

    if (action === 'corporateJets') {
      try {
        let { positions, top50, metrics, source } = await buildCorporateJetsBundle(env)
        if (positions.length > 0 && top50.length === 0) {
          top50 = Jets.sortCorporateJets(corporateRowsFromJetPositions(positions, String(source ?? 'intel'))).slice(0, 50)
          metrics = Jets.computeMetrics(
            positions.length,
            top50,
            metrics.enrichmentProvider,
            metrics.lastEnrichmentError,
            metrics.positionSource,
          )
        }
        return jsonResponse({ ok: true, data: positions, top50, metrics, action, source }, { headers })
      } catch (e) {
        console.error('provider_error', action, e)
        const msg = e instanceof Error ? e.message : String(e)
        return jsonResponse({ ok: false, error: msg || 'jets_failed', action, source: null }, { status: 503, headers })
      }
    }

    if (action === 'insiderTrades') {
      try {
        const rawSym = args.symbol
        const symbol =
          typeof rawSym === 'string' && rawSym.trim() !== '' ? rawSym.trim() : undefined
        const keysPrimary = parseKeyList(env, { listName: 'FMP_API_KEYS', singleName: 'FMP_API_KEY', numberedPrefix: 'FMP_API_KEY_' })
        const keys = keysPrimary.length > 0 ? keysPrimary : parseKeyList(env, { listName: 'FMP_KEYS', singleName: 'FMP_KEY', numberedPrefix: 'FMP_KEY_' })
        if (keys.length === 0) throw new Error('missing_fmp_keys')
        // Try keys in order; on quota/rate limit the engine can rotate later.
        let lastErr: unknown = null
        for (const key of keys) {
          try {
            const raw = await fetchFmpInsiderRows(symbol, key)
            return jsonResponse({ ok: true, data: mapFmpInsiderRows(raw), action }, { headers })
          } catch (e) {
            lastErr = e
          }
        }
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
      } catch (e) {
        console.error('provider_error', action, e)
        const msg = e instanceof Error ? e.message : String(e)
        return jsonResponse({ ok: false, error: msg || 'fmp_failed', action }, { status: 500, headers })
      }
    }

    if (action === 'vesselStream') {
      // WebSockets are disabled in Edge for stability.
      const keys = parseKeyList(env, { listName: 'AISSTREAM_API_KEYS', singleName: 'AISSTREAM_API_KEY', numberedPrefix: 'AISSTREAM_API_KEY_' })
      const keysAliased =
        keys.length > 0
          ? keys
          : parseKeyList(env, { listName: 'AISSTREAM_KEYS', singleName: 'AISSTREAM_KEY', numberedPrefix: 'AISSTREAM_KEY_' })

      if (keysAliased.length === 0) {
        return jsonResponse({ ok: false, error: 'missing_aisstream_key', action }, { status: 500, headers })
      }

      // Controlled error instead of crashing.
      return jsonResponse({ ok: false, error: 'aisstream_not_supported_in_edge', action }, { status: 501, headers })
    }

    if (action === 'whaleTransactions') {
      try {
        const keys = parseWhaleAlertKeys(env)
        if (keys.length === 0) throw new Error('missing_whalealert_key')

        let lastErr: unknown = null
        for (const key of keys) {
          try {
            const txs = await fetchWhaleAlert(key)
            return jsonResponse({ ok: true, data: mapWhaleAlert(txs), action }, { headers })
          } catch (e) {
            lastErr = e
          }
        }
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
      } catch (e) {
        console.error('provider_error', action, e)
        const msg = e instanceof Error ? e.message : String(e)
        return jsonResponse({ ok: false, error: msg || 'whalealert_failed', action }, { status: 500, headers })
      }
    }

    return jsonResponse({ ok: false, error: 'unknown_action', action }, { status: 400, headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('intel_proxy_unhandled', action, e)
    return jsonResponse({ ok: false, error: msg || 'intel_proxy_failed', action }, { status: 500, headers })
  }
})

