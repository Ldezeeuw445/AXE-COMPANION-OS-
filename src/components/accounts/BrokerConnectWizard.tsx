"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, Wifi } from "lucide-react";
import { createCloudMt5ConnectionAction } from "@/app/actions/mt5Cloud";
import { BrokerSupportCheck } from "@/components/accounts/BrokerSupportCheck";
import { MetaApiComplianceCheckboxes } from "@/components/legal/MetaApiComplianceCheckboxes";
import { lookupBrokerSupport } from "@/lib/mt5/knownBrokers";

type WizardStep = 1 | 2 | 3;

function isValidRegion(r: string): r is "london" | "new-york" | "singapore" {
  return r === "london" || r === "new-york" || r === "singapore";
}

const REGION_OPTIONS = [
  { value: "london" as const, label: "London", hint: "EU / ME / Africa" },
  { value: "new-york" as const, label: "New York", hint: "Americas" },
  { value: "singapore" as const, label: "Singapore", hint: "Asia-Pacific" },
];

export function BrokerConnectWizard({ defaultRegion }: { defaultRegion: string }) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [server, setServer] = useState("");
  const [region, setRegion] = useState<"london" | "new-york" | "singapore">(
    isValidRegion(defaultRegion) ? defaultRegion : "london",
  );
  const [passwordType, setPasswordType] = useState<"investor" | "master">("investor");
  const [state, action] = useActionState(createCloudMt5ConnectionAction, undefined);

  useEffect(() => {
    if (state?.ok) {
      setStep(3);
      router.refresh();
    }
  }, [state, router]);

  const err = state && !state.ok ? state : null;
  const support = lookupBrokerSupport(server);
  const canContinue = Boolean(server.trim()) && support?.kind !== "unsupported";

  function resetWizard() {
    setStep(1);
    setServer("");
  }

  return (
    <div
      data-testid="broker-connect"
      className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-transparent p-5"
    >
      <div className="mb-5 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                s === step
                  ? "bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/30"
                  : s < step
                    ? "bg-emerald-400/15 text-emerald-300/80"
                    : "bg-white/[0.04] text-white/20"
              }`}
            >
              {s < step ? "✓" : s}
            </div>
            {s < 3 && (
              <div
                className={`h-px w-8 transition-colors ${
                  s < step ? "bg-emerald-400/30" : "bg-white/[0.06]"
                }`}
              />
            )}
          </div>
        ))}
        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
          {step === 1 ? "Server" : step === 2 ? "Login" : "Done"}
        </span>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Which MT5 server?</h3>
            <p className="mt-1 text-[11px] text-white/40">
              Type or pick a broker. AXE checks the name only — no login is sent yet.
            </p>
          </div>

          <BrokerSupportCheck value={server} onChange={setServer} />

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/30" htmlFor="wiz-region">
              Region
            </label>
            <div className="mt-1.5 flex gap-2">
              {REGION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRegion(opt.value)}
                  className={`flex-1 rounded-xl border px-2 py-2 text-center transition-all ${
                    region === opt.value
                      ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-200"
                      : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:border-white/[0.10]"
                  }`}
                >
                  <span className="block text-[11px] font-semibold">{opt.label}</span>
                  <span className="block text-[9px] opacity-60">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            data-testid="broker-connect-next"
            disabled={!canContinue}
            onClick={() => setStep(2)}
            className="tos-btn-cyan w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-30"
          >
            Next — Login details
          </button>
        </div>
      )}

      {step === 2 && (
        <form action={action} className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/60"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <div>
              <h3 className="text-sm font-semibold text-white">Login credentials</h3>
              <p className="text-[10px] text-white/30">
                Server: <span className="font-mono text-white/50">{server}</span>
              </p>
            </div>
          </div>

          <input type="hidden" name="mt5Server" value={server} />
          <input type="hidden" name="region" value={region} />
          <input type="hidden" name="passwordType" value={passwordType} />

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
              Password type
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPasswordType("investor")}
                className={`rounded-xl border px-2 py-2.5 text-left transition-all ${
                  passwordType === "investor"
                    ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-100"
                    : "border-white/[0.06] bg-white/[0.02] text-white/45 hover:border-white/[0.10]"
                }`}
              >
                <span className="block text-[11px] font-semibold">Investor</span>
                <span className="block text-[9px] opacity-70">Read-only · recommended</span>
              </button>
              <button
                type="button"
                onClick={() => setPasswordType("master")}
                className={`rounded-xl border px-2 py-2.5 text-left transition-all ${
                  passwordType === "master"
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                    : "border-white/[0.06] bg-white/[0.02] text-white/45 hover:border-white/[0.10]"
                }`}
              >
                <span className="block text-[11px] font-semibold">Master</span>
                <span className="block text-[9px] opacity-70">Full trading access</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/30" htmlFor="wiz-label">
              Account label
            </label>
            <input
              id="wiz-label"
              name="label"
              required
              placeholder="e.g. Main FTMO"
              className="tos-neu-inset mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/30" htmlFor="wiz-login">
              MT5 login (digits)
            </label>
            <input
              id="wiz-login"
              name="mt5Login"
              required
              inputMode="numeric"
              autoComplete="off"
              className="tos-neu-inset mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/30" htmlFor="wiz-password">
              {passwordType === "investor" ? "Investor (read-only) password" : "Master password"}
            </label>
            <input
              id="wiz-password"
              name="mt5Password"
              type="password"
              required
              autoComplete="new-password"
              className="tos-neu-inset mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-white"
            />
            <p className="mt-1 text-[10px] text-white/25">
              Sent once over TLS. Never stored in your database.
              {passwordType === "master"
                ? " Master password allows live order execution when Live Trading is enabled."
                : " Investor password is read-only — enable Live Trading in Settings only if your broker allows it."}
            </p>
          </div>

          {err?.code === "mt5_server_not_found" && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-3 py-3">
              <p className="text-[11px] font-medium text-amber-100/95">
                MetaApi does not know this broker yet
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-amber-100/75">
                Normal for a new prop firm: MetaApi only knows the servers in its own registry. Give it
                your broker&apos;s <span className="font-mono">servers.dat</span> once and it knows them
                from then on — for you and for anyone else who connects the same firm.
              </p>
              <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-[10.5px] leading-relaxed text-amber-100/70">
                <li>Open the MT5 <strong>desktop</strong> terminal that can log into this account</li>
                <li>File → Open Data Folder → <span className="font-mono">config</span></li>
                <li>Upload <span className="font-mono">servers.dat</span> from that folder</li>
              </ol>
              <label className="mt-2.5 block text-[10px] uppercase tracking-wider text-amber-100/70">
                servers.dat
                <input
                  type="file"
                  name="serversDat"
                  accept=".dat"
                  className="mt-1 block w-full text-[11px] text-amber-100/90 file:mr-3 file:rounded-full file:border-0 file:bg-amber-400/15 file:px-3 file:py-1.5 file:text-[11px] file:text-amber-100"
                />
              </label>
              <label className="mt-2 block text-[10px] uppercase tracking-wider text-amber-100/70">
                Broker timezone
                <input
                  name="brokerTimezone"
                  defaultValue="EET"
                  placeholder="EET"
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-[#0c0d0e] px-3 py-2 text-sm text-white/90 outline-none focus:border-white/[0.15]"
                />
              </label>
              <p className="mt-1 text-[10px] leading-relaxed text-amber-100/60">
                Almost every MT5 broker is EET. Only change it if your firm says otherwise — it decides
                how candle times line up.
              </p>
              <p className="mt-2 text-[10px] leading-relaxed text-amber-100/60">
                The file only describes the broker&apos;s servers. It carries no credentials, and the
                server name you typed above is still used.
              </p>
            </div>
          )}

          <MetaApiComplianceCheckboxes variant={passwordType === "master" ? "master" : "default"} />

          {err && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-[11px] text-rose-200/90">
              <p className="font-medium">{err.message}</p>
              {err.code && (
                <p className="mt-1 font-mono text-[9px] text-rose-300/60">{err.code}</p>
              )}
            </div>
          )}

          <SubmitStep2 />
        </form>
      )}

      {step === 3 && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15">
            <Wifi className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Connection started</h3>
            <p className="mt-1 text-[11px] text-white/40">
              AXE is provisioning your MT5 terminal. It should appear below in a few seconds.
              Use the ⋮ menu to Test and Sync once it&apos;s ready.
            </p>
          </div>
          <button
            type="button"
            onClick={resetWizard}
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.06]"
          >
            Add another account
          </button>
        </div>
      )}
    </div>
  );
}

function SubmitStep2() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="broker-connect-submit"
      disabled={pending}
      className="tos-btn-cyan w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/80" />
          Connecting to MT5…
        </span>
      ) : (
        "Connect"
      )}
    </button>
  );
}
