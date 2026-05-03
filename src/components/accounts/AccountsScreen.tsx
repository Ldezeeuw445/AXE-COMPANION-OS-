"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Copy, Check } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import type { BrokerAccountRow } from "@/lib/broker/loadAccountsPageData";
import {
  createBrokerAccountAction,
  setActiveAccountAction,
  type CreateBrokerResult,
} from "@/app/actions/brokerAccounts";
import { Mt5InAppConnectionTest } from "@/components/accounts/Mt5InAppConnectionTest";
import { Mt5LiveProofChecklist } from "@/components/accounts/Mt5LiveProofChecklist";

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

export function AccountsScreen({
  initialAccounts,
  initialActiveId,
  loadError,
}: Props) {
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
    <div className="flex min-h-0 flex-1 flex-col pb-4">
      <ScreenHeader
        title="Trading accounts"
        subtitle="Same accounts as AXE web — MT5 bridge uses your link token once."
        left={<Landmark className="h-6 w-6 text-tos-warm/80" aria-hidden />}
        right={<Badge variant="warm">Supabase</Badge>}
      />

      {loadError ? (
        <p className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {loadError}
        </p>
      ) : null}

      <Mt5LiveProofChecklist />

      <GlassPanel className="mb-4 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300/90">
          Recommended — cloud / VPS MT5
        </p>
        <p className="mt-2 text-xs leading-relaxed text-tos-muted">
          The production path is one HTTPS endpoint: your Supabase Edge function{" "}
          <code className="rounded bg-black/40 px-1 text-[10px] text-tos-text">axe-mt5-ingest</code>. Run MetaTrader 5
          on a broker-side VPS, MetaQuotes VPS, or any always-on box, install a small EA or bridge that POSTs closed
          fills with your link token — same flow whether the machine is &quot;in the cloud&quot; or at your desk. We
          never show a fake &quot;connected&quot; state: linkage is proven when trades appear in{" "}
          <strong className="text-tos-text">History</strong>.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[11px] text-tos-dim">
          <li>Token stays in your EA config — not in AXE settings.</li>
          <li>Only a hash is stored server-side after you create the account below.</li>
          <li>No execution from AXE v1; ingest-only.</li>
        </ul>
      </GlassPanel>

      <GlassPanel className="mb-4 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-tos-dim">Verify token (optional)</p>
        <Mt5InAppConnectionTest className="mt-2" />
        <p className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-tos-dim">
          Pastes your token in-browser to send one minimal test trade — confirms CORS + ingest before you deploy a
          real EA. For automatic sync of every fill, the EA/bridge must run where MT5 has market access.
        </p>
      </GlassPanel>

      {showToken ? (
        <GlassPanel glow="warm" className="mb-4 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300/90">
            Link token (shown once)
          </p>
          <p className="mt-1 text-xs text-tos-muted">
            <strong className="font-medium text-tos-text">Do not</strong> paste this into the Companion app settings —
            only into your <strong className="font-medium text-tos-text">MT5 EA, script, or bridge</strong> that POSTs
            JSON to the ingest URL. Only a hash is stored; save this token somewhere safe now.
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-tos-muted">
            <li>Copy the token below.</li>
            <li>Put it in your EA/bridge config (same place as your API URL).</li>
            <li>
              POST to{" "}
              {ingestUrl ? (
                <code className="break-all rounded bg-black/50 px-1 py-0.5 text-[10px] text-emerald-200/90">
                  {ingestUrl}
                </code>
              ) : (
                <code className="text-[10px]">…/functions/v1/axe-mt5-ingest</code>
              )}{" "}
              with field <code className="text-[10px] text-tos-text">token</code> plus your trades/snapshot.
            </li>
            <li>After the first successful post, this account is linked and data appears in History / chat context.</li>
          </ol>
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
        </GlassPanel>
      ) : null}

      {createErr ? (
        <p className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {createErr}
        </p>
      ) : null}

      {empty && !loadError ? (
        <GlassPanel className="mb-4 p-6 text-center">
          <p className="text-sm font-medium text-tos-text">No trading account connected yet</p>
          <p className="mt-2 text-xs text-tos-muted">
            Connect an MT5 account with a secure link token. Trades will sync into the same ledger as AXE web.
          </p>
        </GlassPanel>
      ) : null}

      {!empty ? (
        <div className="mb-4 space-y-3">
          {initialAccounts.map((a) => {
            const active = a.id === initialActiveId;
            return (
              <GlassPanel key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-tos-text">{a.label}</span>
                      {active ? (
                        <Badge variant="warm">Active</Badge>
                      ) : (
                        <Badge variant="neutral">Inactive</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-tos-dim">
                      {a.provider.toUpperCase()}
                      {a.mt5_login ? ` · ${a.mt5_login}` : ""}
                      {a.mt5_server ? ` · ${a.mt5_server}` : ""}
                    </p>
                    <p className="mt-1 text-[10px] text-tos-dim/80">Added {formatDate(a.created_at)}</p>
                  </div>
                  {!active ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void onSetActive(a.id)}
                      className="shrink-0 rounded-xl border border-tos-warm/30 bg-tos-warm/10 px-3 py-1.5 text-[10px] font-semibold text-tos-warm hover:bg-tos-warm/20 disabled:opacity-50"
                    >
                      Set active
                    </button>
                  ) : (
                    <span className="text-[10px] text-tos-dim">In use for chat &amp; journal</span>
                  )}
                </div>
              </GlassPanel>
            );
          })}
          {initialActiveId ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void onSetActive(null)}
              className="w-full rounded-xl border border-white/10 py-2 text-[11px] text-tos-dim hover:bg-white/5 disabled:opacity-50"
            >
              Clear active account
            </button>
          ) : null}
        </div>
      ) : null}

      <GlassPanel glow="warm" className="p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Advanced — create broker row &amp; link token
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          Creates <code className="text-[10px] text-tos-text">user_broker_accounts</code> and a one-time link token
          (hashed at rest). Use for local bridge or any custom poster to{" "}
          <code className="text-[10px] text-tos-text">axe-mt5-ingest</code>.
        </p>
        <form action={createAction} className="mt-4 space-y-3">
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
          <div className="grid grid-cols-2 gap-2">
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
      </GlassPanel>
    </div>
  );
}
