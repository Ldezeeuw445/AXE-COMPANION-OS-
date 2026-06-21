// ================================================================
// Small, pure format helpers — no runtime deps.
// ================================================================

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function fmtMw(mw) {
  if (mw == null || Number.isNaN(mw)) return '—';
  if (mw >= 1000) return (mw / 1000).toFixed(mw % 1000 === 0 ? 0 : 2) + ' GW';
  return mw.toFixed(0) + ' MW';
}

export function fmtUsd(m) {
  if (m == null || Number.isNaN(m)) return '—';
  if (m >= 1000) return '$' + (m / 1000).toFixed(m % 1000 === 0 ? 0 : 1) + 'B';
  return '$' + m.toFixed(0) + 'M';
}

export function fmtInt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

export function fmtYear(y) {
  if (y == null || Number.isNaN(y)) return '—';
  return String(y);
}

const STATUS_LABEL = {
  operational:        'OPERATIONAL',
  under_construction: 'UNDER CONSTRUCTION',
  announced:          'ANNOUNCED',
  planned:            'PLANNED',
};
export const statusLabel = (s) => STATUS_LABEL[s] || (s || '').toUpperCase();

const CATEGORY_LABEL = {
  stargate:    'STARGATE',
  hyperscaler: 'HYPERSCALER',
  neocloud:    'NEOCLOUD',
  sovereign:   'SOVEREIGN',
  independent: 'INDEPENDENT',
};
export const categoryLabel = (c) => CATEGORY_LABEL[c] || (c || '').toUpperCase();

/** Color tokens keyed by category. Match the CSS module. */
export const CATEGORY_COLOR = {
  stargate:    '#f5a524', // amber
  hyperscaler: '#4ea1ff', // blue
  neocloud:    '#b974ff', // violet
  sovereign:   '#1fbf75', // green
  independent: '#e5484d', // red
};
