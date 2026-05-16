"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createCloudMt5ConnectionAction } from "@/app/actions/mt5Cloud";

const REGION_OPTIONS: Array<{
  value: "london" | "new-york" | "singapore";
  label: string;
  description: string;
}> = [
  { value: "london", label: "London", description: "Europe, Africa, Middle East" },
  { value: "new-york", label: "New York", description: "Americas — US, Canada, Latin America" },
  { value: "singapore", label: "Singapore", description: "Asia-Pacific — SG, HK, JP, AU, IN" },
];

function isValidRegion(r: string): r is "london" | "new-york" | "singapore" {
  return r === "london" || r === "new-york" || r === "singapore";
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <div className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="tos-btn-cyan w-full rounded-2xl py-3 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Starting secure MT5 connection…" : "Connect MT5 account"}
      </button>
      {pending ? (
        <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-2 text-[10.5px] leading-relaxed text-cyan-100/80">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.65)]" aria-hidden />
            <span className="font-semibold uppercase tracking-wider text-cyan-100">Secure provisioning active</span>
          </div>
          <p className="mt-1 text-cyan-100/70">
            AXE is asking MetaAPI to create the cloud terminal. If the broker is slow, the account still appears below
            and continues provisioning from there.
          </p>
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  /** Server-detected best default (Vercel geo header). User can override. */
  defaultRegion: string;
};

export function Mt5CloudConnectForm({ defaultRegion }: Props) {
  const router = useRouter();
  const [state, action] = useActionState(createCloudMt5ConnectionAction, undefined);
  const initialRegion = isValidRegion(defaultRegion) ? defaultRegion : "london";
  const [region, setRegion] = useState<typeof initialRegion>(initialRegion);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const err = state && !state.ok ? state : null;
  const ok = state?.ok ? state : null;
  const errorIsServerNotFound = err?.code === "mt5_server_not_found";
  const errorIsCreds = err?.code === "mt5_invalid_credentials";

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
          placeholder="Exact name from MT5 → File → Login to Trade Account"
          className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
          aria-invalid={errorIsServerNotFound ? "true" : undefined}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-tos-dim">
          Copy it exactly — capitals, dashes, suffixes (e.g. <span className="font-mono">ICMarketsSC-Live02</span>,{" "}
          <span className="font-mono">FTMO-Server2</span>,{" "}
          <span className="font-mono">Pepperstone-Live01</span>).
        </p>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-tos-dim" htmlFor="cloud-region">
          Region
        </label>
        <select
          id="cloud-region"
          name="region"
          value={region}
          onChange={(e) => setRegion(e.target.value as typeof region)}
          className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text"
        >
          {REGION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} — {opt.description}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-relaxed text-tos-dim">
          The MetaApi data center your terminal runs in. We&apos;ve pre-selected the closest one based on your
          connection — change it if your broker is hosted elsewhere.
        </p>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-tos-dim" htmlFor="cloud-inv-pw">
          MT5 read-only (investor) password
        </label>
        <input
          id="cloud-inv-pw"
          name="investorPassword"
          type="password"
          required
          autoComplete="new-password"
          className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text"
          aria-invalid={errorIsCreds ? "true" : undefined}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-tos-dim">
          Sent once to MetaApi over TLS. Never stored in Supabase or your browser.
        </p>
      </div>

      <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] p-3 text-[11px] leading-relaxed text-tos-muted">
        <p className="font-medium text-tos-text">What AXE needs</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/90">Login</p>
            <p className="mt-1 text-[10px] text-tos-dim">Digits only from MT5. No email or broker portal login.</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/90">Server</p>
            <p className="mt-1 text-[10px] text-tos-dim">Exact MT5 server string, including suffixes and dashes.</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/90">Password</p>
            <p className="mt-1 text-[10px] text-tos-dim">Investor/read-only password for account data.</p>
          </div>
        </div>
        <p className="mt-3 font-medium text-tos-text">What this connection does</p>
        <ul className="mt-1.5 space-y-1 text-[10.5px] text-tos-muted">
          <li>
            <span className="text-emerald-300/90">•</span> Streams your live chart, positions and account
            balance from your real MT5 terminal.
          </li>
          <li>
            <span className="text-emerald-300/90">•</span> Feeds AXE the same prices you trade on — no
            third-party data drift.
          </li>
          <li>
            <span className="text-emerald-300/90">•</span> Syncs your closed trades into the journal for
            review and AI critique.
          </li>
        </ul>
        <p className="mt-2 text-[10.5px] text-tos-dim">
          Order execution from the chart is opt-in and stays double-gated: enable{" "}
          <strong className="text-tos-text">Live Trading</strong> in Settings, then confirm every order in
          the chart modal. Nothing is ever placed automatically.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-tos-muted">
        <input type="checkbox" name="readOnlyConfirm" className="mt-0.5 rounded border-white/20" required />
        <span>
          I&apos;m using my <strong className="text-tos-text">read-only investor</strong> password and I
          understand AXE only places trades when I explicitly enable Live Trading and confirm each order.
        </span>
      </label>

      {err ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-3 text-[11px] text-red-200/95">
          <p className="font-medium text-red-100/95">Connection needs attention</p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-red-200/85">{err.message}</p>
          <div className="mt-2 rounded-xl border border-red-300/15 bg-black/20 px-2.5 py-2 text-[10.5px] leading-relaxed text-red-100/85">
            <p className="font-medium">Fast recovery path</p>
            <p className="mt-0.5 text-red-200/80">
              Keep the account page open, correct the highlighted field, then retry. If the row already exists below,
              run <span className="font-semibold text-red-100">Doctor</span> to see exactly which MetaAPI step is failing.
            </p>
          </div>
          {errorIsServerNotFound ? (
            <div className="mt-2 rounded-md bg-red-500/10 px-2 py-1.5 text-[10.5px] leading-relaxed text-red-100/90">
              <p className="font-medium">Server name fix</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-red-200/85">
                <li>Open MT5 → File → Login to Trade Account</li>
                <li>Copy the server string exactly (case-sensitive, includes dashes/numbers)</li>
                <li>
                  Some brokers register one server per region — try a different MetaApi region above if the
                  problem persists
                </li>
              </ol>
            </div>
          ) : null}
          {errorIsCreds ? (
            <div className="mt-2 rounded-md bg-red-500/10 px-2 py-1.5 text-[10.5px] leading-relaxed text-red-100/90">
              <p className="font-medium">Credentials fix</p>
              <p className="mt-0.5 text-red-200/85">
                Double-check the login (digits only) and your <strong>investor</strong> password — not the
                master password. In MT5: Tools → Options → Server → Change Password → check Investor.
              </p>
            </div>
          ) : null}
          <details className="mt-2 text-[10px] text-red-300/70">
            <summary className="cursor-pointer select-none text-red-300/90 hover:text-red-200">
              Technical details
            </summary>
            <p className="mt-1 font-mono text-[10px] break-all opacity-90">{err.code}</p>
          </details>
        </div>
      ) : null}

      {ok?.data?.accountId ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-3 text-[11px] leading-relaxed text-emerald-200/95">
          <p className="font-medium text-emerald-100/95">Connection requested</p>
          <p className="mt-1 text-[10.5px] text-emerald-200/85">
            Your MT5 terminal is starting up on MetaAPI. AXE will show provisioning progress below, then use
            Test, Sync, and Doctor to confirm broker data, positions, history and live prices.
          </p>
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
