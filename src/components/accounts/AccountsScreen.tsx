"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  MoreVertical,
  Wifi,
  WifiOff,
  Zap,

  Trash2,
  Shield,
  RefreshCw,
  TestTube,
  Unplug,
  ArrowLeft,
} from "lucide-react";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import type { BrokerAccountRow } from "@/lib/broker/loadAccountsPageData";
import { setActiveAccountAction, deleteBrokerAccountAction } from "@/app/actions/brokerAccounts";
import {
  createCloudMt5ConnectionAction,
  testCloudMt5ConnectionAction,
  syncCloudMt5AccountAction,
  recoverCloudMt5AccountAction,
  disconnectCloudMt5AccountAction,
} from "@/app/actions/mt5Cloud";
import { Mt5ProvisioningAutoPoll } from "@/components/accounts/Mt5ProvisioningAutoPoll";
import { friendlyProviderStatus } from "@/lib/accounts/accountUiLabels";
import { isDemoAccount } from "@/lib/broker/demoAccount";
import { isAlpacaAccount } from "@/lib/alpaca/provision";

/* ── Helpers ─────────────────────────────────────────────────────────── */

type Props = {
  initialAccounts: BrokerAccountRow[];
  initialActiveId: string | null;
  loadError: string | null;
  defaultMetaApiRegion: string;
};

function statusDot(a: BrokerAccountRow): { color: string; label: string } {
  const s = (a.provider_status ?? a.status ?? "").toLowerCase();
  if (s === "connected" || s === "provisioned")
    return { color: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]", label: "Connected" };
  if (["provisioning", "connecting", "syncing", "deploying", "created"].includes(s))
    return { color: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]", label: "Syncing" };
  if (["recovering", "orphaned"].includes(s))
    return { color: "bg-amber-400/70", label: "Reconnecting" };
  if (s.includes("credential") || s.includes("fail") || s.includes("error"))
    return { color: "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]", label: "Needs attention" };
  return { color: "bg-white/30", label: friendlyProviderStatus(s) };
}

function isValidRegion(r: string): r is "london" | "new-york" | "singapore" {
  return r === "london" || r === "new-york" || r === "singapore";
}

const REGION_OPTIONS = [
  { value: "london" as const, label: "London", hint: "EU / ME / Africa" },
  { value: "new-york" as const, label: "New York", hint: "Americas" },
  { value: "singapore" as const, label: "Singapore", hint: "Asia-Pacific" },
];

/* ── Account Card ────────────────────────────────────────────────────── */

