import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function hex(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  return Array.from(u8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return hex(digest)
}

type IncomingTrade = {
  external_trade_id: string
  symbol: string
  side: 'buy' | 'sell'
  volume?: number
  open_time?: string
  close_time?: string
  open_price?: number
  close_price?: number
  pnl?: number
  fees?: number
  raw?: Record<string, unknown>
}

type IngestBody = {
  token?: string
  account_meta?: { label?: string; mt5_login?: string; mt5_server?: string; raw?: Record<string, unknown> }
  trades?: IncomingTrade[]
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

  const serviceRoleKey =
    Deno.env.get('ENGINE_SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SERVICE_ROLE_KEY') ??
    ''
  if (!serviceRoleKey.trim()) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_service_role_key' }), { status: 500, headers })
  }

  let body: IngestBody = {}
  try {
    body = (await req.json()) as IngestBody
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers })
  }

  const token = String(body.token ?? '').trim()
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_token' }), { status: 400, headers })
  }

  const tokenHash = await sha256Hex(token)
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // Resolve account by token hash
  const { data: acct, error: acctErr } = await supabaseAdmin
    .from('user_broker_accounts')
    .select('id,user_id,provider')
    .eq('link_token_hash', tokenHash)
    .maybeSingle()
  if (acctErr) {
    return new Response(JSON.stringify({ ok: false, error: `account_lookup_failed:${acctErr.message}` }), { status: 500, headers })
  }
  if (!acct?.id || !acct?.user_id) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_token' }), { status: 401, headers })
  }

  const accountId = String(acct.id)
  const userId = String(acct.user_id)

  const incoming = Array.isArray(body.trades) ? body.trades : []
  if (incoming.length === 0) {
    return new Response(JSON.stringify({ ok: true, data: { accepted: 0, inserted: 0, updated: 0, rejected: 0 } }), { headers })
  }

  // Normalize rows (server enforces user/account scope).
  const rows = incoming
    .map((t) => ({
      user_id: userId,
      account_id: accountId,
      external_trade_id: String(t.external_trade_id ?? '').trim(),
      symbol: String(t.symbol ?? '').trim(),
      side: t.side === 'sell' ? 'sell' : 'buy',
      volume: Number(t.volume ?? 0) || 0,
      open_time: t.open_time ?? null,
      close_time: t.close_time ?? null,
      open_price: t.open_price ?? null,
      close_price: t.close_price ?? null,
      pnl: Number(t.pnl ?? 0) || 0,
      fees: Number(t.fees ?? 0) || 0,
      raw: t.raw ?? {},
      updated_at: new Date().toISOString(),
    }))
    .filter((r) => r.external_trade_id && r.symbol)

  const rejected = incoming.length - rows.length
  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, data: { accepted: 0, inserted: 0, updated: 0, rejected } }), { headers })
  }

  // Upsert by (account_id, external_trade_id) unique index.
  const { data: upserted, error: upErr } = await supabaseAdmin
    .from('broker_trades')
    .upsert(rows, { onConflict: 'account_id,external_trade_id' })
    .select('id')
  if (upErr) {
    return new Response(JSON.stringify({ ok: false, error: `upsert_failed:${upErr.message}` }), { status: 500, headers })
  }

  // Best-effort counts (Supabase doesn't reliably tell inserted vs updated). We report accepted + total rows.
  const accepted = rows.length
  const total = Array.isArray(upserted) ? upserted.length : 0

  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        accepted,
        inserted: 0,
        updated: total,
        rejected,
        account_id: accountId,
      },
    }),
    { headers },
  )
})

