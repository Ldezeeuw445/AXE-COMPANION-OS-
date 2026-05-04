import Link from "next/link";
import { Bell } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  symbol: string | null;
  type: string;
  condition: string | null;
  threshold: number | null;
  keyword: string | null;
  status: string;
  triggered_at: string | null;
  created_at: string;
};

type PageProps = {
  searchParams: Promise<{ symbol?: string }>;
};

export default async function AlertsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const focusSymbol = (sp.symbol ?? "").trim().toUpperCase();

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-2">
        <ScreenHeader title="Alerts" subtitle="Saved price, risk and context alerts." left={<Bell className="h-6 w-6 text-cyan-400/80" />} />
        <p className="text-sm text-tos-muted">Sign in and configure Supabase to use alerts.</p>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-2">
        <ScreenHeader title="Alerts" subtitle="Saved price, risk and context alerts." left={<Bell className="h-6 w-6 text-cyan-400/80" />} />
        <p className="text-sm text-tos-muted">Sign in to view alerts.</p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("user_alerts")
    .select("id,symbol,type,condition,threshold,keyword,status,triggered_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const loadError = error?.message ?? null;
  const rows = (data ?? []) as Row[];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-2">
      <ScreenHeader
        title="Alerts"
        subtitle="Configure alerts here; push delivery stays explicit when wired. No simulated triggers."
        left={<Bell className="h-6 w-6 text-cyan-400/80" aria-hidden />}
      />

      {focusSymbol ? (
        <p className="text-xs text-tos-muted">
          Focus symbol: <span className="font-mono text-cyan-200/90">{focusSymbol}</span> —{" "}
          <Link href="/alerts" className="text-cyan-400 hover:underline">
            clear
          </Link>
        </p>
      ) : null}

      {loadError ? (
        <GlassPanel className="p-4 text-sm text-tos-muted">
          <p className="text-amber-200/90">Could not load alerts.</p>
          <p className="mt-2 text-xs text-tos-dim">
            Alerts storage is not available on this project yet. Add the <span className="font-mono">user_alerts</span> table and RLS in Supabase to
            enable saved alerts.
          </p>
          <p className="mt-1 font-mono text-[10px] text-tos-dim">{loadError}</p>
        </GlassPanel>
      ) : rows.length === 0 ? (
        <GlassPanel className="p-4 text-sm text-tos-muted">
          <p>No saved alerts yet. Use Chart or Watchlist quick links, or insert rows in Supabase once you define alert rules in-product.</p>
          <p className="mt-3 text-xs text-tos-dim">
            Types supported in schema: price, position_risk, news, macro, journal_reminder — set <span className="font-mono">type</span> when creating
            rows.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          {rows
            .filter((r) => (focusSymbol ? (r.symbol ?? "").toUpperCase() === focusSymbol : true))
            .map((r) => (
              <GlassPanel key={r.id} className="!p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-tos-text">{r.symbol ?? "—"}</span>
                  <Badge variant="long">{r.status}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-tos-dim">
                  {r.type}
                  {r.condition ? ` · ${r.condition}` : ""}
                  {r.threshold != null ? ` · ${r.threshold}` : ""}
                  {r.keyword ? ` · “${r.keyword}”` : ""}
                </p>
                <p className="mt-1 text-[10px] text-tos-dim">
                  {r.triggered_at ? `Triggered ${r.triggered_at}` : "Not triggered"}
                  {" · "}
                  {r.created_at}
                </p>
              </GlassPanel>
            ))}
        </div>
      )}

      <Link href="/chat" className="text-center text-xs text-cyan-400 hover:underline">
        Ask AXE to draft an alert rule in chat
      </Link>
    </div>
  );
}
