/** Python FastAPI base URL without trailing slash (e.g. http://127.0.0.1:8000). */
export function getTradingTerminalBackendUrl(override?: string | null): string {
  const p = String(override ?? '')
    .trim()
    .replace(/\/$/, '');
  const v = String(import.meta.env.VITE_TRADING_TERMINAL_API_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  return p || v;
}

export function getTradingTerminalApiUrl(override?: string | null): string {
  const b = getTradingTerminalBackendUrl(override);
  return b ? `${b}/api` : '';
}

export function getTradingTerminalWsUrl(override?: string | null): string {
  const b = getTradingTerminalBackendUrl(override);
  if (!b) return '';
  return b.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
}
