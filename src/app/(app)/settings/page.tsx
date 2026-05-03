import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { listLearningMetricsPreview } from "@/services/learningService";
import { listMemoryPreview } from "@/services/memoryService";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { listWatchlistItems, getAccountName } from "@/app/(app)/settings/actions";
import { PinnedContextEditor } from "@/components/settings/PinnedContextEditor";
import { WatchlistManager } from "@/components/settings/WatchlistManager";
import { AccountNameEditor } from "@/components/settings/AccountNameEditor";
import { PushPermission } from "@/components/push/PushPermission";

async function getPrimaryConversation() {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return null;
  const { supabase, user } = authed;
  const { data } = await supabase
    .from("conversations")
    .select("id,pinned_context,messages(count)")
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false });
  if (!data || data.length === 0) return null;
  const sorted = [...data].sort((a, b) => {
    const cA = Array.isArray(a.messages) ? (a.messages[0] as { count: number })?.count ?? 0 : 0;
    const cB = Array.isArray(b.messages) ? (b.messages[0] as { count: number })?.count ?? 0 : 0;
    return cB - cA;
  });
  return sorted[0] as { id: string; pinned_context: string | null };
}

export default async function SettingsPage() {
  const [metrics, memory, conversation, watchlist, accountName] = await Promise.all([
    listLearningMetricsPreview(),
    listMemoryPreview(),
    getPrimaryConversation(),
    listWatchlistItems(),
    getAccountName(),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-4">
      <ScreenHeader title="Settings" subtitle="You · Assistant · Terminal" />

      {/* Account Name */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Active account label
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          A short name so AXE can reference your account in conversation — e.g. &quot;FTMO Challenge&quot; or &quot;Live IC Markets&quot;.
          Balance, equity, margin and open positions are pulled live from TradingOS automatically — no input needed.
        </p>
        <div className="mt-3">
          <AccountNameEditor initialValue={accountName} />
        </div>
      </GlassPanel>

      {/* Pinned Context */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          AXE session brief
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          AXE reads this at the top of every message. Use it to set your bias, key levels,
          active pairs, and trading style — so you never have to repeat yourself.
        </p>
        <div className="mt-3">
          {conversation ? (
            <PinnedContextEditor
              conversationId={conversation.id}
              initialValue={conversation.pinned_context ?? ""}
            />
          ) : (
            <p className="text-xs text-tos-dim">
              Start a chat first to enable the session brief.
            </p>
          )}
        </div>
      </GlassPanel>

      {/* Watchlist Manager */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          My watchlist
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          TradingOS syncs your active watches automatically. Add extra pairs here for instruments
          you follow outside the terminal — AXE merges both lists on every message.
        </p>
        <div className="mt-3">
          <WatchlistManager items={watchlist} />
        </div>
      </GlassPanel>

      {/* Push Notifications */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Push notifications
        </h2>
        <div className="mt-3">
          <PushPermission />
        </div>
      </GlassPanel>

      {/* Terminal Status */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          TradingOS connection
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="long">Synced via Supabase</Badge>
        </div>
        <p className="mt-2 text-xs text-tos-muted">
          Both TradingOS and this Companion read and write the same database in real time —
          alerts, memory, watchlist, chat, vault and actions stay in sync automatically.
        </p>
      </GlassPanel>

      {/* Learning */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Assistant learning
        </h2>
        <ul className="mt-3 space-y-2">
          {metrics.map((m) => (
            <li
              key={m.metricKey}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-tos-muted">{m.label}</span>
              <span className="font-mono text-tos-text">
                {m.metricKey === "alignment_score" ||
                m.metricKey === "approved_setup_rate"
                  ? `${Math.round(m.value * 100)}%`
                  : m.value}
                {m.trend ? (
                  <span
                    className={
                      m.trend === "up"
                        ? "ml-1 text-tos-long"
                        : m.trend === "down"
                          ? "ml-1 text-tos-short"
                          : "ml-1 text-tos-dim"
                    }
                  >
                    {m.trend === "up" ? "↑" : m.trend === "down" ? "↓" : "→"}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/cockpit"
          className="mt-4 inline-flex text-xs font-medium text-[color:var(--icon-cockpit)] hover:underline"
        >
          Open Assistant cockpit →
        </Link>
      </GlassPanel>

      {/* Memory */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Memory excerpts
        </h2>
        <ul className="mt-3 space-y-3">
          {memory.map((mem) => (
            <li key={mem.id}>
              <p className="text-[10px] uppercase tracking-wider text-[color:var(--icon-vault)]">
                {mem.scope}
                {mem.key ? ` · ${mem.key}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-tos-muted">{mem.excerpt}</p>
            </li>
          ))}
        </ul>
      </GlassPanel>

      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Plan & billing
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          Free includes the full experience with 20 chat sends per day (UTC). Pro removes the daily cap.
        </p>
        <Link
          href="/upgrade"
          className="mt-3 inline-flex text-xs font-medium text-tos-accent-cyan hover:underline"
        >
          View plans →
        </Link>
      </GlassPanel>

      <GlassPanel className="mb-6 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Execution connections
        </h2>
        <p className="mt-2 text-xs text-tos-dim">
          Broker / execution API placeholders — disabled until approval flow is
          production-tested.
        </p>
      </GlassPanel>

      <SignOutButton />
    </div>
  );
}
