// ================================================================
// Small display helpers — no deps.
// ================================================================

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** "in 2h 14m" | "in 3d 04h" | "-12m ago" */
export function relativeTime(iso, now = Date.now()) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = t - now;
  const abs = Math.abs(diff);
  const sign = diff >= 0 ? 'in ' : '-';
  const suffix = diff >= 0 ? '' : ' ago';
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return sign + mins + 'm' + suffix;
  const hours = Math.floor(mins / 60);
  const rm = mins % 60;
  if (hours < 24) return sign + hours + 'h ' + String(rm).padStart(2, '0') + 'm' + suffix;
  const days = Math.floor(hours / 24);
  const rh = hours % 24;
  return sign + days + 'd ' + String(rh).padStart(2, '0') + 'h' + suffix;
}

/** "20:00 UTC · Wed Apr 22" */
export function absoluteClock(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

export const CATALYST_COLOR = {
  earnings: '#4ea1ff',
  macro:    '#f5a524',
  fed:      '#e5484d',
  economic: '#b974ff',
  ipo:      '#1fbf75',
  dividend: '#9aa0a6',
  custom:   '#9aa0a6',
};

export const ALERT_CATEGORY_COLOR = {
  price:          '#4ea1ff',
  technical:      '#b974ff',
  volume:         '#f5a524',
  short_interest: '#e5484d',
  options:        '#1fbf75',
  news:           '#9aa0a6',
  macro:          '#e5484d',
};

export const ALERT_CATEGORY_LABEL = {
  price:          'PRICE',
  technical:      'TECHNICAL',
  volume:         'VOLUME',
  short_interest: 'SHORT',
  options:        'OPTIONS',
  news:           'NEWS',
  macro:          'MACRO',
};
