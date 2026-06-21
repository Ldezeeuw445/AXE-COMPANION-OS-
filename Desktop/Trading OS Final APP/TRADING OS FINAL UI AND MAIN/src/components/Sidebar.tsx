import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Newspaper, Target, PieChart, Flame,
  ScanLine, FlaskConical, Globe, Cpu, Calendar, MapPin,
  Settings, Plus, TrendingUp, PanelLeftClose, PanelLeft,
  Sparkles,
  Gauge,
  X,
  ChevronRight,
  ChevronDown,
  BookOpen,
} from 'lucide-react';
import { useSymbol } from '../contexts/SymbolContext';
import { useSupabaseSession, useTradingOsProfile } from '@/lib/supabaseAuth';
import { useTerminalWatchlist } from '@/contexts/WatchlistContext';
import { WATCHLIST_CATEGORY_ORDER } from '@/lib/watchlistDefaults';

const navItems = [
  { icon: LayoutDashboard, label: 'MAIN', path: '/' },
  { icon: BookOpen, label: 'JOURNAL', path: '/journal' },
  { icon: Newspaper, label: 'NEWS', path: '/news' },
  { icon: Target, label: 'INTEL', path: '/intel' },
  { icon: Gauge, label: 'ENGINE OPS', path: '/engine' },
  { icon: PieChart, label: 'ANALYSES', path: '/analyses' },
  { icon: Flame, label: 'HEATMAP', path: '/heatmap' },
  { icon: ScanLine, label: 'MARKET SCANNER', path: '/market-scanner' },
  { icon: FlaskConical, label: 'QUANTLAB', path: '/quantlab' },
  { icon: Globe, label: 'MACRO TERMINAL', path: '/macro-terminal' },
  { icon: Cpu, label: 'BIGMAC INDEX', path: '/bigmac-index' },
  { icon: TrendingUp, label: 'POLYMARKET INTEL', path: '/polymarket-intel' },
  { icon: Calendar, label: 'EARNINGS CALENDAR', path: '/earnings-calendar' },
  { icon: MapPin, label: 'AI DATA CENTER MAP', path: '/ai-data-center-map' },
  { icon: Sparkles, label: 'AXE COMPANION', path: '/axe-companion' },
];

const ALL_SYMBOLS: Record<string, string[]> = {
  'BONDS': ['US 2-Year', 'US 10-Year', 'US 30-Year', 'DE 10-Year', 'JP 10-Year'],
  'CRYPTO': ['BTC/USD', 'ETH/USD', 'XRP/USD', 'SOL/USD'],
  'ENERGY': ['WTI Crude', 'Brent Crude', 'Natural Gas', 'Gasoline'],
  'FX': ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD'],
  'INDICES': ['Nasdaq 100', 'S&P 500', 'Dow Jones', 'DAX 40', 'FTSE 100', 'Nikkei 225'],
  'METALS': ['XAUUSD', 'XAGUSD', 'XPTUSD', 'Copper'],
};

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenChat: () => void;
}

