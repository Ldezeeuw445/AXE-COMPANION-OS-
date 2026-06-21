import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Save, LogOut, Settings as SettingsIcon, Plus, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useBeginner } from '@/lib/beginnerMode';
import { signOut, useSupabaseSession, useTradingOsProfile, upsertProfileOnboarding } from '@/lib/supabaseAuth';
import { useTerminalWatchlist } from '@/contexts/WatchlistContext';
import { flattenWatchlistGroups, WATCHLIST_CATEGORY_ORDER } from '@/lib/watchlistDefaults';

const TIMEFRAMES = ['5M', '15M', '1H', '4H', '1D', '1W'];

export default function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, userEmail, loading: sessionLoading } = useSupabaseSession();
  const { profile, loading: profileLoading } = useTradingOsProfile(userId);
  const { beginner, toggle } = useBeginner();
  const { groups, addSymbolToCategory, removeSymbol, resetToDefaults } = useTerminalWatchlist();

  const [displayName, setDisplayName] = useState('');
  const [defaultTimeframe, setDefaultTimeframe] = useState('1H');
  const [draftByCat, setDraftByCat] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const watchlistRef = useRef<HTMLDivElement | null>(null);

  const totalSyms = useMemo(() => flattenWatchlistGroups(groups).length, [groups]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!userId) navigate('/auth', { replace: true });
  }, [sessionLoading, userId, navigate]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setDefaultTimeframe(profile.default_timeframe ?? '1H');
  }, [profile]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('section') !== 'watchlist') return;
    watchlistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.search]);

  const initials = useMemo(() => {
    const base = (displayName || userEmail || 'T').trim();
    return base.slice(0, 1).toUpperCase();
  }, [displayName, userEmail]);

  const addDraft = (cat: string) => {
    const raw = draftByCat[cat] || '';
    if (!raw.trim()) {
      toast({ title: 'Empty', description: 'Enter a symbol first.' });
      return;
    }
    const ok = addSymbolToCategory(cat, raw);
    if (ok) {
      setDraftByCat((d) => ({ ...d, [cat]: '' }));
      return;
    }
    toast({ title: 'Already in this section', description: `${raw.trim()} is already under ${cat}.` });
  };

  if (sessionLoading || (userId && profileLoading)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-2">
          <SettingsIcon size={14} className="text-cyan-400" />
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">SETTINGS</span>
        </div>
      </div>

      <div className="p-4 max-w-2xl space-y-3">
        <div className="tos-card rounded-lg overflow-hidden">
          <div className="widget-header">
            <div>
              <div className="text-[11px] font-semibold text-white/80">Keyboard shortcuts</div>
              <div className="text-[10px] text-white/35">
                Command palette + fast navigation (Bloomberg-style). Hover any shortcut to learn it.
              </div>
            </div>
          </div>
          <div className="p-4 space-y-2">
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] text-white/40 uppercase tracking-wider">Command palette</div>
                <div className="text-[10px] font-mono text-white/70" title="Open command palette">
                  ⌘ K / Ctrl K
                </div>
              </div>
              <div className="text-[10px] text-white/35 mt-1">
                Search navigation + jump to symbols (recents + watchlist).
              </div>
            </div>

            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Go chords</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  ['G C', 'Chart'],
                  ['G N', 'News'],
                  ['G I', 'Intel'],
                  ['G M', 'Main'],
                  ['G J', 'Journal'],
                  ['G E', 'Engine Ops'],
                  ['G S', 'Market Scanner'],
                  ['G R', 'Macro Terminal'],
                  ['G A', 'Axe Companion'],
                  ['G ,', 'Settings'],
                ].map(([keys, label]) => (
                  <div
                    key={keys}
                    className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-2.5 py-2"
                    title={`Press ${keys.replace(' ', ' then ')} to open ${label}`}
                  >
                    <span className="text-[10px] text-white/55">{label}</span>
                    <span className="text-[10px] font-mono text-white/70">{keys}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="tos-card rounded-lg overflow-hidden">
          <div className="widget-header">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
                <span className="text-black font-bold text-xs">{initials}</span>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-white/80">Profile</div>
                <div className="text-[10px] text-white/35">{userEmail ?? '—'}</div>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Display name</div>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Trader"
                className="bg-black/40 border-white/10 h-11 text-white/80"
              />
            </div>

            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Default timeframe</div>
              <div className="flex flex-wrap gap-2">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setDefaultTimeframe(tf)}
                    className={`px-3 py-2 rounded-lg text-[10px] font-mono font-bold border transition-all ${
                      defaultTimeframe === tf
                        ? 'bg-cyan-500/15 border-cyan-500/25 text-cyan-200'
                        : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-white/75">Beginner Mode</div>
                <div className="text-[10px] text-white/35">Tooltips + guided explanations across widgets.</div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={toggle}
                className={`h-9 px-3 border-white/10 ${beginner ? 'text-cyan-200 border-cyan-500/25 bg-cyan-500/10' : 'text-white/60'}`}
              >
                {beginner ? 'On' : 'Off'}
              </Button>
            </div>

            <div ref={watchlistRef} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-white/75">Watchlist</div>
                  <div className="text-[10px] text-white/35">
                    Same list in Sidebar, News, top bar & ticker. Stored on this device; profile also saves a flat copy for onboarding.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-white/25 font-mono">{totalSyms} syms</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-white/10 text-[10px] text-white/60"
                    onClick={() => {
                      resetToDefaults();
                      toast({ title: 'Watchlist reset', description: 'Restored default categories & pairs.' });
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Defaults
                  </Button>
                </div>
              </div>

              {WATCHLIST_CATEGORY_ORDER.map((cat) => (
                <div key={cat} className="rounded-md border border-white/[0.06] bg-black/20 p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-semibold text-white/55 uppercase tracking-wider">{cat}</span>
                    <span className="text-[10px] text-white/25 font-mono">{(groups[cat] || []).length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[22px]">
                    {(groups[cat] || []).length === 0 ? (
                      <span className="text-[10px] text-white/25">No symbols</span>
                    ) : (
                      (groups[cat] || []).map((sym) => (
                        <span
                          key={sym}
                          className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-white/70"
                        >
                          {sym}
                          <button
                            type="button"
                            className="rounded p-0.5 hover:bg-white/10"
                            onClick={() => removeSymbol(sym)}
                            title="Remove"
                          >
                            <X className="h-3 w-3 text-white/40" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={draftByCat[cat] || ''}
                      onChange={(e) => setDraftByCat((d) => ({ ...d, [cat]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addDraft(cat);
                        }
                      }}
                      placeholder={`Add to ${cat}…`}
                      className="bg-black/40 border-white/10 h-9 text-[11px] text-white/80"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 border-white/10 text-white/70 px-2"
                      onClick={() => addDraft(cat)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                onClick={async () => {
                  if (!userId || saving) return;
                  setSaving(true);
                  try {
                    await upsertProfileOnboarding(userId, {
                      display_name: displayName || null,
                      default_timeframe: defaultTimeframe,
                      default_symbols: flattenWatchlistGroups(groups),
                    });
                    toast({ title: 'Saved', description: 'Settings updated.' });
                  } catch (e: any) {
                    toast({ title: 'Save failed', description: String(e?.message || e) });
                  } finally {
                    setSaving(false);
                  }
                }}
                className="h-10 bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/25"
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save
              </Button>

              <Button
                variant="outline"
                className="h-10 border-white/10 text-white/60"
                onClick={async () => {
                  await signOut();
                  navigate('/auth', { replace: true });
                }}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
