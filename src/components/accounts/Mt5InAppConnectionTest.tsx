"use client";

import { useState } from "react";

type Props = {
  className?: string;
};

/**
 * Posts a single synthetic closed trade to axe-mt5-ingest from the browser (development verification).
 * CORS on the Edge function allows this — not a substitute for production EA/bridge fills.
 */
export function Mt5InAppConnectionTest({ className }: Props) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function runTest() {
    const trimmed = token.trim();
    if (!trimmed.startsWith("axe_")) {
      setMsg({ kind: "err", text: "Paste a token that starts with axe_ (as shown after Create link token)." });
      return;
    }
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
    if (!base) {
      setMsg({ kind: "err", text: "NEXT_PUBLIC_SUPABASE_URL is missing — cannot run test." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const extId = `axe_app_verify_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const res = await fetch(`${base}/functions/v1/axe-mt5-ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: trimmed,
          account_meta: { label: "AXE app verify" },
          trades: [
            {
              external_trade_id: extId,
              symbol: "XAUUSD",
              side: "buy",
              volume: 0.01,
              open_time: now,
              close_time: now,
              open_price: 3300,
              close_price: 3300,
              pnl: 0,
              fees: 0,
              raw: { source: "axe_companion_in_app_test" },
            },
          ],
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: { accepted?: number } };
      if (!res.ok || !json.ok) {
        setMsg({
          kind: "err",
          text: json.error ? `Server: ${json.error}` : `HTTP ${res.status} — check token and that axe-mt5-ingest is deployed.`,
        });
        return;
      }
      const accepted = json.data?.accepted ?? 0;
      setMsg({
        kind: "ok",
        text:
          accepted > 0
            ? "Connection works. This test trade is in your history — use the same URL in your EA/bridge for real fills."
            : "No trades accepted — check token validity and payload.",
      });
    } catch (e) {
      setMsg({
        kind: "err",
        text: e instanceof Error ? e.message : "Network error — try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <p className="inline-flex rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-200/95">
        Dev — synthetic trade
      </p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-tos-dim">Test in the app</p>
      <p className="mt-1 text-xs text-tos-muted">
        No MetaTrader plugin needed to <strong className="font-medium text-tos-text">verify</strong> your token.
        Paste the token below (save it somewhere safe first), tap Test — we send one minimal{" "}
        <strong className="text-tos-text">synthetic</strong> closed trade to the same ingest your EA will use (marked
        in <code className="text-[10px]">raw</code> for filtering).
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="axe_… (paste link token)"
          className="tos-neu-inset min-w-0 flex-1 rounded-2xl px-3 py-2.5 font-mono text-[11px] text-tos-text placeholder:text-tos-dim"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void runTest()}
          className="shrink-0 rounded-2xl border border-tos-warm/35 bg-tos-warm/12 px-4 py-2.5 text-xs font-semibold text-tos-warm hover:bg-tos-warm/20 disabled:opacity-50"
        >
          {busy ? "Working…" : "Test connection"}
        </button>
      </div>
      {msg ? (
        <p
          className={`mt-2 text-xs ${msg.kind === "ok" ? "text-emerald-300/95" : "text-red-300/95"}`}
          role="status"
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
