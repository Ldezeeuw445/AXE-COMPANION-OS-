import { useEffect, useMemo, useState } from 'react';

type SessionStatus = 'open' | 'opening-soon' | 'closed';

const sessions = [
  { code: 'SYD', city: 'Sydney', tz: 'Australia/Sydney' },
  { code: 'TYO', city: 'Tokyo', tz: 'Asia/Tokyo' },
  { code: 'LDN', city: 'London', tz: 'Europe/London' },
  { code: 'NYC', city: 'New York', tz: 'America/New_York' },
] as const;

function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}

function fmtTime(ts: number, timeZone: string, withSeconds = false) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(new Date(ts));
}

function tzOffsetLabel(timeZone: string) {
  // Returns e.g. "GMT+2" / "GMT-4"
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value;
  return parts ?? timeZone;
}

function statusForLocalHour(hour: number): SessionStatus {
  // Simple, UI-friendly heuristic: open during local 08:00–17:00,
  // opening soon within 60m, otherwise closed.
  if (hour >= 8 && hour < 17) return 'open';
  if (hour === 7) return 'opening-soon';
  return 'closed';
}

export default function SessionBar() {
  const now = useNow(1000);
  const localTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  const localTime = useMemo(() => fmtTime(now, localTz, true), [now, localTz]);
  const localOffset = useMemo(() => tzOffsetLabel(localTz), [localTz]);

  const [active, setActive] = useState<(typeof sessions)[number]['code']>('LDN');

  const sessionUi = useMemo(() => {
    return sessions.map((s) => {
      const time = fmtTime(now, s.tz, false);
      const hour = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: s.tz, hour: '2-digit', hour12: false }).format(
          new Date(now),
        ),
      );
      const status = statusForLocalHour(Number.isFinite(hour) ? hour : 0);
      return { ...s, time, status };
    });
  }, [now]);

  return (
    <div className="h-8 flex items-center px-3 border-b border-white/[0.04] bg-gradient-to-b from-[rgba(15,15,15,0.98)] to-[rgba(10,10,10,0.98)] backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-2 px-3 border-r border-white/5">
        <div className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
        </div>
        <span className="text-[10px] text-white/60 font-medium tabular-nums">{localTime}</span>
        <span className="text-[10px] text-white/30">{localOffset}</span>
      </div>
      <div className="flex flex-1">
        {sessionUi.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => setActive(s.code)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 border-r border-white/5 transition-colors ${
              active === s.code ? 'bg-white/[0.03]' : 'bg-transparent hover:bg-white/[0.02]'
            } ${
              s.status === 'open'
                ? 'shadow-[0_0_15px_rgba(34,197,94,0.25)] border-green-500/30'
                : s.status === 'opening-soon'
                  ? 'shadow-[0_0_15px_rgba(234,179,8,0.18)] border-yellow-500/30'
                  : ''
            }`}
            aria-pressed={active === s.code}
            title={`${s.city} (${s.tz})`}
          >
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                s.status === 'open'
                  ? 'border-green-500/50'
                  : s.status === 'opening-soon'
                  ? 'border-yellow-500/50'
                  : 'border-white/20'
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  s.status === 'open'
                    ? 'bg-[#22c55e] shadow-[0_0_6px_#22c55e]'
                    : s.status === 'opening-soon'
                    ? 'bg-[#eab308] shadow-[0_0_6px_#eab308]'
                    : 'bg-white/20'
                }`}
              />
            </div>
            <span className="text-[10px] font-semibold text-white/80 tracking-wide">{s.code}</span>
            <span
              className={`text-[9px] ${
                s.status === 'open'
                  ? 'text-green-400'
                  : s.status === 'opening-soon'
                  ? 'text-yellow-400'
                  : 'text-white/40'
              }`}
            >
              {s.status === 'open' ? 'Open' : s.status === 'opening-soon' ? 'Opening soon' : 'Closed'}
            </span>
            <span className="text-[9px] text-white/40 tabular-nums">{s.time}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
