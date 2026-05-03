import React, { useState, useMemo } from 'react';
import { Skeleton } from './ui/skeleton';

const CalendarPanel = ({ events, loading }) => {
  const [impactFilter, setImpactFilter] = useState('all');

  const filteredEvents = useMemo(() => {
    if (!events?.length) return [];
    if (impactFilter === 'all') return events;
    return events.filter(e => e.impact === impactFilter);
  }, [events, impactFilter]);

  if (loading) {
    return (
      <div className="p-3 space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-white/5" />
        ))}
      </div>
    );
  }

  if (!events?.length) {
    return <div className="p-3 text-center text-white/25 text-[10px]">No upcoming events</div>;
  }

  const getImpactBadge = (impact) => {
    const classes = { high: 'impact-high', medium: 'impact-medium', low: 'impact-low' };
    return <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${classes[impact] || classes.low}`}>{impact}</span>;
  };

  const getCountryFlag = (country) => {
    const flags = { US: '\u{1F1FA}\u{1F1F8}', EU: '\u{1F1EA}\u{1F1FA}', GB: '\u{1F1EC}\u{1F1E7}', JP: '\u{1F1EF}\u{1F1F5}', AU: '\u{1F1E6}\u{1F1FA}', CA: '\u{1F1E8}\u{1F1E6}', CH: '\u{1F1E8}\u{1F1ED}', NZ: '\u{1F1F3}\u{1F1FF}', CN: '\u{1F1E8}\u{1F1F3}' };
    return flags[country] || country;
  };

  const formatDate = (dateString) => {
    try { return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return dateString; }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Impact filter buttons */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.03]">
        {['all', 'high', 'medium', 'low'].map(f => (
          <button
            key={f}
            onClick={() => setImpactFilter(f)}
            className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all ${
              impactFilter === f
                ? f === 'high' ? 'bg-[#ef4444]/15 text-[#ef4444]'
                  : f === 'medium' ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
                  : f === 'low' ? 'bg-white/5 text-white/50'
                  : 'bg-white/10 text-white'
                : 'text-white/20 hover:text-white/50'
            }`}
            data-testid={`calendar-filter-${f}`}
          >
            {f}
          </button>
        ))}
        <span className="text-[8px] text-white/15 ml-auto font-mono">{filteredEvents.length}</span>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-0.5">
          {filteredEvents.slice(0, 12).map((event, index) => (
            <div key={index} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/[0.02] transition-colors" data-testid={`calendar-event-${index}`}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[11px] flex-shrink-0">{getCountryFlag(event.country)}</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-white/70 truncate">{event.event}</span>
                  <div className="flex items-center gap-1.5 text-[9px] text-white/25 font-mono">
                    <span>{formatDate(event.date)}</span>
                    {event.time && <span>{event.time}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {event.forecast && <span className="text-[9px] font-mono text-white/25">F: {event.forecast}</span>}
                {getImpactBadge(event.impact)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarPanel;
