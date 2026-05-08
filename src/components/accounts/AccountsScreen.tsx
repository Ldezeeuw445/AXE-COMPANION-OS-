"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, Copy, Check, ChevronDown, LineChart } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import type { BrokerAccountRow } from "@/lib/broker/loadAccountsPageData";
import {
  createBrokerAccountAction,
  deleteBrokerAccountAction,
  setActiveAccountAction,
  type CreateBrokerResult,
} from "@/app/actions/brokerAccounts";
import { Mt5InAppConnectionTest } from "@/components/accounts/Mt5InAppConnectionTest";
import { Mt5LiveProofChecklist } from "@/components/accounts/Mt5LiveProofChecklist";
import { Mt5CloudConnectForm } from "@/components/accounts/Mt5CloudConnectForm";
import { Mt5CloudAccountActions } from "@/components/accounts/Mt5CloudAccountActions";
import { LEGAL_COPY } from "@/lib/legal/constants";
import { accountMethodLabel, friendlyProviderStatus } from "@/lib/accounts/accountUiLabels";
import { isDemoAccount } from "@/lib/broker/demoAccount";

type Props = {
  initialAccounts: BrokerAccountRow[];
  initialActiveId: string | null;
  loadError: string | null;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function connectionKind(a: BrokerAccountRow): "demo" | "cloud" | "cloud_off" | "token" {
  if (isDemoAccount(a)) return "demo";
  if (a.connection_method === "cloud_mt5" && a.external_connection_id) return "cloud";
  if (a.connection_method === "cloud_mt5_disconnected" || (a.connection_method === "cloud_mt5" && !a.external_connection_id))
    return "cloud_off";
  return "token";
}

function statusBadgeVariant(s: string | null | undefined): "warm" | "neutral" | "long" {
  const friendly = friendlyProviderStatus(s);
  if (friendly === "Connected") return "long";
  if (friendly === "Failed" || friendly === "Provisioning") return "warm";
  return "neutral";
}

const detailsSummaryClass =
  "flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-tos-text outline-none [&::-webkit-details-marker]:hidden";

export function AccountsScreen({ initialAccounts, initialActiveId, loadError }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createState, createAction] = useActionState<CreateBrokerResult | undefined, FormData>(
    createBrokerAccountAction,
    undefined,
  );
  const [copied, setCopied] = useState(false);

  const showToken = createState?.linkToken;
  const createErr = createState?.error;

  async function onSetActive(id: string | null) {
    startTransition(async () => {
      const r = await setActiveAccountAction(id);
      if (!r.error) router.refresh();
      else alert(r.error);
    });
  }

  async function onRemoveAccount(id: string) {
    if (
      !confirm(
        "Remove this account from AXE? This deletes synced trades and journal tags for this account (MetaApi cloud is removed if still linked).",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await deleteBrokerAccountAction(id);
      if (!r.error) router.refresh();
      else alert(r.error);
    });
  }

  async function copyToken() {
    if (!showToken) return;
    await navigator.clipboard.writeText(showToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const empty = initialAccounts.length === 0;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const ingestUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/axe-mt5-ingest` : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 pb-6">
      <ScreenHeader
        title="Accounts"
        subtitle="Connect your real MT5 account in under a minute — AXE stays read-first; execution stays off by default."
        left={<Landmark className="h-6 w-6 text-cyan-400/85" aria-hidden />}
      />

      {loadError ? (
        <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{loadError}</p>
      ) : null}

      {/* A — Intro */}
      <div className="space-y-2 text-sm leading-relaxed text-tos-muted">
        <p>
          Connect your MT5 account so AXE can read account status, open positions, trade history and journal context.
        </p>
        <p className="text-xs text-tos-dim">{LEGAL_COPY.mt5Connect}</p>
        <p className="text-[11px] text-tos-dim">
          More on data use:{" "}
          <Link href="/privacy" className="text-cyan-400/90 hover:underline">
            Privacy
          </Link>
          .
        </p>
      </div>

      {/* B — Recommended MetaApi cloud */}
      <GlassPanel glow="cyan" className="border-cyan-500/12 p-5 sm:p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/95">Recommended — Connect MT5 account</h2>
        <p className="mt-2 text-sm text-tos-muted">
          Secure MetaApi cloud link from this app. Use your <strong className="text-tos-text/95">investor / read-only</strong> password.
          Nothing executes from AXE by default.
        </p>

        <details className="group mt-4 overflow-hidden rounded-xl border border-white/[0.07] bg-black/25">
          <summary className={detailsSummaryClass}>
            <span>How it works</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-tos-dim transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-2 border-t border-white/[0.06] px-3 py-3 text-[11px] leading-relaxed text-tos-muted">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>You sign in with MT5 login, broker server and investor (read-only) password.</li>
              <li>AXE provisions a secure MetaApi connection from the server — passwords are not stored in the database.</li>
              <li>After you run <strong className="text-tos-text/95">Test</strong> and <strong className="text-tos-text/95">Sync</strong>, account summary, positions and history feed Chat, Chart, History and Journal.</li>
              <li>Order placement from AXE remains disabled unless you explicitly enable it later.</li>
            </ul>
            <p className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 text-[10px] text-tos-dim">
              Server requirement: your deployment must have a MetaApi token configured so provisioning can run. If
              something fails, use <span className="font-medium text-tos-muted">Technical details</span> on the form
              error.
            </p>
          </div>
        </details>

        <div className="mt-5">
          <Mt5CloudConnectForm />
        </div>
      </GlassPanel>

      {/* C — Linked accounts */}
      <section aria-labelledby="accounts-linked-heading">
        <h2 id="accounts-linked-heading" className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-tos-dim">
          Your accounts
        </h2>

        {empty && !loadError ? (
          <GlassPanel className="p-6 text-center">
            <p className="text-sm font-medium text-tos-text">No accounts yet</p>
            <p className="mt-2 text-xs text-tos-muted">
              Start with <strong className="text-tos-text/95">Recommended — Connect MT5 account</strong> above, or use
              Advanced if you run a local bridge.
            </p>
          </GlassPanel>
        ) : null}

        {!empty ? (
          <div className="space-y-3">
            {initialAccounts.map((a) => {
              const active = a.id === initialActiveId;
              const kind = connectionKind(a);
              const loginDisp = a.masked_login ?? a.mt5_login ?? "—";
              const method = accountMethodLabel(a.connection_method, Boolean(a.external_connection_id));
              const syncLabel = friendlyProviderStatus(a.provider_status ?? a.status);

              return (
                <GlassPanel
                  key={a.id}
                  className={`p-4 sm:p-5 ${active ? "border-cyan-400/30 ring-1 ring-cyan-400/25 shadow-[0_0_32px_-16px_rgba(34,211,238,0.22)]" : ""}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold text-tos-text">{a.label}</span>
                        {active ? (
                          <span className="rounded-md border border-cyan-400/35 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/95">
                            Active
                          </span>
                        ) : null}
                        <Badge variant={kind === "cloud" || kind === "demo" ? "long" : "neutral"}>
                          {kind === "demo" ? "Demo" : method}
                        </Badge>
                        <Badge variant={statusBadgeVariant(a.provider_status ?? a.status)}>{syncLabel}</Badge>
                      </div>
                      <p className="mt-2 font-mono text-[11px] text-tos-dim">
                        Login {loginDisp}
                        {a.mt5_server ? ` · ${a.mt5_server}` : ""}
                      </p>
                      {a.last_sync_at ? (
                        <p className="mt-1 text-[10px] text-tos-dim/90">Last sync · {formatDate(a.last_sync_at)}</p>
                      ) : (
                        <p className="mt-1 text-[10px] text-tos-dim/90">Last sync · —</p>
                      )}
                      <p className="mt-1 text-[10px] text-tos-dim/70">Added {formatDate(a.created_at)}</p>
                      {active ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-cyan-200/75">
                          {kind === "demo"
                            ? "Virtual paper account. Used for chart practice and demo execution only."
                            : "Used for chat, journal, chart and alerts."}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:min-w-[9.5rem] sm:items-end">
                      {kind === "cloud" || kind === "demo" ? (
                        <Link
                          href={`/chart?account=${encodeURIComponent(a.id)}&symbol=XAUUSD&tf=h1`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold text-cyan-100/95 hover:bg-cyan-500/18"
                        >
                          <LineChart className="h-3.5 w-3.5" aria-hidden />
                          Open chart
                        </Link>
                      ) : null}
                      {active ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => void onSetActive(null)}
                          className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-[11px] font-semibold text-tos-muted hover:border-cyan-500/25 hover:bg-cyan-500/10 hover:text-cyan-100/90 disabled:opacity-50"
                        >
                          Set inactive
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => void onSetActive(a.id)}
                          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold text-cyan-100/95 hover:bg-cyan-500/18 disabled:opacity-50"
                        >
                          Set active
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void onRemoveAccount(a.id)}
                        className="rounded-lg border border-red-500/20 px-2 py-1.5 text-[10px] font-medium text-red-300/85 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Remove account
                      </button>
                    </div>
                  </div>
                  {kind === "cloud" ? <Mt5CloudAccountActions accountId={a.id} /> : null}
                </GlassPanel>
              );
            })}
          </div>
        ) : null}
      </section>

      {createErr ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200/95">
          <p className="font-medium">Could not create bridge token</p>
          <p className="mt-1 text-xs text-red-200/80">{createErr}</p>
        </div>
      ) : null}

      {showToken ? (
        <GlassPanel className="border-emerald-500/15 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300/90">Link token (shown once)</p>
          <p className="mt-2 text-xs text-tos-muted">
            Copy into your MT5 EA or bridge only — not into Companion settings. Store it safely; only a hash is kept
            server-side.
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-black/40 p-3">
            <code className="min-w-0 flex-1 break-all text-[11px] text-tos-text">{showToken}</code>
            <button
              type="button"
              onClick={() => void copyToken()}
              className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-tos-muted hover:bg-white/10"
              aria-label="Copy token"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-tos-dim">
            POST JSON to your ingest endpoint with field <span className="font-mono text-tos-muted">token</span>
            {ingestUrl ? (
              <>
                {" "}
                — base URL configured for this app.
              </>
            ) : (
              <>.</>
            )}
          </p>
        </GlassPanel>
      ) : null}

      {/* D — Advanced bridge (collapsed) */}
      <details className="group overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent backdrop-blur-xl">
        <summary className={`${detailsSummaryClass} px-4 py-3.5 sm:px-5`}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tos-muted">Advanced — Local MT5 Bridge Token</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-tos-dim transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 border-t border-white/[0.06] px-4 pb-5 pt-3 sm:px-5">
          <p className="text-xs leading-relaxed text-tos-muted">
            Creates a broker account row and a one-time link token (hashed at rest). Use when an EA or custom bridge
            POSTs closed fills to your secure ingest endpoint — same ledger as History and chat context after the first
            successful post.
          </p>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-tos-dim">Optional — verify token</p>
            <Mt5InAppConnectionTest className="mt-2" />
            <p className="mt-2 text-[10px] leading-relaxed text-tos-dim">
              Sends one minimal test from the browser to confirm CORS and ingest before you run a full EA.
            </p>
          </div>
          <form action={createAction} className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-tos-dim" htmlFor="label">
                Label
              </label>
              <input
                id="label"
                name="label"
                placeholder="e.g. Funded FTMO"
                className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-tos-dim" htmlFor="mt5Login">
                  MT5 login
                </label>
                <input
                  id="mt5Login"
                  name="mt5Login"
                  className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-tos-dim" htmlFor="mt5Server">
                  Server
                </label>
                <input
                  id="mt5Server"
                  name="mt5Server"
                  className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text"
                  placeholder="Optional"
                />
              </div>
            </div>
            <button
              type="submit"
              className="tos-btn-cyan w-full rounded-2xl py-3 text-sm font-semibold disabled:opacity-50"
            >
              Create link token
            </button>
          </form>
        </div>
      </details>

      {/* E — Checklist (collapsed) */}
      <details className="group overflow-hidden rounded-[1.35rem] border border-white/[0.07] bg-black/25">
        <summary className={`${detailsSummaryClass} px-4 py-3.5 sm:px-5`}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tos-dim">Verify your setup</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-tos-dim transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-white/[0.06] px-4 py-4 sm:px-5">
          <Mt5LiveProofChecklist embedded />
        </div>
      </details>
    </div>
  );
}
