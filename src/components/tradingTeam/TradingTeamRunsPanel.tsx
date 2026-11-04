"use client";

import { useCallback, useEffect, useState } from "react";
import type { TradingTeamRunListItem } from "@/lib/tradingTeam/types";

export function TradingTeamRunsPanel() {
  const [runs, setRuns] = useState<TradingTeamRunListItem[]>([]);
  const [pendingMigration, setPendingMigration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trading-team/runs?limit=40", { cache: "no-store" });
      const body = (await res.json()) as {
        ok: boolean;
        runs?: TradingTeamRunListItem[];
        error?: string;
        pendingMigration?: boolean;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        setRuns([]);
        return;
      }
      setPendingMigration(Boolean(body.pendingMigration));
      setRuns(body.runs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Trading Team (TEST)</h1>
          <p className="mt-1 text-sm text-white/60">
            Read-only view of AXE Core&apos;s 6-bot pipeline. Orders (if any) only hit your{" "}
            <span className="font-mono text-white/80">MT5 DEMO 500K</span> account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void load(); }}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-white/50">Loading…</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {pendingMigration && (
        <p className="text-sm text-amber-200/90">
          Table not applied yet — run Core migration <code className="font-mono">20261029233000_core_trading_team.sql</code>.
        </p>
      )}
      {!loading && !error && !pendingMigration && runs.length === 0 && (
        <p className="text-sm text-white/50">No cycles logged yet. Run a cycle from AXE Core → Trading Intel → Team.</p>
      )}

      {runs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 text-white/50">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Verdict</th>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2">Guard</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Exec</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const execOk = (r.execution as { ok?: boolean; attempted?: boolean } | null)?.ok;
                const attempted = (r.execution as { attempted?: boolean } | null)?.attempted;
                return (
                  <tr key={r.id} className="border-t border-white/5 text-white/85">
                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{r.verdict ?? r.status}</td>
                    <td className="px-3 py-2 font-mono">{r.symbol ?? "—"}</td>
                    <td className="px-3 py-2">{r.side ?? "—"}</td>
                    <td className="px-3 py-2">{r.account_guard}</td>
                    <td className="px-3 py-2 max-w-[140px] truncate">{r.account_label ?? "—"}</td>
                    <td className="px-3 py-2">
                      {!attempted ? "propose" : execOk ? "filled" : "failed"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
