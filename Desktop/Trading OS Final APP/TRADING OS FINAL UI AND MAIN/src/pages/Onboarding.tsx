import { useEffect, useMemo, useState } from 'react';
import { Loader2, Check, ArrowRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TradingOsLogo } from '@/components/branding/TradingOsLogo';
import { fetchOnboardingOptions } from '@/lib/engineAdapter';
import { signOut, useSupabaseSession, useTradingOsProfile, upsertProfileOnboarding } from '@/lib/supabaseAuth';

type OnboardingInstrument = {
  canonical: string;
  display_name: string;
  asset_class: string;
};

type OnboardingCategory = {
  name: string;
  instruments: OnboardingInstrument[];
};

const FALLBACK_OPTIONS: { categories: OnboardingCategory[]; timeframes: string[]; default_symbols: string[] } = {
  timeframes: ['5M', '15M', '1H', '4H', '1D'],
  default_symbols: ['BTC/USD', 'EUR/USD', 'NAS100', 'XAUUSD'],
  categories: [
    { name: 'Crypto', instruments: [{ canonical: 'BTC/USD', display_name: 'BTC/USD', asset_class: 'crypto' }, { canonical: 'ETH/USD', display_name: 'ETH/USD', asset_class: 'crypto' }] },
    { name: 'FX', instruments: [{ canonical: 'EUR/USD', display_name: 'EUR/USD', asset_class: 'fx' }, { canonical: 'GBP/USD', display_name: 'GBP/USD', asset_class: 'fx' }] },
    { name: 'Indices', instruments: [{ canonical: 'NAS100', display_name: 'NAS100', asset_class: 'index' }, { canonical: 'US30', display_name: 'US30', asset_class: 'index' }] },
    { name: 'Metals', instruments: [{ canonical: 'XAUUSD', display_name: 'XAUUSD', asset_class: 'metal' }, { canonical: 'XAGUSD', display_name: 'XAGUSD', asset_class: 'metal' }] },
  ],
};

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, loading } = useSupabaseSession();
  const { onboardingComplete } = useTradingOsProfile(userId);

  const [step, setStep] = useState(0);
  const [options, setOptions] = useState(FALLBACK_OPTIONS);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!userId) navigate('/auth', { replace: true });
  }, [loading, userId, navigate]);

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    const force = params.get('force') === '1';
    if (userId && onboardingComplete && !force) navigate('/', { replace: true });
  }, [loading, userId, onboardingComplete, navigate, location.search]);

  useEffect(() => {
    let alive = true;
    async function loadOptions() {
      try {
        const json = await fetchOnboardingOptions();
        if (!alive || !json) return;
        const categories = json.categories as unknown;
        const timeframes = json.timeframes as unknown;
        if (Array.isArray(categories) && categories.length && Array.isArray(timeframes) && timeframes.length) {
          setOptions(json as typeof FALLBACK_OPTIONS);
        }
      } catch {
        // keep fallback
      }
    }
    loadOptions();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (selectedSymbols.length === 0) setSelectedSymbols(options.default_symbols);
    if (!selectedTimeframe) setSelectedTimeframe(options.timeframes[2] ?? '1H');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const allInstruments = useMemo(() => options.categories.flatMap((c) => c.instruments), [options]);

  const toggleSymbol = (s: string) => {
    setSelectedSymbols((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const finish = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await upsertProfileOnboarding(userId, {
        default_symbols: selectedSymbols,
        default_timeframe: selectedTimeframe,
        onboarding_complete: true,
      });
      let next: string | null = null;
      try {
        next = sessionStorage.getItem('tos_next_path');
      } catch {
        next = null;
      }
      if (next) {
        try {
          sessionStorage.removeItem('tos_next_path');
        } catch {
          // ignore
        }
        navigate(next, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (e: any) {
      setSaveError(String(e?.message || e));
      setSaving(false);
    }
  };

  if (loading || !userId) {
    return (
      <div className="min-h-screen app-shell-bg text-white flex items-center justify-center px-4">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen app-shell-bg text-white flex items-center justify-center px-4 pb-28">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <TradingOsLogo variant="wordmark" imgClassName="h-9 sm:h-10 max-w-[280px]" decorative />
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-white/35">
            <button
              type="button"
              className="hover:text-white/65 transition-colors"
              onClick={async () => {
                await signOut();
                navigate('/auth', { replace: true });
              }}
            >
              Sign out
            </button>
          </div>
          <p className="text-white/35">Set up your workspace in seconds.</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            {[0, 1].map((i) => (
              <div key={i} className={`h-1 w-16 rounded-full transition-colors ${i <= step ? 'bg-cyan-400/70' : 'bg-white/10'}`} />
            ))}
          </div>
        </div>

        <div className="tos-card rounded-xl !mb-0 w-full !p-8 sm:!p-9">
          {step === 0 ? (
            <div>
              <h2 className="text-xl font-bold mb-2">What do you trade?</h2>
              <p className="text-sm text-white/35 mb-6">
                Select the markets you want in your workspace. You can always change this later.
              </p>

              <div className="flex flex-wrap gap-2 max-h-[420px] overflow-y-auto pr-1">
                {allInstruments.map((entry) => (
                  <button
                    key={entry.canonical}
                    onClick={() => toggleSymbol(entry.canonical)}
                    className={`px-2.5 py-1.5 rounded text-[11px] font-medium border transition-all ${
                      selectedSymbols.includes(entry.canonical)
                        ? 'bg-cyan-500/15 border-cyan-500/25 text-cyan-200'
                        : 'bg-white/5 border-white/10 text-white/45 hover:border-white/20'
                    }`}
                  >
                    {selectedSymbols.includes(entry.canonical) ? <Check className="inline h-2.5 w-2.5 mr-1" /> : null}
                    {entry.display_name}
                  </button>
                ))}
              </div>

              <Button
                onClick={() => setStep(1)}
                className="w-full h-11 bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/25 mt-6"
                disabled={selectedSymbols.length === 0}
              >
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold mb-2">Default timeframe</h2>
              <p className="text-sm text-white/35 mb-6">Pick your most-used chart timeframe.</p>

              <div className="flex flex-wrap gap-3 mb-8">
                {options.timeframes.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`px-6 py-3 rounded-xl text-lg font-mono font-bold border transition-all ${
                      selectedTimeframe === tf
                        ? 'bg-cyan-500/15 border-cyan-500/25 text-cyan-200'
                        : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1 h-11 border-white/10 text-white/60">
                  Back
                </Button>
                <Button
                  onClick={finish}
                  className="flex-1 h-11 bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/25"
                  disabled={saving || !selectedTimeframe}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Setting up...
                    </>
                  ) : (
                    'Open Workspace'
                  )}
                </Button>
              </div>

              {saveError ? (
                <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-200/80">
                  <div className="font-semibold text-red-200/90">Onboarding save failed</div>
                  <div className="mt-1 text-red-200/70 break-words">{saveError}</div>
                  <div className="mt-2 text-red-200/60">
                    This usually means the Supabase table <code className="text-red-100">profiles</code> doesn&apos;t exist yet,
                    or Row Level Security is blocking writes.
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

