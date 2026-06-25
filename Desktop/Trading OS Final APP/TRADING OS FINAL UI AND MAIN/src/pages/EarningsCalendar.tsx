import { useState, useEffect } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { earnings } from '../lib/engineAdapter';
import type { EarningsEvent } from '../lib/engineAdapter';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function EarningsCalendar() {
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [modal, setModal] = useState<EarningsEvent | null>(null);

  useEffect(() => {
    const from = new Date().toISOString().split('T')[0];
    const to = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    earnings(from, to).then(setEvents);
  }, []);

  const byDay: Record<string, EarningsEvent[]> = {};
  DAYS.forEach(d => byDay[d] = []);
  events.forEach((e, i) => { const day = DAYS[i % 5]; byDay[day].push(e); });

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-cyan-400" />
          <span className="text-[10px] text-white/40 px-1.5 py-0.5 bg-white/5 rounded">EARNINGS</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setView('week')} className={`symbol-tag text-[8px] ${view === 'week' ? 'active' : ''}`}>Week</button>
          <button onClick={() => setView('month')} className={`symbol-tag text-[8px] ${view === 'month' ? 'active' : ''}`}>Month</button>
        </div>
      </div>

      <div className="border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-[10px] text-emerald-200/90">
        Live: `earnings()` now routes through <span className="font-mono text-emerald-200/80">getTradingAdapter().getEarningsCalendar</span> (FMP via engine-proxy).
      </div>

      <div className="p-4">
        <div className="grid grid-cols-5 gap-2">
          {DAYS.map(day => (
            <div key={day} className="tos-card rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between">
                <span className="tos-block-title">{day.toUpperCase()}</span>
                <span className="text-[9px] text-white/30">{byDay[day].length}</span>
              </div>
              <div className="p-2 space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar">
                {byDay[day].map((e, i) => (
                  <div key={i} onClick={() => setModal(e)} className="p-2 rounded bg-white/[0.02] border border-white/[0.03] hover:border-white/[0.08] cursor-pointer transition-all group">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/80 group-hover:text-cyan-400 transition-colors">{e.ticker}</span>
                      <div className="flex items-center gap-1">
                        <Clock size={7} className="text-white/20" />
                        <span className="text-[8px] text-white/30">{e.time}</span>
                      </div>
                    </div>
                    <div className="text-[8px] text-white/35 mt-0.5">{e.company}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {e.epsEstimate && <span className="text-[8px] text-white/40">EPS ${e.epsEstimate.toFixed(2)}</span>}
                      <span className={`text-[7px] px-1 py-0.5 rounded font-bold ${e.impact === 'high' ? 'bg-red-500/15 text-red-400' : e.impact === 'medium' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-white/[0.05] text-white/30'}`}>{e.impact}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-[#0f0f0f] border border-white/10 rounded-lg p-4 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-white/90">{modal.ticker}</span>
              <button onClick={() => setModal(null)} className="text-white/30 hover:text-white/60 text-xs">Close</button>
            </div>
            <div className="text-[10px] text-white/50 mb-3">{modal.company} · {modal.sector}</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="stat-box"><div className="stat-label">EPS EST</div><div className="stat-value">${modal.epsEstimate?.toFixed(2) || '—'}</div></div>
              <div className="stat-box"><div className="stat-label">REV EST</div><div className="stat-value">${(modal.revenueEstimate ? modal.revenueEstimate / 1e9 : 0).toFixed(1)}B</div></div>
              <div className="stat-box"><div className="stat-label">SURPRISE</div><div className={`stat-value ${(modal.epsSurprise || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{modal.epsSurprise ? (modal.epsSurprise > 0 ? '+' : '') + modal.epsSurprise.toFixed(2) : '—'}</div></div>
              <div className="stat-box"><div className="stat-label">IMPACT</div><div className={`text-xs font-bold ${modal.impact === 'high' ? 'text-red-400' : modal.impact === 'medium' ? 'text-yellow-400' : 'text-white/40'}`}>{modal.impact.toUpperCase()}</div></div>
            </div>
            <div className="text-[9px] text-white/30">Time: {modal.time} · Date: {modal.date}</div>
          </div>
        </div>
      )}
    </div>
  );
}
