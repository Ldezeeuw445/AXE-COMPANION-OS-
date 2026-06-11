import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LegalNavLinks } from "@/components/legal/LegalNavLinks";
import { LandingOpenAppQr } from "@/components/marketing/LandingOpenAppQr";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { AmbientSoundToggles } from "@/components/settings/AmbientSoundToggles";
import { ChartThemeSelector } from "@/components/settings/ChartThemeSelector";
import { listLearningMetricsPreview } from "@/services/learningService";
import { listMemoryPreview } from "@/services/memoryService";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { listWatchlistItems, getAccountName } from "@/app/(app)/settings/actions";
import { PinnedContextEditor } from "@/components/settings/PinnedContextEditor";
import { WatchlistManager } from "@/components/settings/WatchlistManager";
import { AccountNameEditor } from "@/components/settings/AccountNameEditor";
import { PushPermission } from "@/components/push/PushPermission";
import { InstallPrompt } from "@/components/push/InstallPrompt";
import { LiveTradingPanel } from "@/components/settings/LiveTradingPanel";
import { getLiveTradingServerState } from "@/lib/liveTrading/serverFlag";
import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";

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
  const [metrics, memory, conversation, watchlist, accountName, liveTrading] = await Promise.all([
    listLearningMetricsPreview(),
    listMemoryPreview(),
    getPrimaryConversation(),
    listWatchlistItems(),
    getAccountName(),
    getLiveTradingServerState(),
  ]);

  const toolbarSections: AxeToolbarSection[] = [
    {
      id: "ask-axe",
      title: "Ask AXE",
      items: [
        {
          id: "profile",
          label: "Tune my AXE session brief",
          description: "Bias, style, pairs, rules",
          href: `/chat?q=${encodeURIComponent(
            "[AXE · setup]\nHelp me write a strong pinned context: my trading style, risk rules, active pairs, and what you should always remember.",
          )}`,
        },
        {
          id: "push",
          label: "Push notification setup",
          description: "What’s live today + what’s needed",
          href: `/chat?q=${encodeURIComponent(
            "[AXE · push]\nExplain how push notifications work in AXE Companion today. What is wired, what’s missing, and what I should do on iOS/Android/PWA.",
          )}`,
        },
      ],
    },
    {
      id: "shortcuts",
      title: "Shortcuts",
      items: [
        { id: "accounts", label: "Accounts", description: "MT5 connect + sync", href: "/accounts" },
        { id: "alerts", label: "Alerts", description: "Saved rules", href: "/alerts" },
        { id: "subscription", label: "Subscription", description: "Manage plan", href: "/upgrade" },
      ],
    },
  ];

  // Honest live counter: each section reports green only if the
  // underlying Supabase read actually returned a configured value.
  // No `allLiveOverride` — if conversation isn't seeded yet, the
  // pulse stays amber until the user sends a first chat message.
  const liveSections =
    (metrics.length > 0 ? 1 : 0) +
    (memory.length > 0 ? 1 : 0) +
    (conversation ? 1 : 0) +
    (watchlist.length > 0 ? 1 : 0) +
    (accountName ? 1 : 0) +
    1; // liveTrading flag always loaded
  return (
    <div className="axe-stagger-enter flex shrink-0 flex-col pb-4">
      <LiveStatusReporter
        liveCount={liveSections}
        totalCount={6}
        label="Settings · Supabase"
      />
      <AxeTopBarInjector
        title="Settings"
        subtitle="You · AXE · one Supabase"
        sections={toolbarSections} center={<span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Settings</span>} />

      {/* Account Name */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Active account label
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          A short name so AXE can reference your account in conversation — e.g. &quot;FTMO Challenge&quot; or &quot;Live IC Markets&quot;.
          AXE uses your connected AXE MT5 Cloud account to understand balance, equity, margin, trades and open positions — no manual entry.
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
          AXE uses your watchlist to filter chat context, news, macro and alerts. Add the pairs you care about most.
        </p>
        <div className="mt-3">
          <WatchlistManager items={watchlist} />
        </div>
      </GlassPanel>

      {/* Push Notifications + PWA install */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Push notifications
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          Lock-screen alerts with sound and vibration — for price triggers,
          AXE pings, position-risk and high-impact news. AXE Companion is a
          standalone app: install it on this device and you don&apos;t need
          Trading OS for anything.
        </p>
        <div className="mt-3">
          <PushPermission />
        </div>
        <div className="mt-3">
          <InstallPrompt />
        </div>
      </GlassPanel>

      {/* Live trading — sits between push and Trading OS callout. Off by default;
          enabling requires a 3-checkbox + typed-phrase disclaimer. The
          flag itself is account-wide (Supabase), the arming window stays
          per-device. */}
      <div className="mb-4">
        <LiveTradingPanel initialEnabled={liveTrading.enabled} />
      </div>

      {/* Trading OS upcoming terminal — short, premium, no MT5 token chatter */}
      <GlassPanel glow="none" className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-white/80">
            Trading OS terminal · in development
          </h2>
          <Badge variant="long">Same Supabase</Badge>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-tos-muted">
          AXE Companion is the brain. Trading OS is the upcoming premium terminal — live charts, market intelligence,
          alerts, execution review and multi-source context, with AXE embedded in every workflow. Your account, memory
          and journal carry over when the terminal ships.
        </p>
        <p className="mt-2 text-[11px] text-tos-dim">
          Need a local MT5 bridge token? It lives under{" "}
          <Link href="/accounts" className="text-white/80 underline-offset-2 hover:underline">
            Accounts → Advanced
          </Link>
          .
        </p>
      </GlassPanel>

      {/* Learning */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Assistant learning
        </h2>
        {metrics.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-tos-muted">
            AXE hasn&apos;t collected enough signal yet. Send a few chats, save trades
            to the journal, and accept or reject AXE&apos;s setup proposals — your
            alignment, confidence and feedback metrics will populate here within a
            few sessions.
          </p>
        ) : (
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
        )}
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

      {/* Chart Theme */}
      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Chart theme
        </h2>
        <p className="mb-3 mt-1 text-xs text-tos-muted">
          Pick a background for the chart canvas. Syncs across devices.
        </p>
        <ChartThemeSelector />
      </GlassPanel>

      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">Appearance &amp; Sound</h2>
        <p className="mb-3 mt-1 text-xs text-tos-muted">
          Ambient visuals and interaction sounds. These are cosmetic — they never affect trading.
        </p>
        <AmbientSoundToggles />
      </GlassPanel>

      <GlassPanel className="mb-4 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">Subscription</h2>
        <p className="mt-1 text-xs text-tos-muted">
          Free includes the full experience with 20 chat sends per day. Pro removes the daily cap when checkout opens.
        </p>
        <Link
          href="/upgrade"
          className="mt-3 inline-flex text-xs font-medium text-tos-accent-cyan hover:underline"
        >
          Manage subscription →
        </Link>
      </GlassPanel>

      {/* Mobile install — folded by default, no QR clutter on the main flow */}
      <details className="group mb-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0d]/90">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-tos-dim [&::-webkit-details-marker]:hidden">
          Install on another device
          <span className="text-[10px] text-tos-dim/85 group-open:hidden">Open</span>
        </summary>
        <div className="border-t border-white/[0.05] px-4 py-4">
          <p className="text-xs text-tos-muted">
            Scan or open the signed-in chat route on your phone to install AXE as a mobile app.
          </p>
          <div className="mt-3">
            <LandingOpenAppQr />
          </div>
        </div>
      </details>

      <GlassPanel className="mb-6 p-4">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Legal &amp; policies
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          Draft documents — replace placeholders and review with counsel before marketing to retail.
        </p>
        <LegalNavLinks className="mt-4" />
      </GlassPanel>

      <SignOutButton />
    </div>
  );
}
