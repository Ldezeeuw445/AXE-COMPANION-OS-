"use client";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseKey } from "@/lib/env";
import {
  extractHandoffCode,
  handoffRedirectUri,
  validateHandoffRedirect,
  validateNextPath,
} from "./handoffCore";

const allowLocalhost = () => process.env.NEXT_PUBLIC_AUTH_HANDOFF_ALLOW_LOCALHOST === "true";

async function invoke(body: Record<string, unknown>, jwt?: string | null) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = getSupabaseKey() ?? "";
  if (!base || !key) return { ok: false, data: { error: "supabase_not_configured" } as Record<string, unknown> };
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/functions/v1/auth-handoff`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "omit",
      cache: "no-store",
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = { error: `auth_handoff_http_${res.status}` };
    }
    return { ok: res.ok && data.ok === true, data };
  } catch {
    return { ok: false, data: { error: "network" } as Record<string, unknown> };
  }
}

/** Remove the one-time code from the address bar and history immediately. */
export function stripHandoffFromHistory(): void {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("c");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

export async function consumeHandoff(loc: { hash: string; search: string; origin: string }) {
  const nextPath = validateNextPath(new URLSearchParams(loc.search.replace(/^\?/, "")).get("next"));
  const code = extractHandoffCode(loc.hash, loc.search);
  if (!code) return { ok: false as const, error: "missing_code", nextPath };
  const redirectUri = handoffRedirectUri(loc.origin);
  const check = validateHandoffRedirect(redirectUri, { allowLocalhost: allowLocalhost() });
  if (!check.ok) return { ok: false as const, error: check.error, nextPath };
  const ex = await invoke({ action: "exchange", code, redirectUri });
  const tokenHash = typeof ex.data.token_hash === "string" ? ex.data.token_hash : "";
  if (!ex.ok || !tokenHash) return { ok: false as const, error: String(ex.data.error ?? "exchange_failed"), nextPath };
  const { error } = await createClient().auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) return { ok: false as const, error: "verify_failed", nextPath };
  return { ok: true as const, nextPath };
}

/**
 * Reverse direction: open Trading OS already signed in. Falls back to a plain
 * link when there is no session or minting fails.
 */
export async function openWithHandoff(targetOrigin: string, nextPath = "/"): Promise<void> {
  const fallback = `${targetOrigin.replace(/\/+$/, "")}${validateNextPath(nextPath)}`;
  try {
    const redirectUri = handoffRedirectUri(targetOrigin);
    if (!validateHandoffRedirect(redirectUri, { allowLocalhost: allowLocalhost() }).ok) {
      window.location.assign(fallback);
      return;
    }
    const { data } = await createClient().auth.getSession();
    const jwt = data.session?.access_token;
    if (!jwt) {
      window.location.assign(fallback);
      return;
    }
    const minted = await invoke({ action: "mint", redirectUri, nextPath: validateNextPath(nextPath) }, jwt);
    const consumeUrl = typeof minted.data.consumeUrl === "string" ? minted.data.consumeUrl : "";
    if (minted.ok && consumeUrl && validateHandoffRedirect(consumeUrl.split("#")[0].split("?")[0], { allowLocalhost: allowLocalhost() }).ok) {
      window.location.assign(consumeUrl);
      return;
    }
  } catch {
    /* fall through */
  }
  window.location.assign(fallback);
}