function AccountCard({
  account,
  isActive,
  pending,
  onActivate,
  onRemove,
}: {
  account: BrokerAccountRow;
  isActive: boolean;
  pending: boolean;
  onActivate: () => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDemo = isDemoAccount(account);
  const isAlpaca = isAlpacaAccount(account);
  const isCloud = account.connection_method === "cloud_mt5" && account.external_connection_id;
  const dot = statusDot(account);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  async function runAction(
    fn: (id: string) => Promise<{ ok: boolean; code?: string; message?: string; data?: unknown }>,
    label: string,
  ) {
    setMenuOpen(false);
    setActionBusy(label);
    setActionMsg(null);
    try {
      const r = await Promise.race([
        fn(account.id),
        new Promise<{ ok: false; message: string }>((resolve) =>
          setTimeout(() => resolve({ ok: false, message: "Still working in the background…" }), 30_000),
        ),
      ]);
      setActionMsg(r.ok ? `${label} ✓` : r.message ?? "Failed");
      router.refresh();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div
      className={`relative rounded-2xl border px-4 py-3.5 transition-all ${
        menuOpen ? "z-[46]" : ""
      } ${
        isActive
          ? "border-white/[0.12] bg-white/[0.04] ring-1 ring-white/[0.06]"
          : "border-white/[0.06] bg-white/[0.02] active:scale-[0.985]"
      }`}
      onClick={() => {
        if (menuOpen || actionBusy || pending) return;
        if (!isActive) onActivate();
      }}
      onKeyDown={(e) => {
        if (menuOpen || actionBusy || pending || isActive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      role={isActive ? undefined : "button"}
      tabIndex={isActive ? undefined : 0}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot.color}`} title={dot.label} />

        {/* Label + login */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{account.label}</span>
            {isActive && (
              <span className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">
                Active
              </span>
            )}
            {isDemo && (
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/50">
                Demo
              </span>
            )}
            {isAlpaca && (
              <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200/90">
                Alpaca
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-white/35">
            {isAlpaca
              ? `PAPER · ${account.mt5_server ?? "Alpaca"}${account.masked_login ? ` · ${account.masked_login}` : ""}`
              : (
                <>
                  {account.masked_login ?? account.mt5_login ?? "—"}
                  {account.mt5_server ? ` · ${account.mt5_server}` : ""}
                </>
              )}
          </p>
        </div>

        {/* ⋮ menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((p) => !p);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/60"
            aria-label="Account actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-[45]"
                aria-hidden
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
              <div
                className="absolute right-0 top-full z-[50] mt-1 w-48 overflow-hidden rounded-xl border border-white/[0.10] bg-[#0c0c10]/95 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
              {isCloud && (
                <>
                  <MenuButton
                    icon={<TestTube className="h-3.5 w-3.5" />}
                    label="Test connection"
                    onClick={() => void runAction(testCloudMt5ConnectionAction, "Test")}
                  />
                  <MenuButton
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    label="Sync trades"
                    onClick={() => void runAction(syncCloudMt5AccountAction, "Sync")}
                  />
                  <MenuButton
                    icon={<Zap className="h-3.5 w-3.5" />}
                    label="Redeploy terminal"
                    onClick={() => void runAction(recoverCloudMt5AccountAction, "Redeploy")}
                  />
                  <MenuButton
                    icon={<Unplug className="h-3.5 w-3.5" />}
                    label="Disconnect"
                    onClick={() => {
                      if (!confirm("Disconnect this MT5 Cloud account? Trade history in AXE is kept.")) return;
                      void runAction(disconnectCloudMt5AccountAction, "Disconnect");
                    }}
                    variant="warn"
                  />
                  <div className="mx-3 border-t border-white/[0.06]" />
                </>
              )}
              {isAlpaca && (
                <>
                  <MenuButton
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    label="Reset paper positions"
                    onClick={() => {
                      if (!confirm("Close all Alpaca paper positions and cancel open orders?")) return;
                      setMenuOpen(false);
                      setActionBusy("Reset");
                      setActionMsg(null);
                      void (async () => {
                        try {
                          const res = await fetch("/api/alpaca/reset", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ brokerAccountId: account.id }),
                          });
                          const data = (await res.json()) as { ok?: boolean; message?: string };
                          setActionMsg(data.ok ? "Reset ✓" : data.message ?? "Reset failed");
                          router.refresh();
                        } catch (e) {
                          setActionMsg(e instanceof Error ? e.message : "Reset failed");
                        } finally {
                          setActionBusy(null);
                        }
                      })();
                    }}
                  />
                  <div className="mx-3 border-t border-white/[0.06]" />
                </>
              )}
              {isActive && (
                <MenuButton
                  icon={<WifiOff className="h-3.5 w-3.5" />}
                  label="Set inactive"
                  onClick={() => {
                    setMenuOpen(false);
                    void onActivate(); // toggles off
                  }}
                />
              )}
              <MenuButton
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="Remove account"
                onClick={() => {
                  setMenuOpen(false);
                  onRemove();
                }}
                variant="danger"
              />
            </div>
            </>
          )}
        </div>

        {/* Tap to activate hint */}
        {!isActive && (
          <ChevronRight className="h-4 w-4 shrink-0 text-white/15" />
        )}
      </div>

      {/* Status feedback */}
      {actionBusy && (
        <p className="mt-2 text-[10px] text-amber-300/80">
          ⏳ {actionBusy}…
        </p>
      )}
      {!actionBusy && actionMsg && (
        <p className="mt-2 text-[10px] text-white/50">
          {actionMsg}
        </p>
      )}
    </div>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  variant = "normal",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "normal" | "warn" | "danger";
}) {
  const color =
    variant === "danger"
      ? "text-rose-300/85 hover:bg-rose-500/10"
      : variant === "warn"
        ? "text-amber-300/85 hover:bg-amber-500/10"
        : "text-white/70 hover:bg-white/[0.06]";
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[11px] font-medium transition-colors ${color}`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── 3-Step Connect Wizard ───────────────────────────────────────────── */

type WizardStep = 1 | 2 | 3;

function ConnectWizard({ defaultRegion }: { defaultRegion: string }) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [server, setServer] = useState("");
  const [region, setRegion] = useState<"london" | "new-york" | "singapore">(
    isValidRegion(defaultRegion) ? defaultRegion : "london",
  );
  const [passwordType, setPasswordType] = useState<"investor" | "master">("investor");
  const [state, action] = useActionState(createCloudMt5ConnectionAction, undefined);

  // After successful creation, go to step 3
  useEffect(() => {
    if (state?.ok) {
      setStep(3);
      router.refresh();
    }
  }, [state, router]);

  const err = state && !state.ok ? state : null;

  function resetWizard() {
    setStep(1);
    setServer("");
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-transparent p-5">
      {/* Step indicator */}
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

      {/* Step 1: Server + Region */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Which MT5 server?</h3>
            <p className="mt-1 text-[11px] text-white/40">
              Copy the exact name from MT5 → File → Login to Trade Account.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/30" htmlFor="wiz-server">
              Server name
            </label>
            <input
              id="wiz-server"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="e.g. ICMarketsSC-Live02"
              className="tos-neu-inset mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20"
            />
          </div>

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
            disabled={!server.trim()}
            onClick={() => setStep(2)}
            className="tos-btn-cyan w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-30"
          >
            Next — Login details
          </button>
        </div>
      )}

      {/* Step 2: Login + Password + Label */}
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

          {/* Hidden fields for the action */}
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

          {passwordType === "investor" ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-[11px] text-white/50">
              <input type="checkbox" name="readOnlyConfirm" required className="mt-0.5 rounded border-white/20" />
              <span>
                I confirm this is my <strong className="text-white/70">read-only investor</strong> password.
                AXE won&apos;t place trades unless I explicitly enable Live Trading in Settings.
              </span>
            </label>
          ) : (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[11px] text-amber-100/80">
              <input type="checkbox" name="masterConfirm" required className="mt-0.5 rounded border-white/20" />
              <span>
                I confirm this is my <strong className="text-amber-50">master (trading) password</strong> and I
                understand AXE can send real orders when Live Trading is enabled. I accept full responsibility.
              </span>
            </label>
          )}

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

      {/* Step 3: Done */}
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
      disabled={pending}
      className="tos-btn-cyan w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/80" />
          Connecting to MT5…
        </span>
      ) : (
        "Connect account"
      )}
    </button>
  );
}

/* ── Main Screen ─────────────────────────────────────────────────────── */

export function AccountsScreen({ initialAccounts, initialActiveId, loadError, defaultMetaApiRegion }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const cloudAccounts = initialAccounts.filter(
    (a) => a.connection_method === "cloud_mt5" && a.external_connection_id,
  );
  const connectedCount = cloudAccounts.filter((a) =>
    ["connected", "provisioned"].includes((a.provider_status ?? "").toLowerCase()),
  ).length;

  const provisioningTargets = initialAccounts
    .filter((a) => a.connection_method === "cloud_mt5" && a.external_connection_id)
    .map((a) => ({ id: a.id, providerStatus: a.provider_status ?? null }));

  async function onActivate(id: string) {
    startTransition(async () => {
      const r = await setActiveAccountAction(id === initialActiveId ? null : id);
      if (!r.error) {
        if (id !== initialActiveId) {
          router.push(`/chart?account=${encodeURIComponent(id)}&symbol=XAUUSD&tf=h1`);
        }
        router.refresh();
      }
    });
  }

  async function onRemove(id: string) {
    if (!confirm("Remove this account? Synced trades and journal tags for it will be deleted.")) return;
    startTransition(async () => {
      const r = await deleteBrokerAccountAction(id);
      if (!r.error) router.refresh();
    });
  }

  const onlyDemo = initialAccounts.length > 0 && initialAccounts.every((a) => isDemoAccount(a));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto gap-5 pb-4">
      <Mt5ProvisioningAutoPoll targets={provisioningTargets} />
      <LiveStatusReporter
        liveCount={connectedCount}
        totalCount={cloudAccounts.length || 1}
        label={`Accounts · ${initialAccounts.length} linked`}
        allLiveOverride={loadError ? false : connectedCount > 0 ? true : null}
        severity={loadError ? "degraded" : connectedCount > 0 ? "fresh" : "inactive"}
        reason={
          loadError
            ? "Account data could not load."
            : connectedCount > 0
              ? `${connectedCount} MT5 Cloud account${connectedCount > 1 ? "s" : ""} connected.`
              : "No live MT5 connection yet."
        }
        scope="accounts"
      />
      <PageTitleInjector title="Accounts" />

      {loadError && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
          {loadError}
        </p>
      )}

      {/* Demo nudge */}
      {onlyDemo && (
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5 text-[11px] text-white/50">
          <Shield className="h-4 w-4 shrink-0 text-white/30" />
          <span>
            You&apos;re on <strong className="text-white/70">AXE Demo</strong> — connect a real MT5 account below for live data.
          </span>
        </div>
      )}

      {/* Account list */}
      {initialAccounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/20">
            Your accounts
          </p>
          {initialAccounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              isActive={a.id === initialActiveId}
              pending={pending}
              onActivate={() => void onActivate(a.id)}
              onRemove={() => void onRemove(a.id)}
            />
          ))}
        </div>
      )}

      {/* Connect wizard */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/20">
          Connect MT5 account
        </p>
        <ConnectWizard defaultRegion={defaultMetaApiRegion} />
      </div>
    </div>
  );
}
