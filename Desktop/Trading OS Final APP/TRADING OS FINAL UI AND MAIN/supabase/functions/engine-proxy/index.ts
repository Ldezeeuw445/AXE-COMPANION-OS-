// Supabase Edge: server-side trading engine (createEngine + secrets).
// Provider keys MUST be Supabase Edge secrets (Dashboard → Edge Functions → engine-proxy → Secrets).
// Do NOT put FMP/FRED/Polygon/TwelveData keys in the Vite app's .env — they would ship in the browser bundle.
// Names: FMP_API_KEY or FMP_API_KEYS / FMP_API_KEY_1…, same pattern for FRED_, POLYGON_, TWELVEDATA_;
// optional: FINNHUB_, NEWSDATA_, THENEWS_, PERIGON_; ENGINE_SUPABASE_SERVICE_ROLE_KEY (singleton cache; fallback SUPABASE_SERVICE_ROLE_KEY / SERVICE_ROLE_KEY).
// Chart: Yahoo is off by default. Set ENABLE_YAHOO_CHART_FALLBACK=true only if you explicitly want Yahoo in the chart provider chain.
// Bundle first: `npm run bundle:engine-edge` (writes bundle.mjs next to this file).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { createEngine } from './bundle.mjs'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function assertOwnUser(authenticatedId: string, requestedUserId: string) {
  if (requestedUserId !== authenticatedId) {
    throw new Error('forbidden_user_scope')
  }
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

  // de-dupe while preserving order
  const seen = new Set<string>()
  return out.filter((k) => (seen.has(k) ? false : (seen.add(k), true)))
}

let engineSingleton: { adapter: any } | null = null

