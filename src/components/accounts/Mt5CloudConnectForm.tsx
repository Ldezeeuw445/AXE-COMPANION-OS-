"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createCloudMt5ConnectionAction } from "@/app/actions/mt5Cloud";

export function Mt5CloudConnectForm() {
  const router = useRouter();
  const [state, action] = useActionState(createCloudMt5ConnectionAction, undefined);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const err = state && !state.ok ? state : null;
  const ok = state?.ok ? state : null;

  return (
    <form action={action} className="mt-4 space-y-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-tos-dim" htmlFor="cloud-label">
          Label
        </label>
        <input
          id="cloud-label"
          name="label"
          required
          placeholder="e.g. Main FTMO"
          className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-tos-dim" htmlFor="cloud-login">
          MT5 login (digits)
        </label>
        <input
          id="cloud-login"
          name="mt5Login"
          required
          inputMode="numeric"
          autoComplete="off"
          className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-tos-dim" htmlFor="cloud-server">
          MT5 server
        </label>
        <input
          id="cloud-server"
          name="mt5Server"
          required
          placeholder="Exact name from MT5 login dialog"
          className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-tos-dim" htmlFor="cloud-inv-pw">
          Investor / read-only password
        </label>
        <input
          id="cloud-inv-pw"
          name="investorPassword"
          type="password"
          required
          autoComplete="new-password"
          className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text"
        />
        <p className="mt-1 text-[10px] text-tos-dim">
          Sent once to MetaApi over HTTPS. Never stored in Supabase or browser storage.
        </p>
      </div>
      <input type="hidden" name="region" value="london" />
      <p className="text-[10px] text-tos-dim">MetaApi region is fixed to London for this app build.</p>
      <label className="flex cursor-pointer items-start gap-2 text-[11px] text-tos-muted">
        <input type="checkbox" name="readOnlyConfirm" className="mt-0.5 rounded border-white/20" required />
        <span>
          I confirm I am using the <strong className="text-tos-text">investor (read-only)</strong> password. AXE does
          not place trades from this flow.
        </span>
      </label>
      {err ? (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200">
          <span className="font-mono text-[10px] text-red-300/90">{err.code}</span>
          {" — "}
          {err.message}
        </p>
      ) : null}
      {ok?.data?.accountId ? (
        <p className="text-[11px] text-emerald-300/90">
          Account row created. Use <strong className="text-tos-text">Test</strong> then <strong className="text-tos-text">Sync</strong> on the card below.
        </p>
      ) : null}
      <button
        type="submit"
        className="tos-btn-cyan w-full rounded-2xl py-3 text-sm font-semibold disabled:opacity-50"
      >
        Connect MT5 (MetaApi cloud)
      </button>
    </form>
  );
}
