import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Keys held in AXE Core's keystore, loaded into this process at boot.
 *
 * Keys were scattered — some in this box's .env.local, some in AXE Core's env
 * on the same box, some in Supabase Edge secrets, several present but empty
 * after the move off Vercel, and nobody could see the whole set at once. The
 * registry lives in Supabase (`axe_ops.app_secret`, values in Vault) so AXE
 * Core can manage every app's keys from one screen.
 *
 * Loading them into `process.env` rather than threading a store through the
 * app is deliberate: every existing getter — getMetaApiToken, getPerigonKey,
 * the Stripe reads — keeps working untouched, and env still wins, so a value
 * set on the box overrides the keystore rather than fighting it.
 *
 * Two things cannot come from here, by nature:
 *  - the bootstrap keys, because they are what opens the keystore:
 *    NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET;
 *  - anything NEXT_PUBLIC_*, which Next inlines into the browser bundle at
 *    build time and therefore cannot be supplied at runtime.
 */

const APP = "companion";

/** Never accept these from the keystore, whatever it contains. */
function isLoadable(key: string): boolean {
  if (key.startsWith("NEXT_PUBLIC_")) return false;
  return key !== "SUPABASE_SERVICE_ROLE_KEY" && key !== "CRON_SECRET";
}

export type KeystoreLoadResult = {
  applied: string[];
  skippedEnvWins: string[];
  skippedNotLoadable: string[];
  error?: string;
};

export async function loadKeystoreIntoEnv(): Promise<KeystoreLoadResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE?.trim();

  if (!url || !serviceKey) {
    return {
      applied: [],
      skippedEnvWins: [],
      skippedNotLoadable: [],
      error: "supabase_not_configured",
    };
  }

  const applied: string[] = [];
  const skippedEnvWins: string[] = [];
  const skippedNotLoadable: string[] = [];

  try {
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    // PostgREST only exposes `public`; the wrapper is granted to service_role only.
    const { data, error } = await supabase.rpc("axe_get_app_secrets", { p_app: APP });
    if (error) {
      return { applied, skippedEnvWins, skippedNotLoadable, error: error.message };
    }

    for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
      const key = (row.key ?? "").trim();
      const value = row.value ?? "";
      if (!key || !value) continue;
      if (!isLoadable(key)) {
        skippedNotLoadable.push(key);
        continue;
      }
      // An empty env var is not a value: that exact case is why MT5 switched
      // itself off silently after the Vercel move.
      if ((process.env[key] ?? "").trim()) {
        skippedEnvWins.push(key);
        continue;
      }
      process.env[key] = value;
      applied.push(key);
    }
  } catch (e) {
    return {
      applied,
      skippedEnvWins,
      skippedNotLoadable,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { applied, skippedEnvWins, skippedNotLoadable };
}