export default function Sidebar({ collapsed, onToggleCollapse, onOpenChat }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { symbol, setSymbol } = useSymbol();
  const { userId, userEmail } = useSupabaseSession();
  const { profile } = useTradingOsProfile(userId);
  const { groups } = useTerminalWatchlist();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const displayName =
    profile?.display_name?.trim() ||
    (userEmail ? userEmail.split('@')[0] : null) ||
    'Trader';

  const allSymbols = Object.entries(ALL_SYMBOLS).flatMap(([cat, syms]) =>
    (syms as string[]).map(s => ({ symbol: s, category: cat }))
  );
  const filteredSymbols = searchQuery
    ? allSymbols.filter(s => s.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  if (collapsed) {
    return (
      <div className="w-14 flex-shrink-0 bg-[#0c0c0c]/95 border-r border-white/5 flex flex-col overflow-hidden">
        {/* Top */}
        <div className="flex-shrink-0 flex flex-col items-center py-2">
          <button onClick={onToggleCollapse} className="w-8 h-8 rounded-md flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-all mb-2">
            <PanelLeft size={16} />
          </button>
          <button onClick={() => navigate('/chart')} className="w-9 h-9 rounded-md flex items-center justify-center mb-2 bg-gradient-to-b from-[#06b6d4] to-[#0891b2] text-white">
            <TrendingUp size={16} />
          </button>
          <div className="w-8 h-px bg-white/[0.06]" />
        </div>

        {/* Nav items — scrollable, fills space */}
        <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col items-center gap-1 py-1 min-h-0">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <div key={item.path} onClick={() => navigate(item.path)} onMouseEnter={() => setHoveredLabel(item.label)} onMouseLeave={() => setHoveredLabel(null)} className={`relative w-9 h-9 flex items-center justify-center rounded-md cursor-pointer transition-all ${isActive ? 'text-[#06b6d4]' : 'text-white/40 hover:bg-white/[0.05] hover:text-white/70'}`}>
                <item.icon size={18} />
                {hoveredLabel === item.label && <div className="absolute left-full ml-2 px-2 py-1 rounded bg-[#1a1a1a] border border-white/[0.08] text-[10px] text-white/70 whitespace-nowrap z-50">{item.label}</div>}
              </div>
            );
          })}
        </div>

        {/* Bottom — always pinned */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-2 pb-2 border-t border-white/[0.06]">
          <button onClick={onOpenChat} className="relative group" style={{ width: 40, height: 40 }} title="AXE AI Assistant">
            <div className="absolute inset-0 rounded-xl opacity-60 group-hover:opacity-100 transition-opacity" style={{ background: 'linear-gradient(135deg, #a3e635, #06b6d4, #8b5cf6)', filter: 'blur(4px)' }} />
            <div className="absolute inset-[1px] rounded-2xl" style={{ background: 'linear-gradient(135deg, #a3e635, #06b6d4, #8b5cf6)', padding: 2 }}>
              <div className="w-full h-full rounded-[13px] bg-[#0a0a0c] flex items-center justify-center">
                <img src="/assets/axe-logo.png" alt="AXE" className="w-7 h-7 object-cover rounded" />
              </div>
            </div>
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-8 h-8 flex items-center justify-center rounded-md text-white/30 hover:bg-white/[0.05] hover:text-white/60"
            title="Settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-56 flex-shrink-0 bg-[#0c0c0c]/95 border-r border-white/5 flex flex-col overflow-hidden h-full">
      {/* ═══ TOP: Fixed (toggle, chart, search) ═══ */}
      <div className="flex-shrink-0 px-3 pt-2 pb-2">
        <div className="flex items-center justify-end mb-2">
          <button onClick={onToggleCollapse} className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all">
            <PanelLeftClose size={14} />
          </button>
        </div>
        <button onClick={() => navigate('/chart')} className="w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-2 bg-gradient-to-b from-[#06b6d4] to-[#0891b2] text-white mb-2">
          <TrendingUp size={14} /> CHART
        </button>
        {isSearching ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/[0.05] border border-cyan-500/20 text-xs">
            <input autoFocus type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onBlur={() => { if (!searchQuery) setIsSearching(false); }} placeholder="Search symbol..." className="bg-transparent text-white/70 placeholder:text-white/30 outline-none flex-1" />
            <button onClick={() => { setSearchQuery(''); setIsSearching(false); }}><X size={12} className="text-white/30" /></button>
          </div>
        ) : (
          <button onClick={() => setIsSearching(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-white/[0.03] border border-white/5 text-xs text-white/40 hover:bg-white/[0.05]">
            <Plus size={12} /><span>Add symbol...</span>
          </button>
        )}
        {searchQuery && filteredSymbols.length > 0 && (
          <div className="mt-1 p-1.5 rounded-md bg-[#141414] border border-white/[0.06] max-h-32 overflow-y-auto scrollbar-hide">
            {filteredSymbols.map((s, i) => (
              <button key={i} onClick={() => { setSymbol(s.symbol); setSearchQuery(''); setIsSearching(false); }} className="w-full flex items-center justify-between px-2 py-1 rounded text-[10px] text-white/60 hover:bg-white/[0.05]">
                <span>{s.symbol}</span><span className="text-white/25">{s.category}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ═══ MIDDLE: Nav items — scrollable, pushes bottom down ═══ */}
      <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <div key={item.path} onClick={() => navigate(item.path)} className={`flex items-center gap-3 py-2 px-3 mx-1 rounded-md cursor-pointer text-[11px] font-medium tracking-wide transition-all ${isActive ? 'bg-[rgba(6,182,212,0.08)] text-[#06b6d4]' : 'text-white/50 hover:bg-white/[0.03] hover:text-white/80'}`}>
              <item.icon size={16} /><span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* ═══ BOTTOM: Watchlist + AXE + User — always pinned ═══ */}
      <div className="flex-shrink-0 border-t border-white/[0.06] bg-[#0c0c0c]/95">
        {/* Watchlist */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">MY WATCHLIST</span>
            <button
              type="button"
              className="text-[10px] text-cyan-400 hover:underline"
              onClick={() => navigate('/settings?section=watchlist')}
            >
              Edit
            </button>
          </div>
          {WATCHLIST_CATEGORY_ORDER.map((cat) => {
            const symbols = groups[cat] || [];
            return (
              <div key={cat} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => setOpenCats((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                  className="w-full flex items-center gap-2 py-1 text-xs text-white/50 hover:text-white/70"
                >
                  {openCats[cat] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span className="font-medium">{cat}</span>
                  <span className="text-white/30">({symbols.length})</span>
                </button>
                {openCats[cat] && (
                  <div className="ml-5 space-y-0.5">
                    {symbols.length === 0 ? (
                      <div className="text-[10px] text-white/25 px-2 py-1">Empty</div>
                    ) : (
                      symbols.map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => setSymbol(sym)}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[10px] transition-all ${
                            symbol === sym
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sym.includes('USD')
                                ? 'bg-green-500'
                                : cat === 'CRYPTO'
                                  ? 'bg-purple-500'
                                  : cat === 'ENERGY'
                                    ? 'bg-orange-500'
                                    : cat === 'METALS'
                                      ? 'bg-yellow-500'
                                      : cat === 'INDICES'
                                        ? 'bg-blue-500'
                                        : 'bg-cyan-500'
                            }`}
                          />
                          {sym}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="mt-1.5 pt-1.5 border-t border-white/[0.04]">
            <div className="text-[8px] text-white/25 uppercase tracking-wider mb-1">ACTIVE</div>
            <div className="flex items-center gap-2 px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/20">
              <TrendingUp size={10} className="text-cyan-400" />
              <span className="text-[10px] text-cyan-400 font-medium">{symbol}</span>
            </div>
          </div>
        </div>

        {/* AXE AI Assistant */}
        <div className="px-3 pb-2">
          <button onClick={onOpenChat} className="w-full relative overflow-hidden rounded-xl p-[1px] group" style={{ background: 'linear-gradient(135deg, #a3e635, #06b6d4, #8b5cf6)' }}>
            <div className="relative flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#111115]">
              <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border border-white/[0.1]">
                <img src="/assets/axe-logo.png" alt="AXE" className="w-full h-full object-cover" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-white/90">AXE</span>
                  <span className="text-[9px] text-transparent bg-clip-text font-semibold" style={{ backgroundImage: 'linear-gradient(135deg, #a3e635, #06b6d4)' }}>AI ASSISTANT</span>
                </div>
                <div className="flex items-center gap-1">
                  <Sparkles size={8} className="text-purple-400" />
                  <span className="text-[8px] text-white/30">Premium Feature</span>
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* User */}
        <div className="px-3 py-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-green-500 flex items-center justify-center">
              <span className="text-black font-bold text-xs">{displayName.slice(0, 1).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{displayName}</div>
              <div className="text-[10px] text-white/40 truncate">{userEmail ?? '—'}</div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="p-1 rounded-md hover:bg-white/[0.05]"
              title="Settings"
            >
              <Settings size={14} className="text-white/40 hover:text-white/70" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
