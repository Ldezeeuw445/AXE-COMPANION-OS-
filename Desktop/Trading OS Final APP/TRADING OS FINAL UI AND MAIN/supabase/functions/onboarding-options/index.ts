// Supabase Edge Function: onboarding-options
// GET (or POST) /functions/v1/onboarding-options
//
// Returns:
// {
//   categories: { name, instruments: { canonical, display_name, keywords, asset_class, provider }[] }[],
//   timeframes: string[],
//   default_symbols: string[],
// }
//
// Auth: requires a valid Supabase JWT (Authorization: Bearer <access_token>)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type OnboardingInstrument = {
  canonical: string
  display_name: string
  keywords: string[]
  asset_class: string
  provider: string
}

type OnboardingCategory = {
  name: string
  instruments: OnboardingInstrument[]
}

type OnboardingOptions = {
  categories: OnboardingCategory[]
  timeframes: string[]
  default_symbols: string[]
}

const TIMEFRAMES = ['5m', '15m', '1H', '4H', '1D', '1W']
const DEFAULT_SYMBOLS = ['EUR/USD', 'XAU/USD', 'BTC/USD', 'NAS100']

// NOTE: This is a high-quality placeholder registry.
// Later, replace with `assets` table or your central symbol registry.
const CATEGORY_ORDER: Array<{ name: string; instruments: Array<Omit<OnboardingInstrument, 'provider'>> }> = [
  {
    name: 'FX',
    instruments: [
      { canonical: 'EUR/USD', display_name: 'EUR/USD', keywords: ['eur', 'usd', 'ecb', 'fed'], asset_class: 'forex' },
      { canonical: 'GBP/USD', display_name: 'GBP/USD', keywords: ['gbp', 'usd', 'boe'], asset_class: 'forex' },
      { canonical: 'USD/JPY', display_name: 'USD/JPY', keywords: ['usd', 'jpy', 'boj'], asset_class: 'forex' },
    ],
  },
  {
    name: 'Crypto',
    instruments: [
      { canonical: 'BTC/USD', display_name: 'BTC/USD', keywords: ['btc', 'bitcoin', 'crypto'], asset_class: 'crypto' },
      { canonical: 'ETH/USD', display_name: 'ETH/USD', keywords: ['eth', 'ethereum', 'crypto'], asset_class: 'crypto' },
      { canonical: 'SOL/USD', display_name: 'SOL/USD', keywords: ['sol', 'solana', 'crypto'], asset_class: 'crypto' },
    ],
  },
  {
    name: 'Indices',
    instruments: [
      { canonical: 'NAS100', display_name: 'NAS100', keywords: ['nasdaq', 'tech', 'us100'], asset_class: 'index' },
      { canonical: 'SPX500', display_name: 'SPX500', keywords: ['spx', 'sp500', 'equities'], asset_class: 'index' },
      { canonical: 'US30', display_name: 'US30', keywords: ['dow', 'djia', 'equities'], asset_class: 'index' },
    ],
  },
  {
    name: 'Metals',
    instruments: [
      { canonical: 'XAU/USD', display_name: 'XAU/USD', keywords: ['gold', 'xau', 'rates'], asset_class: 'commodity' },
      { canonical: 'XAG/USD', display_name: 'XAG/USD', keywords: ['silver', 'xag'], asset_class: 'commodity' },
    ],
  },
  {
    name: 'Energy',
    instruments: [
      { canonical: 'CRUDE', display_name: 'CRUDE', keywords: ['oil', 'wti', 'energy'], asset_class: 'commodity' },
      { canonical: 'BRENT', display_name: 'BRENT', keywords: ['oil', 'brent', 'energy'], asset_class: 'commodity' },
    ],
  },
]

function resolveProvider(_canonical: string): string {
  return 'FMP'
}

function buildOptions(): OnboardingOptions {
  const categories: OnboardingCategory[] = CATEGORY_ORDER.map((c) => ({
    name: c.name,
    instruments: c.instruments.map((i) => ({ ...i, provider: resolveProvider(i.canonical) })),
  }))

  return {
    categories,
    timeframes: TIMEFRAMES,
    default_symbols: DEFAULT_SYMBOLS,
  }
}

let cached: OnboardingOptions | null = null
let cachedAt = 0
const CACHE_TTL = 10 * 60 * 1000

Deno.serve(async (req) => {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  })

  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  const auth = req.headers.get('authorization') || ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null
  if (!token) return new Response(JSON.stringify({ error: 'missing_authorization' }), { status: 401, headers })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnon) {
    return new Response(JSON.stringify({ error: 'missing_supabase_env' }), { status: 500, headers })
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401, headers })
  }

  const now = Date.now()
  if (cached && now - cachedAt < CACHE_TTL) return new Response(JSON.stringify(cached), { headers })

  cached = buildOptions()
  cachedAt = now
  return new Response(JSON.stringify(cached), { headers })
})

