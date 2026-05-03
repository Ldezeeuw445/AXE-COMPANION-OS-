import { supabase } from '@/lib/supabase';
import type { CloudMt5ConnectionResult } from '@/engine/types/broker';

/**
 * Calls Edge `axe-mt5-cloud` with the current user JWT (never put MT5 secrets in localStorage).
 * MetaApi / provider token stays only on the Edge function.
 */
export async function invokeAxeMt5Cloud(body: Record<string, unknown>): Promise<CloudMt5ConnectionResult> {
  const { data, error } = await supabase.functions.invoke<CloudMt5ConnectionResult>('axe-mt5-cloud', { body });
  if (error) {
    return { ok: false, code: 'invoke_error', message: error.message ?? String(error) };
  }
  if (data && typeof data === 'object' && 'ok' in data) {
    return data as CloudMt5ConnectionResult;
  }
  return { ok: false, code: 'invalid_response', message: 'Unexpected response from axe-mt5-cloud.' };
}
