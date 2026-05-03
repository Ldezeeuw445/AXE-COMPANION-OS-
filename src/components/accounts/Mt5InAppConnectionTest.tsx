"use client";

import { useState } from "react";

type Props = {
  className?: string;
};

/**
 * Posts a single dummy closed trade to axe-mt5-ingest from the browser.
 * CORS on the Edge function allows this — no curl or EA required to verify the token works.
 */
export function Mt5InAppConnectionTest({ className }: Props) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function runTest() {
    const trimmed = token.trim();
    if (!trimmed.startsWith("axe_")) {
      setMsg({ kind: "err", text: "Plak een token die begint met axe_ (zoals na ‘Create link token’)." });
      return;
    }
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
    if (!base) {
      setMsg({ kind: "err", text: "NEXT_PUBLIC_SUPABASE_URL ontbreekt — verbinding testen kan niet." });
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
          text: json.error ? `Server: ${json.error}` : `HTTP ${res.status} — controleer token en of de functie axe-mt5-ingest live staat.`,
        });
        return;
      }
      const accepted = json.data?.accepted ?? 0;
      setMsg({
        kind: "ok",
        text:
          accepted > 0
            ? "Verbinding werkt. Deze testtrade staat in je geschiedenis — je kunt nu je EA/bridge dezelfde URL laten gebruiken voor echte fills."
            : "Geen trades geaccepteerd — controleer of het token nog geldig is en of er minstens één trade in de payload zit.",
      });
    } catch (e) {
      setMsg({
        kind: "err",
        text: e instanceof Error ? e.message : "Netwerkfout — probeer opnieuw of test op wifi.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-tos-dim">In de app testen</p>
      <p className="mt-1 text-xs text-tos-muted">
        Geen MetaTrader-plugin nodig om te <strong className="font-medium text-tos-text">controleren</strong> of je
        token werkt. Plak hieronder de token (bewaar hem eerst ergens veilig), tik op test — we sturen één minimale
        testtrade naar dezelfde ingest als je EA later gebruikt.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="axe_… (plak je link-token)"
          className="tos-neu-inset min-w-0 flex-1 rounded-2xl px-3 py-2.5 font-mono text-[11px] text-tos-text placeholder:text-tos-dim"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void runTest()}
          className="shrink-0 rounded-2xl border border-tos-warm/35 bg-tos-warm/12 px-4 py-2.5 text-xs font-semibold text-tos-warm hover:bg-tos-warm/20 disabled:opacity-50"
        >
          {busy ? "Bezig…" : "Test verbinding"}
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
