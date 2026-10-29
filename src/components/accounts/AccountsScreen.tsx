"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  MoreVertical,
  WifiOff,
  Zap,
  Trash2,
  Shield,
  RefreshCw,
  TestTube,
  Unplug,
} from "lucide-react";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import type { BrokerAccountRow } from "@/lib/broker/loadAccountsPageData";
import type { AccountLedger } from "@/lib/account/reconcileAccountLedger";
import { formatSignedMoney } from "@/lib/journal/tradePnl";
import { setActiveAccountAction, deleteBrokerAccountAction } from "@/app/actions/brokerAccounts";
import {
  testCloudMt5ConnectionAction,
  syncCloudMt5AccountAction,
  recoverCloudMt5AccountAction,
  disconnectCloudMt5AccountAction,
} from "@/app/actions/mt5Cloud";
import { BrokerConnectWizard } from "@/components/accounts/BrokerConnectWizard";
import { Mt5ProvisioningAutoPoll } from "@/components/accounts/Mt5ProvisioningAutoPoll";
import { friendlyProviderStatus } from "@/lib/accounts/accountUiLabels";
import { isDemoAccount } from "@/lib/broker/demoAccount";
import { isAlpacaAccount } from "@/lib/alpaca/provision";
import { accountTypeFromBroker } from "@/lib/session/accountType";
import { getActiveSession, patchActiveSession } from "@/lib/session/activeSessionStore";
import { ActiveSessionSeed } from "@/components/session/ActiveSessionSeed";
import { StaleAgeBadge } from "@/components/pwa/StaleAgeBadge";
import { accountFreshness } from "@/lib/pwa/staleAge";
import { useOnlineStatus } from "@/lib/pwa/useOnlineStatus";

/* ── Helpers ─────────────────────────────────────────────────────────── */

type Props = {
  initialAccounts: BrokerAccountRow[];
  initialActiveId: string | null;
  ledgers: Record<string, AccountLedger>;
  loadError: string | null;
  defaultMetaApiRegion: string;
  liveAccountsNotice?: string;
  liveCapBlocked?: boolean;
  liveCapMessage?: string;
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

/* ── Account Card ────────────────────────────────────────────────────── */

function AccountCard({
  account,
  isActive,
  pending,
  ledger,
  onActivate,
  onRemove,
}: {
  account: BrokerAccountRow;
  isActive: boolean;
  pending: boolean;
  ledger: AccountLedger | null;
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
  const online = useOnlineStatus();
  const figuresFreshness = accountFreshness({
    lastSyncAt: account.last_sync_at ?? null,
    online,
  });
  const passwordType =
    typeof account.metadata?.passwordType === "string" ? account.metadata.passwordType : null;
  const isInvestorLinked = passwordType === "investor";
  const isMasterLinked = passwordType === "master";
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
            {isCloud && isInvestorLinked && (
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/45">
                Read-only
              </span>
            )}
            {isCloud && isMasterLinked && (
              <span className="rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200/90">
                Master
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

      {ledger && (ledger.tradeCount > 0 || ledger.balance != null) ? (
        <div className="mt-3 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2" data-testid="account-ledger">
          <div className="mb-1.5 flex items-center justify-end">
            <StaleAgeBadge
              freshness={figuresFreshness}
              always
              testId={`account-stale-${account.id}`}
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/35">Realized (closed trades)</span>
            <span
              className={`font-mono font-semibold tabular-nums ${
                ledger.netPnl >= 0 ? "text-cyan-300" : "text-rose-300"
              }`}
            >
              {formatSignedMoney(ledger.netPnl)}
              {ledger.currency ? ` ${ledger.currency}` : ""}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-white/35">
            <span>
              {ledger.tradeCount} trades · {ledger.wins}W / {ledger.losses}L
              {ledger.fees !== 0 ? ` · fees ${formatSignedMoney(ledger.fees)}` : ""}
            </span>
            {ledger.balance != null ? (
              <span className="font-mono tabular-nums">
                Broker {formatSignedMoney(ledger.balance)}
                {ledger.currency ? ` ${ledger.currency}` : ""}
              </span>
            ) : null}
          </div>
          {ledger.hasBothViews ? (
            <p className="mt-1.5 text-[9px] leading-relaxed text-white/28">{ledger.caveat}</p>
          ) : null}
        </div>
      ) : null}

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

/* ── Main Screen ─────────────────────────────────────────────────────── */

export function AccountsScreen({
  initialAccounts,
  initialActiveId,
  ledgers,
  loadError,
  defaultMetaApiRegion,
  liveAccountsNotice,
  liveCapBlocked,
  liveCapMessage,
}: Props) {
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
          const account = initialAccounts.find((a) => a.id === id);
          const session = getActiveSession();
          patchActiveSession({
            accountId: id,
            accountLabel: account?.label ?? null,
            accountType: accountTypeFromBroker({
              label: account?.label,
              mt5Server: account?.mt5_server,
              metadata: account?.metadata,
              connectionMethod: account?.connection_method,
            }),
            lastTab: "chart",
          });
          router.push(
            `/chart?account=${encodeURIComponent(id)}&symbol=${encodeURIComponent(session.symbol)}&tf=${encodeURIComponent(session.timeframe)}`,
          );
        } else {
          patchActiveSession({ accountId: null, accountLabel: null, accountType: "unknown" });
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

  const activeAccount = initialAccounts.find((a) => a.id === initialActiveId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto gap-5 pb-4">
      <ActiveSessionSeed
        accountId={initialActiveId}
        accountLabel={activeAccount?.label ?? null}
        accountType={
          activeAccount
            ? accountTypeFromBroker({
                label: activeAccount.label,
                mt5Server: activeAccount.mt5_server,
                metadata: activeAccount.metadata,
                connectionMethod: activeAccount.connection_method,
              })
            : "unknown"
        }
        lastTab="account"
      />
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
              : onlyDemo
                ? "Demo paper account ready — open Chart to practice MT5-style trading."
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
            You&apos;re on <strong className="text-white/70">AXE Demo</strong> — open Chart to place paper trades with live-style ticks. Connect MT5 below when you&apos;re ready for a real broker.
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
              ledger={ledgers[a.id] ?? null}
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
        <BrokerConnectWizard
          defaultRegion={defaultMetaApiRegion}
          liveAccountsNotice={liveAccountsNotice}
          liveCapBlocked={liveCapBlocked}
          liveCapMessage={liveCapMessage}
        />
      </div>
    </div>
  );
}
