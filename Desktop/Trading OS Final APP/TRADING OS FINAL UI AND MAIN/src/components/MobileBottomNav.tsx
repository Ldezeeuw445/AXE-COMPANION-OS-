import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Newspaper, Target, TrendingUp,
  Menu, X,
  PieChart, Flame, ScanLine, FlaskConical, Globe,
  Cpu, Calendar, MapPin, Sparkles, MessageSquare,
  BookOpen,
} from 'lucide-react';

const mainItems = [
  { icon: LayoutDashboard, label: 'Main', path: '/' },
  { icon: TrendingUp, label: 'Chart', path: '/chart' },
  { icon: Newspaper, label: 'News', path: '/news' },
  { icon: Target, label: 'Intel', path: '/intel' },
];

const moreItems = [
  { icon: BookOpen, label: 'Journal', path: '/journal' },
  { icon: PieChart, label: 'Analyses', path: '/analyses' },
  { icon: Flame, label: 'Heatmap', path: '/heatmap' },
  { icon: ScanLine, label: 'Scanner', path: '/market-scanner' },
  { icon: FlaskConical, label: 'QuantLab', path: '/quantlab' },
  { icon: Globe, label: 'Macro', path: '/macro-terminal' },
  { icon: Cpu, label: 'BigMac', path: '/bigmac-index' },
  { icon: TrendingUp, label: 'Polymarket', path: '/polymarket-intel' },
  { icon: Calendar, label: 'Earnings', path: '/earnings-calendar' },
  { icon: MapPin, label: 'AI Centers', path: '/ai-data-center-map' },
  { icon: Sparkles, label: 'AXE Companion', path: '/axe-companion' },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[90] bg-[#0c0c0c]/95 backdrop-blur-xl border-t border-white/[0.06] safe-area-pb">
        <div className="flex items-center justify-around py-1">
          {mainItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all ${
                isActive(item.path)
                  ? 'text-[#06b6d4]'
                  : 'text-white/30 active:text-white/60'
              }`}
            >
              <item.icon size={20} strokeWidth={isActive(item.path) ? 2.5 : 1.5} />
              <span className={`text-[9px] ${isActive(item.path) ? 'font-semibold' : 'font-normal'}`}>
                {item.label}
              </span>
              {isActive(item.path) && (
                <span className="absolute -top-px w-5 h-[2px] bg-[#06b6d4] rounded-full" />
              )}
            </button>
          ))}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all ${
              moreOpen
                ? 'text-[#06b6d4]'
                : 'text-white/30 active:text-white/60'
            }`}
          >
            <Menu size={20} strokeWidth={moreOpen ? 2.5 : 1.5} />
            <span className="text-[9px]">More</span>
            {moreOpen && (
              <span className="absolute -top-px w-5 h-[2px] bg-[#06b6d4] rounded-full" />
            )}
          </button>
        </div>
      </nav>

      {/* More Sheet / Drawer */}
      {moreOpen && (
        <div className="fixed inset-0 z-[95]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />

          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-[#0f0f12] border-t border-white/[0.08] rounded-t-2xl shadow-2xl shadow-black/50 safe-area-pb animate-slide-up">
            {/* Handle bar */}
            <div className="flex items-center justify-center pt-2 pb-1">
              <div className="w-8 h-1 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-xs font-semibold text-white/60">All Pages</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/40 hover:text-white/70"
              >
                <X size={14} />
              </button>
            </div>

            {/* Grid of all pages */}
            <div className="grid grid-cols-4 gap-2 px-4 pb-4">
              {/* Main tabs also shown here for easy access */}
              {mainItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMoreOpen(false); }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                    isActive(item.path)
                      ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400'
                      : 'bg-white/[0.03] border border-transparent text-white/50 active:bg-white/[0.06]'
                  }`}
                >
                  <item.icon size={18} strokeWidth={isActive(item.path) ? 2.5 : 1.5} />
                  <span className="text-[9px] font-medium text-center leading-tight">{item.label}</span>
                </button>
              ))}

              {/* Divider / separator */}
              <div className="col-span-4 h-px bg-white/[0.04] my-1" />

              {/* More pages */}
              {moreItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMoreOpen(false); }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                    isActive(item.path)
                      ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400'
                      : 'bg-white/[0.03] border border-transparent text-white/50 active:bg-white/[0.06]'
                  }`}
                >
                  <item.icon size={18} strokeWidth={isActive(item.path) ? 2.5 : 1.5} />
                  <span className="text-[9px] font-medium text-center leading-tight">{item.label}</span>
                </button>
              ))}
            </div>

            {/* Quick Chat button */}
            <div className="px-4 pb-3">
              <button
                onClick={() => { setMoreOpen(false); /* TODO: Open chat */ }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 text-white/60"
              >
                <MessageSquare size={14} className="text-purple-400" />
                <span className="text-[10px] font-medium">Open AXE Chat</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