function getEngineSingleton(input: {
  supabaseUrl: string
  serviceRoleKey?: string
  enableYahooChartFallback: boolean
  providerKeys: {
    fmp: string[]
    fred: string[]
    polygon: string[]
    twelvedata: string[]
    finnhub?: string[]
    newsdata?: string[]
    thenewsapi?: string[]
    perigon?: string[]
    aisstream?: string[]
    opensky?: { username: string; password: string }
  }
}) {
  if (engineSingleton) return engineSingleton

  const serviceKey = (input.serviceRoleKey ?? '').trim()
  if (!serviceKey) {
    // Per-request engine below still works; do NOT cache this failure module-wide —
    // Edge isolates live a long time: if the first request had no secret, caching would
    // block the singleton forever after ENGINE_SUPABASE_SERVICE_ROLE_KEY is added.
    throw new Error('missing_service_role_key_for_singleton')
  }

  const supabaseAdmin = createClient(input.supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  engineSingleton = createEngine({
    supabase: supabaseAdmin,
    fmpApiKeys: input.providerKeys.fmp,
    fredApiKeys: input.providerKeys.fred,
    polygonApiKeys: input.providerKeys.polygon,
    twelvedataApiKeys: input.providerKeys.twelvedata,
    finnhubApiKeys: input.providerKeys.finnhub ?? [],
    newsdataApiKeys: input.providerKeys.newsdata ?? [],
    thenewsapiApiKeys: input.providerKeys.thenewsapi ?? [],
    perigonApiKeys: input.providerKeys.perigon ?? [],
    aisstreamApiKeys: input.providerKeys.aisstream ?? [],
    openskyUsername: input.providerKeys.opensky?.username ?? '',
    openskyPassword: input.providerKeys.opensky?.password ?? '',
    enableYahooChartFallback: input.enableYahooChartFallback,
  })
  return engineSingleton
}

Deno.serve(async (req) => {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', ...cors })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405, headers })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnon) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_supabase_env' }), { status: 500, headers })
  }

  let body: { action?: string; args?: Record<string, unknown> }
  try {
    body = (await req.json()) as { action?: string; args?: Record<string, unknown> }
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers })
  }

  const action = body.action
  const args = body.args ?? {}
  if (!action) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_action' }), { status: 400, headers })
  }

  // Public actions do not require a signed-in Supabase session.
  // This keeps the trading terminal functional for market data (e.g. XAU/USD chart)
  // even when the user is not authenticated yet.
  const PUBLIC_ACTIONS = new Set([
    'getChart',
    'news',
    'macroSeries',
    'listMacroSeries',
    'getScannerResults',
    'getEarningsCalendar',
    'getDashboard',
    'getMetricsHistory',
    'getEngineStatus',
  ])

  const auth = req.headers.get('authorization') || ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null

  let uid: string | null = null
  if (!PUBLIC_ACTIONS.has(action)) {
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_authorization' }), { status: 401, headers })
    }
    // JWT validation client (RLS-safe, user-scoped)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token)
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_token' }), { status: 401, headers })
    }
    uid = userData.user.id
  } else if (token) {
    // Best-effort: if a session exists, we still resolve uid for user-scoped actions inside adapters.
    try {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      })
      const { data: userData } = await supabaseAuth.auth.getUser(token)
      uid = userData?.user?.id ?? null
    } catch {
      uid = null
    }
  }

  const env = Deno.env.toObject()
  const fmpKeysPrimary = parseKeyList(env, { listName: 'FMP_API_KEYS', singleName: 'FMP_API_KEY', numberedPrefix: 'FMP_API_KEY_' })
  const fmpKeys = fmpKeysPrimary.length > 0 ? fmpKeysPrimary : parseKeyList(env, { listName: 'FMP_KEYS', singleName: 'FMP_KEY', numberedPrefix: 'FMP_KEY_' })

  const fredKeysPrimary = parseKeyList(env, { listName: 'FRED_API_KEYS', singleName: 'FRED_API_KEY', numberedPrefix: 'FRED_API_KEY_' })
  const fredKeys = fredKeysPrimary.length > 0 ? fredKeysPrimary : parseKeyList(env, { listName: 'FRED_KEYS', singleName: 'FRED_KEY', numberedPrefix: 'FRED_KEY_' })

  const polygonKeysPrimary = parseKeyList(env, { listName: 'POLYGON_API_KEYS', singleName: 'POLYGON_API_KEY', numberedPrefix: 'POLYGON_API_KEY_' })
  const polygonKeys = polygonKeysPrimary.length > 0 ? polygonKeysPrimary : parseKeyList(env, { listName: 'POLYGON_KEYS', singleName: 'POLYGON_KEY', numberedPrefix: 'POLYGON_KEY_' })

  const twelvedataKeysPrimary = parseKeyList(env, { listName: 'TWELVEDATA_API_KEYS', singleName: 'TWELVEDATA_API_KEY', numberedPrefix: 'TWELVEDATA_API_KEY_' })
  const twelvedataKeys = twelvedataKeysPrimary.length > 0 ? twelvedataKeysPrimary : parseKeyList(env, { listName: 'TWELVEDATA_KEYS', singleName: 'TWELVEDATA_KEY', numberedPrefix: 'TWELVEDATA_KEY_' })

  const finnhubKeysPrimary = parseKeyList(env, { listName: 'FINNHUB_API_KEYS', singleName: 'FINNHUB_API_KEY', numberedPrefix: 'FINNHUB_API_KEY_' })
  const finnhubKeys = finnhubKeysPrimary.length > 0 ? finnhubKeysPrimary : parseKeyList(env, { listName: 'FINNHUB_KEYS', singleName: 'FINNHUB_KEY', numberedPrefix: 'FINNHUB_KEY_' })

  const newsdataKeysPrimary = parseKeyList(env, { listName: 'NEWSDATA_API_KEYS', singleName: 'NEWSDATA_API_KEY', numberedPrefix: 'NEWSDATA_API_KEY_' })
  const newsdataKeys = newsdataKeysPrimary.length > 0 ? newsdataKeysPrimary : parseKeyList(env, { listName: 'NEWSDATA_KEYS', singleName: 'NEWSDATA_KEY', numberedPrefix: 'NEWSDATA_KEY_' })

  const thenewsapiKeysPrimary = parseKeyList(env, { listName: 'THENEWS_API_KEYS', singleName: 'THENEWS_API_KEY', numberedPrefix: 'THENEWS_API_KEY_' })
  const thenewsapiKeys = thenewsapiKeysPrimary.length > 0 ? thenewsapiKeysPrimary : parseKeyList(env, { listName: 'THENEWS_KEYS', singleName: 'THENEWS_KEY', numberedPrefix: 'THENEWS_KEY_' })

  const perigonKeysPrimary = parseKeyList(env, { listName: 'PERIGON_API_KEYS', singleName: 'PERIGON_API_KEY', numberedPrefix: 'PERIGON_API_KEY_' })
  const perigonKeys = perigonKeysPrimary.length > 0 ? perigonKeysPrimary : parseKeyList(env, { listName: 'PERIGON_KEYS', singleName: 'PERIGON_KEY', numberedPrefix: 'PERIGON_KEY_' })
  const aisstreamKeys = parseKeyList(env, { listName: 'AISSTREAM_API_KEYS', singleName: 'AISSTREAM_API_KEY', numberedPrefix: 'AISSTREAM_API_KEY_' })
  const openskyUsername =
    (Deno.env.get('OPENSKY_USERNAME') ?? Deno.env.get('OPENSKY_USER') ?? Deno.env.get('OPENSKY_EMAIL') ?? '').trim()
  const openskyPassword =
    (Deno.env.get('OPENSKY_PASSWORD') ?? Deno.env.get('OPENSKY_PASS') ?? '').trim()

  const enableYahooChartFallback =
    (Deno.env.get('ENABLE_YAHOO_CHART_FALLBACK') ?? '').trim().toLowerCase() === 'true'

  const aisstreamKeysAliased =
    aisstreamKeys.length > 0
      ? aisstreamKeys
      : parseKeyList(env, { listName: 'AISSTREAM_KEYS', singleName: 'AISSTREAM_KEY', numberedPrefix: 'AISSTREAM_KEY_' })
  // Prefer ENGINE_SUPABASE_SERVICE_ROLE_KEY (CLI can set it; SUPABASE_* names are blocked by `supabase secrets set`).
  // Fallback to SUPABASE_SERVICE_ROLE_KEY when set by Dashboard / platform injection.
  // Never use VITE_* — service role exists only inside Edge runtime.
  const serviceRoleKey =
    Deno.env.get('ENGINE_SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SERVICE_ROLE_KEY') ??
    ''

  // Prefer a singleton engine (persistent cache/metrics). If service role is not set,
  // fall back to per-request engine (works, but cache/metrics reset each request).
  let adapter: any
  try {
    adapter = getEngineSingleton({
      supabaseUrl,
      serviceRoleKey,
      providerKeys: {
        fmp: fmpKeys,
        fred: fredKeys,
        polygon: polygonKeys,
        twelvedata: twelvedataKeys,
        finnhub: finnhubKeys,
        newsdata: newsdataKeys,
        thenewsapi: thenewsapiKeys,
        perigon: perigonKeys,
        aisstream: aisstreamKeysAliased,
        opensky: { username: openskyUsername, password: openskyPassword },
      },
    }).adapter
  } catch {
    const supabasePerRequest = createClient(supabaseUrl, supabaseAnon, {
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      auth: { persistSession: false },
    })
    adapter = createEngine({
      supabase: supabasePerRequest,
      fmpApiKeys: fmpKeys,
      fredApiKeys: fredKeys,
      polygonApiKeys: polygonKeys,
      twelvedataApiKeys: twelvedataKeys,
      finnhubApiKeys: finnhubKeys,
      newsdataApiKeys: newsdataKeys,
      thenewsapiApiKeys: thenewsapiKeys,
      perigonApiKeys: perigonKeys,
      aisstreamApiKeys: aisstreamKeysAliased,
      openskyUsername,
      openskyPassword,
      enableYahooChartFallback,
    }).adapter
  }

  try {
    let data: unknown
    switch (action) {
      case 'news':
        data = await adapter.news(args.symbol as string | undefined, (args.filters ?? {}) as never)
        break
      case 'getAnalystConsensus':
        data = await adapter.getAnalystConsensus(String(args.symbol ?? ''))
        break
      case 'getRelativePerformance':
        data = await adapter.getRelativePerformance(String(args.symbol ?? ''))
        break
      case 'getKeyLevels':
        data = await adapter.getKeyLevels(String(args.symbol ?? ''))
        break
      case 'getSentimentShort':
        data = await adapter.getSentimentShort(String(args.symbol ?? ''))
        break
      case 'getCorporateJets':
        data = await adapter.getCorporateJets()
        break
      case 'getVesselStream':
        data = await adapter.getVesselStream()
        break
      case 'macroSeries':
        data = await adapter.macroSeries(String(args.key ?? ''), args.range as string | undefined)
        break
      case 'listMacroSeries':
        data = await adapter.listMacroSeries()
        break
      case 'getAccountSummary': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.getAccountSummary(userId)
        break
      }
      case 'getOpenPositions': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.getOpenPositions(userId)
        break
      }
      case 'getWatchlist': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.getWatchlist(userId)
        break
      }
      case 'getChart':
        data = await adapter.getChart(String(args.symbol ?? ''), String(args.timeframe ?? ''), args.limit as number | undefined)
        break
      case 'getScannerResults':
        data = await adapter.getScannerResults((args.filter ?? {}) as never)
        break
      case 'getEarningsCalendar':
        data = await adapter.getEarningsCalendar(String(args.from ?? ''), String(args.to ?? ''))
        break
      case 'getAxeContext': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.getAxeContext(String(args.symbol ?? ''), String(args.timeframe ?? ''), userId)
        break
      }
      case 'getAxeMemory': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.getAxeMemory(userId, args.symbol as string | undefined)
        break
      }
      case 'getAxeStatus': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.getAxeStatus(userId)
        break
      }
      case 'getDashboard':
        data = await adapter.getDashboard()
        break
      case 'getMetricsHistory':
        data = await adapter.getMetricsHistory(args.timeframe as '1H' | '24H' | '7D' | '30D')
        break
      case 'getEngineStatus':
        data = await adapter.getEngineStatus()
        break
      case 'listBrokerAccounts': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.listBrokerAccounts(userId)
        break
      }
      case 'createBrokerAccount': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.createBrokerAccount(userId, {
          label: String(args.label ?? 'MT5 Account'),
          mt5Login: args.mt5Login ? String(args.mt5Login) : undefined,
          mt5Server: args.mt5Server ? String(args.mt5Server) : undefined,
        })
        break
      }
      case 'setActiveAccount': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.setActiveAccount(userId, args.accountId ? String(args.accountId) : null)
        break
      }
      case 'getTradeHistory': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.getTradeHistory(userId, (args.query ?? {}) as never)
        break
      }
      case 'labelTrade': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.labelTrade(userId, {
          tradeId: String(args.tradeId ?? ''),
          accountId: String(args.accountId ?? ''),
          label: String(args.label ?? 'Good') as never,
          note: args.note ? String(args.note) : null,
        })
        break
      }
      case 'getJournalAnalytics': {
        const userId = String(args.userId ?? '')
        if (!uid) throw new Error('missing_authorization')
        assertOwnUser(uid, userId)
        data = await adapter.getJournalAnalytics(userId, (args.query ?? {}) as never)
        break
      }
      default:
        return new Response(JSON.stringify({ ok: false, error: 'unknown_action' }), { status: 400, headers })
    }
    return new Response(JSON.stringify({ ok: true, data }), { headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const status = message === 'forbidden_user_scope' ? 403 : 500
    let chartDebug: unknown = undefined
    if (
      action === 'getChart' &&
      e &&
      typeof e === 'object' &&
      e !== null &&
      'debug' in e &&
      (e as { debug?: unknown }).debug !== undefined
    ) {
      chartDebug = (e as { debug: unknown }).debug
    }
    const payload =
      chartDebug !== undefined ? { ok: false as const, error: message, chartDebug } : { ok: false as const, error: message }
    return new Response(JSON.stringify(payload), { status, headers })
  }
})
