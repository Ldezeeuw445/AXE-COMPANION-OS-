/**
 * AXE MT5 cloud connector — MetaApi provisioning + client REST (read-only analytics).
 * Secrets: METAAPI_TOKEN | AXE_MT5_METAAPI_TOKEN, SUPABASE_SERVICE_ROLE_KEY (or ENGINE_*).
 * Optional: METAAPI_PROVISIONING_PROFILE_ID, METAAPI_CLIENT_API_URL (full base override),
 *           METAAPI_DEFAULT_REGION (default new-york) for client API when region unknown.
 *
 * No order execution from this function — use investor password + manualTrades/magic 0 on provision.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

type CloudAction = 'create' | 'test' | 'sync' | 'disconnect'

const DEFAULT_PROVISIONING_BASE = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  })
}

function getMetaApiToken(): string {
  return (
    Deno.env.get('METAAPI_TOKEN') ??
    Deno.env.get('AXE_MT5_METAAPI_TOKEN') ??
    Deno.env.get('AXE_MT5_CLOUD_API_TOKEN') ??
    ''
  ).trim()
}

function provisioningBase(): string {
  return (Deno.env.get('METAAPI_PROVISIONING_URL') ?? DEFAULT_PROVISIONING_BASE).replace(/\/$/, '')
}

function clientApiBase(region: string | undefined | null): string {
  const override = Deno.env.get('METAAPI_CLIENT_API_URL')?.trim()
  if (override) return override.replace(/\/$/, '')
  const slug = (region ?? Deno.env.get('METAAPI_DEFAULT_REGION') ?? 'new-york').trim() || 'new-york'
  return `https://mt-client-api-v1.${slug}.agiliumtrade.ai`
}

function randomTransactionId(): string {
  const u = new Uint8Array(16)
  crypto.getRandomValues(u)
  return Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')
}

function maskLogin(login: string): string {
  const d = login.replace(/\D/g, '')
  if (d.length <= 2) return '****'
  return `****${d.slice(-4)}`
}

function digitsLogin(login: string): string {
  return login.replace(/\D/g, '')
}

async function metaapiFetch(
  method: string,
  url: string,
  token: string,
  opts?: { body?: unknown; transactionId?: string },
): Promise<{ status: number; headers: Headers; json: unknown | null; text: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'auth-token': token,
  }
  if (opts?.transactionId) headers['transaction-id'] = opts.transactionId
  if (opts?.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let parsed: unknown | null = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  return { status: res.status, headers: res.headers, json: parsed, text }
}

type TradingAccount = {
  _id?: string
  id?: string
  region?: string
  connectionStatus?: string
  state?: string
  server?: string
  login?: string | number
}

async function readProvisioningAccount(accountId: string, token: string): Promise<TradingAccount | null> {
  const url = `${provisioningBase()}/users/current/accounts/${encodeURIComponent(accountId)}`
  const r = await metaapiFetch('GET', url, token)
  if (r.status !== 200 || !r.json || typeof r.json !== 'object') return null
  const o = r.json as Record<string, unknown>
  const id = String(o._id ?? o.id ?? '').trim()
  return {
    ...o,
    _id: id || undefined,
    id: id || undefined,
    region: o.region as string | undefined,
    connectionStatus: o.connectionStatus as string | undefined,
    state: o.state as string | undefined,
    server: o.server as string | undefined,
    login: o.login as string | number | undefined,
  }
}

async function createMetaApiAccount(args: {
  token: string
  loginDigits: string
  password: string
  name: string
  server: string
  region?: string
  profileId?: string
}): Promise<{ ok: true; accountId: string; region?: string; raw: unknown } | { ok: false; message: string; code: string }> {
  const txId = randomTransactionId()
  const body: Record<string, unknown> = {
    login: args.loginDigits,
    password: args.password,
    name: args.name,
    server: args.server,
    platform: 'mt5',
    magic: 0,
    manualTrades: true,
    type: 'cloud-g2',
    reliability: 'high',
  }
  if (args.profileId) body.provisioningProfileId = args.profileId
  if (args.region) body.region = args.region

  const url = `${provisioningBase()}/users/current/accounts`
  const maxAttempts = 8
  let lastMsg = 'Unknown MetaApi response'

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r = await metaapiFetch('POST', url, args.token, { body, transactionId: txId })
    const j = r.json as Record<string, unknown> | null

    if (r.status === 401 || r.status === 403) {
      return { ok: false, message: 'MetaApi rejected the API token (401/403). Check METAAPI_TOKEN scopes.', code: 'metaapi_auth' }
    }

    if (r.status === 201 && j && typeof j === 'object') {
      const id = String(j.id ?? j._id ?? '').trim()
      if (id) {
        const acct = await readProvisioningAccount(id, args.token)
        return { ok: true, accountId: id, region: acct?.region, raw: j }
      }
    }

    if (r.status === 202) {
      const retryAfter = r.headers.get('Retry-After')
      let waitMs = 10_000
      if (retryAfter) {
        const t = Date.parse(retryAfter)
        if (!Number.isNaN(t)) waitMs = Math.min(30_000, Math.max(2000, t - Date.now()))
      }
      await new Promise((res) => setTimeout(res, waitMs))
      lastMsg = (j?.message as string) || 'Provisioning in progress…'
      continue
    }

    if (j && typeof j === 'object') {
      lastMsg = String(j.message ?? j.error ?? r.text).slice(0, 500)
      const details = j.details
      if (details && typeof details === 'object' && 'recommendedResourceSlots' in details) {
        const slots = (details as { recommendedResourceSlots?: number }).recommendedResourceSlots
        if (typeof slots === 'number' && r.status !== 202) {
          body.resourceSlots = slots
          await new Promise((res) => setTimeout(res, 1500))
          continue
        }
      }
      if (r.status >= 400) {
        return { ok: false, message: lastMsg, code: 'metaapi_provision_failed' }
      }
    } else {
      lastMsg = r.text.slice(0, 500)
    }

    if (r.status >= 400) {
      return { ok: false, message: lastMsg, code: 'metaapi_provision_failed' }
    }

    return { ok: false, message: lastMsg || 'Unexpected MetaApi response', code: 'metaapi_provision_failed' }
  }

  return { ok: false, message: lastMsg || 'MetaApi provisioning timed out.', code: 'metaapi_provision_timeout' }
}

async function deleteMetaApiAccount(accountId: string, token: string): Promise<boolean> {
  const url = `${provisioningBase()}/users/current/accounts/${encodeURIComponent(accountId)}?executeForAllReplicas=true`
  const r = await metaapiFetch('DELETE', url, token)
  return r.status === 204 || r.status === 200 || r.status === 404
}

type MetaDeal = {
  id?: string
  type?: string
  entryType?: string
  symbol?: string
  volume?: number
  time?: string
  price?: number
  profit?: number
  commission?: number
  swap?: number
  positionId?: string
}

function dealToTradeRow(
  userId: string,
  accountUuid: string,
  d: MetaDeal,
): Record<string, unknown> | null {
  const sym = String(d.symbol ?? '').trim()
  const typ = String(d.type ?? '')
  if (!sym) return null
  if (!typ.includes('DEAL_TYPE_BUY') && !typ.includes('DEAL_TYPE_SELL')) return null
  if (typ === 'DEAL_TYPE_BUY_CANCELED' || typ === 'DEAL_TYPE_SELL_CANCELED') return null

  const et = String(d.entryType ?? '')
  if (et && et !== 'DEAL_ENTRY_OUT' && et !== 'DEAL_ENTRY_INOUT' && et !== 'DEAL_ENTRY_OUT_BY') {
    return null
  }

  const id = String(d.id ?? '').trim()
  if (!id) return null

  const side = typ.includes('BUY') && !typ.includes('SELL') ? 'buy' : 'sell'
  const pnl = Number(d.profit ?? 0) || 0
  const fees = (Number(d.commission ?? 0) || 0) + (Number(d.swap ?? 0) || 0)
  const t = d.time ?? new Date().toISOString()

  return {
    user_id: userId,
    account_id: accountUuid,
    external_trade_id: `metaapi:${id}`,
    symbol: sym,
    side,
    volume: Number(d.volume ?? 0) || 0,
    open_time: null,
    close_time: t,
    open_price: d.price ?? null,
    close_price: d.price ?? null,
    pnl,
    fees,
    raw: { metaapi: d, source: 'metaapi_cloud' },
    updated_at: new Date().toISOString(),
  }
}

Deno.serve(async (req) => {
  const hdr = new Headers({ 'content-type': 'application/json; charset=utf-8', ...cors })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: hdr })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnon) {
    return json({ ok: false, code: 'server_misconfigured', message: 'Missing Supabase env on axe-mt5-cloud.' }, 500)
  }

  const serviceRoleKey =
    Deno.env.get('ENGINE_SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SERVICE_ROLE_KEY') ??
    ''
  if (!serviceRoleKey.trim()) {
    return json({ ok: false, code: 'server_misconfigured', message: 'Missing service role key for DB writes.' }, 500)
  }

  const metaToken = getMetaApiToken()
  if (!metaToken) {
    return json({
      ok: false,
      code: 'provider_not_configured',
      message: 'Set METAAPI_TOKEN or AXE_MT5_METAAPI_TOKEN on this Edge function.',
    })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ ok: false, code: 'unauthorized', message: 'Missing Authorization.' }, 401)

  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user?.id) {
    return json({ ok: false, code: 'unauthorized', message: 'Invalid or expired session.' }, 401)
  }

  let body: {
    action?: CloudAction
    userId?: string
    label?: string
    mt5Login?: string
    mt5Server?: string
    investorPassword?: string
    region?: string
    readOnlyConfirmed?: boolean
    accountId?: string
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ ok: false, code: 'invalid_json', message: 'Body must be JSON.' }, 400)
  }

  const requestedUser = String(body.userId ?? '').trim()
  if (!requestedUser || requestedUser !== user.id) {
    return json({ ok: false, code: 'forbidden', message: 'userId must match the signed-in user.' }, 403)
  }

  const action = body.action
  if (!action || !['create', 'test', 'sync', 'disconnect'].includes(action)) {
    return json({ ok: false, code: 'invalid_action', message: 'action must be create, test, sync, or disconnect.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const userId = user.id

  const loadOurAccount = async (ourAccountId: string) => {
    const { data, error } = await admin
      .from('user_broker_accounts')
      .select(
        'id,user_id,connection_method,external_connection_id,metadata,label,mt5_server,masked_login,provider_status',
      )
      .eq('id', ourAccountId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data as {
      id: string
      user_id: string
      connection_method: string
      external_connection_id: string | null
      metadata: Record<string, unknown> | null
      label: string | null
      mt5_server: string | null
      masked_login: string | null
      provider_status: string | null
    } | null
  }

  try {
    if (action === 'create') {
      if (!body.readOnlyConfirmed) {
        return json({
          ok: false,
          code: 'read_only_ack_required',
          message: 'Confirm read-only / investor access before connecting.',
        })
      }
      const label = String(body.label ?? 'MT5 Account').trim() || 'MT5 Account'
      const server = String(body.mt5Server ?? '').trim()
      const loginRaw = String(body.mt5Login ?? '').trim()
      const password = String(body.investorPassword ?? '')
      const regionOpt = String(body.region ?? '').trim() || undefined
      const profileId = Deno.env.get('METAAPI_PROVISIONING_PROFILE_ID')?.trim() || undefined

      if (!server || !loginRaw || !password) {
        return json({ ok: false, code: 'validation_error', message: 'MT5 login, server, and password are required.' })
      }

      const loginDigits = digitsLogin(loginRaw)
      if (!loginDigits) {
        return json({ ok: false, code: 'validation_error', message: 'MT5 login must contain digits.' })
      }

      const created = await createMetaApiAccount({
        token: metaToken,
        loginDigits,
        password,
        name: label,
        server,
        region: regionOpt,
        profileId,
      })

      if (!created.ok) {
        return json({ ok: false, code: created.code, message: created.message })
      }

      const prov = await readProvisioningAccount(created.accountId, metaToken)
      const conn = String(prov?.connectionStatus ?? 'UNKNOWN')
      const metaRegion = prov?.region ?? created.region
      const providerStatus = conn === 'CONNECTED' ? 'connected' : conn.toLowerCase()

      const masked = maskLogin(loginDigits)
      const metadata: Record<string, unknown> = {
        metaapi: {
          accountId: created.accountId,
          region: metaRegion ?? null,
          connectionStatus: conn,
          state: prov?.state ?? null,
          provisionedAt: new Date().toISOString(),
          readOnlyIntent: true,
        },
      }

      const { data: row, error: insErr } = await admin
        .from('user_broker_accounts')
        .insert({
          user_id: userId,
          provider: 'mt5',
          label,
          status: 'active',
          mt5_login: null,
          mt5_server: server,
          connection_method: 'cloud_mt5',
          external_connection_id: created.accountId,
          masked_login: masked,
          provider_status: providerStatus,
          metadata,
          raw: {},
          link_token_hash: null,
        })
        .select('id')
        .single()

      if (insErr) {
        await deleteMetaApiAccount(created.accountId, metaToken).catch(() => {})
        return json({ ok: false, code: 'db_insert_failed', message: insErr.message })
      }

      return json({
        ok: true,
        code: providerStatus === 'connected' ? 'connected' : 'provisioning',
        message:
          providerStatus === 'connected'
            ? 'MetaApi account linked. Run sync to import trade history.'
            : `MetaApi account created; broker connection status: ${conn}. Try Test or Sync shortly.`,
        accountId: row?.id as string,
        metaapiAccountId: created.accountId,
      })
    }

    if (action === 'test') {
      const ourId = String(body.accountId ?? '').trim()
      if (!ourId) return json({ ok: false, code: 'validation_error', message: 'accountId is required.' })

      const row = await loadOurAccount(ourId)
      if (!row || row.connection_method !== 'cloud_mt5') {
        return json({ ok: false, code: 'not_found', message: 'Cloud account not found.' }, 404)
      }
      const ext = String(row.external_connection_id ?? '').trim()
      if (!ext) {
        return json({ ok: false, code: 'failed', message: 'No MetaApi account id on this row.' })
      }

      const prov = await readProvisioningAccount(ext, metaToken)
      if (!prov) {
        return json({ ok: false, code: 'failed', message: 'MetaApi account not found (invalid or removed).' })
      }

      const conn = String(prov.connectionStatus ?? '')
      const base = clientApiBase(prov.region ?? (row.metadata?.metaapi as { region?: string } | undefined)?.region)

      let terminalOk = false
      const infoUrl = `${base}/users/current/accounts/${encodeURIComponent(ext)}/account-information?refreshTerminalState=true`
      const ir = await metaapiFetch('GET', infoUrl, metaToken)
      terminalOk = ir.status === 200

      await admin
        .from('user_broker_accounts')
        .update({
          provider_status: conn === 'CONNECTED' && terminalOk ? 'connected' : conn.toLowerCase() || 'unknown',
          metadata: {
            ...(row.metadata ?? {}),
            metaapi: {
              ...((row.metadata?.metaapi as object) ?? {}),
              lastTestAt: new Date().toISOString(),
              connectionStatus: conn,
              terminalAccountInformationOk: terminalOk,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', ourId)
        .eq('user_id', userId)

      const ok = conn === 'CONNECTED' && terminalOk
      return json({
        ok,
        code: ok ? 'connected' : 'failed',
        message: ok
          ? 'Terminal connected; account information readable.'
          : `connectionStatus=${conn || 'n/a'}; account-information HTTP ${ir.status}.`,
      })
    }

    if (action === 'sync') {
      const ourId = String(body.accountId ?? '').trim()
      if (!ourId) return json({ ok: false, code: 'validation_error', message: 'accountId is required.' })

      const row = await loadOurAccount(ourId)
      if (!row || row.connection_method !== 'cloud_mt5') {
        return json({ ok: false, code: 'not_found', message: 'Cloud account not found.' }, 404)
      }
      const ext = String(row.external_connection_id ?? '').trim()
      if (!ext) {
        return json({ ok: false, code: 'failed', message: 'No MetaApi account id.' })
      }

      const prov = await readProvisioningAccount(ext, metaToken)
      if (!prov) {
        return json({ ok: false, code: 'failed', message: 'MetaApi account not found.' })
      }

      const region = prov.region ?? (row.metadata?.metaapi as { region?: string } | undefined)?.region
      const base = clientApiBase(region)

      await admin
        .from('user_broker_accounts')
        .update({ provider_status: 'syncing', updated_at: new Date().toISOString() })
        .eq('id', ourId)
        .eq('user_id', userId)

      const infoUrl = `${base}/users/current/accounts/${encodeURIComponent(ext)}/account-information?refreshTerminalState=true`
      const posUrl = `${base}/users/current/accounts/${encodeURIComponent(ext)}/positions?refreshTerminalState=false`

      const [infoR, posR] = await Promise.all([
        metaapiFetch('GET', infoUrl, metaToken),
        metaapiFetch('GET', posUrl, metaToken),
      ])

      const accountSummary = infoR.status === 200 ? infoR.json : null
      const positions = posR.status === 200 && Array.isArray(posR.json) ? posR.json : []

      const now = new Date()
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      const startIso = start.toISOString()
      const endIso = now.toISOString()

      const allDeals: MetaDeal[] = []
      let offset = 0
      const pageSize = 1000
      for (;;) {
        const dealsUrl =
          `${base}/users/current/accounts/${encodeURIComponent(ext)}/history-deals/time/${encodeURIComponent(startIso)}/${encodeURIComponent(endIso)}?offset=${offset}&limit=${pageSize}`
        const dr = await metaapiFetch('GET', dealsUrl, metaToken)
        if (dr.status !== 200) break
        const chunk = Array.isArray(dr.json) ? (dr.json as MetaDeal[]) : []
        allDeals.push(...chunk)
        if (chunk.length < pageSize) break
        offset += pageSize
        if (offset > 50_000) break
      }

      const tradeRows = allDeals
        .map((d) => dealToTradeRow(userId, ourId, d))
        .filter((x): x is Record<string, unknown> => x != null)

      let upserted = 0
      if (tradeRows.length > 0) {
        const { data: up, error: upErr } = await admin
          .from('broker_trades')
          .upsert(tradeRows, { onConflict: 'account_id,external_trade_id' })
          .select('id')
        if (upErr) {
          await admin
            .from('user_broker_accounts')
            .update({
              provider_status: 'failed',
              updated_at: new Date().toISOString(),
              metadata: {
                ...(row.metadata ?? {}),
                metaapi: {
                  ...((row.metadata?.metaapi as object) ?? {}),
                  lastSyncError: upErr.message,
                  lastSyncAt: new Date().toISOString(),
                },
              },
            })
            .eq('id', ourId)
          return json({ ok: false, code: 'sync_failed', message: upErr.message })
        }
        upserted = Array.isArray(up) ? up.length : tradeRows.length
      }

      const nextMeta = {
        ...((row.metadata?.metaapi as object) ?? {}),
        lastSyncAt: new Date().toISOString(),
        dealsFetched: allDeals.length,
        dealsUpserted: upserted,
        openPositions: positions.length,
        accountSummary,
      }

      const conn = String(prov.connectionStatus ?? '')
      const nextStatus = conn === 'CONNECTED' ? 'connected' : conn.toLowerCase() || 'connected'

      await admin
        .from('user_broker_accounts')
        .update({
          last_sync_at: new Date().toISOString(),
          provider_status: nextStatus,
          metadata: { ...(row.metadata ?? {}), metaapi: nextMeta },
          updated_at: new Date().toISOString(),
        })
        .eq('id', ourId)
        .eq('user_id', userId)

      return json({
        ok: true,
        code: 'connected',
        message: 'Sync completed.',
        dealsFetched: allDeals.length,
        dealsUpserted: upserted,
        positions: positions.length,
      })
    }

    if (action === 'disconnect') {
      const ourId = String(body.accountId ?? '').trim()
      if (!ourId) return json({ ok: false, code: 'validation_error', message: 'accountId is required.' })

      const row = await loadOurAccount(ourId)
      if (!row || row.connection_method !== 'cloud_mt5') {
        return json({ ok: false, code: 'not_found', message: 'Cloud account not found.' }, 404)
      }

      const ext = String(row.external_connection_id ?? '').trim()
      if (ext) {
        await deleteMetaApiAccount(ext, metaToken).catch(() => {})
      }

      await admin
        .from('user_broker_accounts')
        .update({
          external_connection_id: null,
          provider_status: 'disconnected',
          metadata: {
            ...(row.metadata ?? {}),
            metaapi: {
              ...((row.metadata?.metaapi as object) ?? {}),
              disconnectedAt: new Date().toISOString(),
              previousMetaapiAccountId: ext || null,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', ourId)
        .eq('user_id', userId)

      return json({ ok: true, code: 'disconnected', message: 'Cloud connection removed; account marked disconnected.' })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ ok: false, code: 'internal_error', message: msg }, 500)
  }

  return json({ ok: false, code: 'invalid_action', message: 'Unhandled action.' }, 400)
})
