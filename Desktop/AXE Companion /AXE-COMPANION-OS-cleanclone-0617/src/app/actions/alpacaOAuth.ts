import { loadAlpacaHub } from "../lib/broker/hub/adapters/AXE-COMPANION-OS-/src/lib/broker/adapterRegistry";

export async function exchangeAlpacaCodeAction(formData: FormData) {
  const code = formData.get('code');
  const state = formData.get('state');
  if (!code) throw new Error('Missing OAuth code');

  const hub = await loadAlpacaHub();
  if (!hub) throw new Error('Alpaca hub not available');
  if (typeof hub.exchangeOAuthCode !== 'function') throw new Error('Alpaca hub does not support OAuth exchange in this build');

  // Pass through code and optional redirectUri/state if provided
  const input = {
    broker: 'alpaca',
    code: String(code),
    state: state ? String(state) : undefined,
    // additional fields could be added: userId, environment, redirectUri
  };

  return hub.exchangeOAuthCode(input);
}
