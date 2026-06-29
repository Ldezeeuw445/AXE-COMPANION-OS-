"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bitcoin,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
  Shield,
  ExternalLink,
} from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import {
  WALLET_CHAINS,
  WALLET_PROVIDERS,
  providerMeta,
  chainSymbol,
} from "@/lib/wallets/walletCatalog";
import type { CryptoWalletWithBalance, WalletChain, WalletProvider } from "@/types/wallets";

function formatNative(amount: number, symbol: string): string {
  const digits = symbol === "BTC" ? 6 : 4;
  return `${amount.toFixed(digits)} ${symbol}`;
}

function formatUsd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function shortAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function WalletsClient() {
  const [wallets, setWallets] = useState<CryptoWalletWithBalance[]>([]);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [provider, setProvider] = useState<WalletProvider>("ledger");
  const [chain, setChain] = useState<WalletChain>("ethereum");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallets?refresh=${refresh ? "true" : "false"}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load wallets");
      const json = (await res.json()) as {
        wallets?: CryptoWalletWithBalance[];
        totalUsd?: number | null;
      };
      setWallets(json.wallets ?? []);
      setTotalUsd(json.totalUsd ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleAdd = async () => {
    if (!address.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider, chain, address, label }),
      });
      const json = (await res.json()) as { error?: string; wallet?: CryptoWalletWithBalance };
      if (!res.ok) {
        if (json.error === "address_already_tracked") {
          throw new Error("This address is already on your list.");
        }
        if (json.error === "invalid_address") {
          throw new Error("Invalid address for the selected chain.");
        }
        throw new Error(json.error ?? "Could not add wallet");
      }
      if (json.wallet) {
        setWallets((prev) => [json.wallet!, ...prev.filter((w) => w.id !== json.wallet!.id)]);
      }
      setAddress("");
      setLabel("");
      setShowForm(false);
      void load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add wallet");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const res = await fetch(`/api/wallets?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setWallets((prev) => prev.filter((w) => w.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove");
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<WalletProvider, CryptoWalletWithBalance[]>();
    for (const w of wallets) {
      const list = map.get(w.provider) ?? [];
      list.push(w);
      map.set(w.provider, list);
    }
    return map;
  }, [wallets]);

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-24">
      <PageTitleInjector title="Wallets" />
      <LiveStatusReporter
        liveCount={wallets.length}
        totalCount={wallets.length}
        label={`Wallets · ${wallets.length} tracked`}
        allLiveOverride={null}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-tos-text">Wallets</h1>
          <p className="mt-1 max-w-md text-[12px] leading-relaxed text-tos-muted">
            Read-only tracking for Ledger, Tangem, Trust, MetaMask, Coinbase and Rise payout
            addresses. AXE never stores private keys — only public addresses you add.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/70 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-200"
          >
            <Plus className="h-3.5 w-3.5" />
            Add wallet
          </button>
        </div>
      </div>

      {totalUsd != null && wallets.length > 0 ? (
        <GlassPanel className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-tos-dim">
            Estimated total
          </p>
          <p className="mt-1 text-2xl font-semibold text-tos-text">{formatUsd(totalUsd)}</p>
          <p className="mt-1 text-[11px] text-tos-muted">Across tracked addresses · USD estimate</p>
        </GlassPanel>
      ) : null}

      {showForm ? (
        <GlassPanel className="space-y-3 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
            Add address
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] text-tos-muted">
              Wallet type
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as WalletProvider)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              >
                {WALLET_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] text-tos-muted">
              Chain
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value as WalletChain)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              >
                {WALLET_CHAINS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-[11px] text-tos-muted">
            Public address
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={chain === "bitcoin" ? "bc1… or 1…" : "0x…"}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white"
            />
          </label>
          <label className="block text-[11px] text-tos-muted">
            Label (optional)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Cold storage"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={saving || !address.trim()}
              className="rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Track address"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg px-3 py-2 text-sm text-tos-muted"
            >
              Cancel
            </button>
          </div>
        </GlassPanel>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <GlassPanel className="p-6 text-center text-sm text-tos-muted">Loading wallets…</GlassPanel>
      ) : wallets.length === 0 ? (
        <GlassPanel className="p-6 text-center">
          <Wallet className="mx-auto mb-3 h-8 w-8 text-white/25" />
          <p className="text-sm text-tos-muted">No wallets tracked yet.</p>
          <p className="mt-2 text-[12px] text-tos-dim">
            Add a public address from Ledger, Tangem, Trust, MetaMask, Coinbase or your Rise payout
            wallet.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-4">
          {WALLET_PROVIDERS.filter((p) => grouped.has(p.id)).map((meta) => {
            const list = grouped.get(meta.id) ?? [];
            return (
              <section key={meta.id}>
                <h2 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  <Shield className="h-3 w-3" />
                  {meta.name}
                  <span className="text-white/25">· {meta.subtitle}</span>
                </h2>
                <ul className="space-y-2">
                  {list.map((w) => (
                    <li key={w.id}>
                      <GlassPanel className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-tos-text">
                              {w.label || meta.name}
                              <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-tos-dim">
                                {w.chain}
                              </span>
                            </p>
                            <p className="mt-1 font-mono text-[11px] text-tos-muted">
                              {shortAddress(w.address)}
                            </p>
                            {w.balance ? (
                              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <span className={`text-sm font-semibold ${meta.accent}`}>
                                  {formatNative(w.balance.nativeAmount, w.balance.nativeSymbol)}
                                </span>
                                <span className="text-[11px] text-tos-dim">
                                  ≈ {formatUsd(w.balance.usdEstimate)}
                                </span>
                                {w.balance.error ? (
                                  <span className="text-[10px] text-amber-300/80">
                                    {w.balance.error}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <p className="mt-2 text-[11px] text-tos-dim">
                                Tap Refresh to load balance
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRemove(w.id)}
                            className="rounded-lg p-2 text-tos-dim hover:bg-white/[0.06] hover:text-rose-300"
                            aria-label="Remove wallet"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </GlassPanel>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <GlassPanel className="p-4">
        <div className="flex items-start gap-3">
          <Bitcoin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/70" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90">
              Rise payouts
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-tos-muted">
              Add your Rise payout wallet address here to track balances read-only — same as your
              other wallets. Live payouts via Rise API can be added later; this view never moves
              funds.
            </p>
            <a
              href="https://www.riseworks.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400/90 hover:text-cyan-300"
            >
              Rise dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
