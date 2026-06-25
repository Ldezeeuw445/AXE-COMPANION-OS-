// ================================================================
// Format helpers (subset that mirrors the news module)
// ================================================================

export function cx(...args) {
  return args.filter(Boolean).join(' ');
}

export function fmtPrice(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(digits)}%`;
}

export function fmtNum(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3)  return (n / 1e3).toFixed(2) + 'K';
  return Number(n).toFixed(digits);
}

export function hhmm(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ago(ts) {
  if (!ts) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** Clamp a number between min and max */
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
