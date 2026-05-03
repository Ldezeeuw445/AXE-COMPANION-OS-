// ================================================================
// Format helpers — ported from v2 vanilla app.js
// ================================================================

export const fmtNum = (n, d = 2) => {
  if (n == null || Number.isNaN(+n)) return '—';
  const v = +n;
  if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (Math.abs(v) >= 1e9)  return (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6)  return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3)  return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(d);
};

export const fmtPrice = (n) =>
  n == null
    ? '—'
    : (+n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPct = (n) =>
  n == null ? '—' : (n >= 0 ? '+' : '') + (+n).toFixed(2) + '%';

export const hhmm = (iso) => {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d)) return '--:--';
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
};

export const ago = (iso) => {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return s + 's';
  if (s < 3600)  return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
};

// Tiny classnames helper — avoids adding a dep
export const cx = (...args) => args.filter(Boolean).join(' ');
