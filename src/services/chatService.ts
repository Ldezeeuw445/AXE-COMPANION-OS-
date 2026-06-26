import { mockMessages } from "@/services/mock/seed";
import {
  getAuthedServiceSupabase,
  SERVICES_USE_MOCK_DATA,
} from "@/services/serviceSupabase";
import {
  buildAxeMessagesFromContext,
  callAxe,
  callAxeAfterTool,
  callAxeFinal,
  callAxeStreaming,
  callAxeFinalStreaming,
  computeFibonacci,
  computeOrderBlock,
  computePdhPdl,
  computeTrendline,
  type AxeToolCall,
  type TrackCommitmentArgs,
} from "@/services/axeService";
import {
  fetchEconomicCalendar,
  formatEconomicCalendar,
} from "@/services/marketDataService";
import { fetchTradingOSContext } from "@/services/contextService";
import { loadNews } from "@/lib/market/newsProvider";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { buildAxeKnowledgeLayerBlock } from "@/lib/axe/knowledgeLayerContext";
import { tryConsumeChatQuota, refundChatQuota } from "@/lib/chatQuota";
import { buildUserAlertFromChatTool } from "@/lib/alerts/fromChatTool";
import { autoJournalTrades } from "@/services/journalingService";
import { handlePrepareExecutionRequest, handleRouteChartAction } from "@/services/axeToolHandlers";
import type { ChatMessage as DomainChatMessage, ConversationSummary } from "@/types/domain";
import type { LLMMessage, LLMRequest } from "@/services/llmClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { brokerPricingState, canonicalBrokerPrice } from "@/lib/runtime/runtimeTruth";

export const CHAT_USES_MOCK_DATA = SERVICES_USE_MOCK_DATA;

type ConversationRow = {
  id: string;
  title: string;
  pinned_context: string | null;
  last_message_at: string;
};

type MessageRow = {
  id: string;
  role: DomainChatMessage["role"];
  content: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

function mapConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    pinnedContext: row.pinned_context ?? "",
    lastMessageAt: row.last_message_at,
  };
}

function mapMessage(row: MessageRow): DomainChatMessage {
  const metadata = row.metadata ?? {};
  const feedbackRaw = metadata.feedback;
  const feedback = feedbackRaw === "up" || feedbackRaw === "down" ? feedbackRaw : null;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    feedback,
  };
}

function formatBrokerPriceForChat(context: Awaited<ReturnType<typeof fetchTradingOSContext>>, requestedSymbol: string): string {
  const chart = context.axe_context?.chart;
  const activeSymbol = (chart?.symbol ?? context.symbol ?? "").toUpperCase();
  const brokerSymbol = (chart?.brokerSymbol ?? "").toUpperCase();
  const requested = requestedSymbol.toUpperCase().replace("/", "").trim();
  if (!chart || !activeSymbol || !brokerSymbol) {
    return "Live broker pricing unavailable. AXE has no active broker-resolved chart context for this session.";
  }
  if (requested && requested !== activeSymbol && requested !== brokerSymbol) {
    return `Live broker pricing unavailable for ${requested}. Active chart is ${activeSymbol} mapped to broker symbol ${brokerSymbol}.`;
  }
  const state = brokerPricingState({
    status: chart.liveStatus,
    updatedAt: chart.updatedAt,
    lastTickAt: chart.lastTickAt,
    lastCandleAt: chart.lastCandleAt,
  });
  const price = canonicalBrokerPrice({
    lastPrice: chart.lastPrice,
    lastBid: chart.lastBid,
    lastAsk: chart.lastAsk,
  });
  if (price == null) {
    return `Live broker pricing unavailable for ${activeSymbol} (${brokerSymbol}). No canonical broker price is available.`;
  }
  if (state !== "live" && state !== "degraded") {
    return `Live broker pricing unavailable for ${activeSymbol} (${brokerSymbol}). AXE will not use generic provider prices for analysis.`;
  }
  const freshness = chart.lastTickAt
    ? `last broker tick ${chart.lastTickAt}`
    : chart.lastCandleAt
      ? `last broker candle ${chart.lastCandleAt}`
      : chart.updatedAt
        ? `last chart update ${chart.updatedAt}`
        : "timestamp unknown";
  return [
    `${activeSymbol} broker price (${brokerSymbol})`,
    `Canonical price: ${price}`,
    `Runtime state: ${state}`,
    `Freshness: ${freshness}`,
    "Use this broker context only. Do not substitute Yahoo, generic provider, memory, or stale snapshot prices.",
  ].join("\n");
}

function resolveJournalAccountId(
  accountId: string | undefined,
  tradingContext: Awaited<ReturnType<typeof fetchTradingOSContext>>,
): string | null {
  if (accountId?.trim()) return accountId.trim();
  return (
    tradingContext.axe_context?.accounts?.activeAccountId ??
    tradingContext.companion_active_account_id ??
    null
  );
}

async function runAutoJournalTool(
  supabase: NonNullable<Awaited<ReturnType<typeof getAuthedServiceSupabase>>>["supabase"],
  userId: string,
  tradingContext: Awaited<ReturnType<typeof fetchTradingOSContext>>,
  args: { account_id?: string; trade_ids?: string[] },
): Promise<string> {
  const accountId = resolveJournalAccountId(args.account_id, tradingContext);
  if (!accountId) {
    return "No active MT5 account linked. Connect one under Accounts, then ask me to journal again.";
  }

  const result = await autoJournalTrades(supabase, userId, accountId, args.trade_ids);
  if (!result.ok) return `Auto-journal failed: ${result.error}`;
  if (result.journaled === 0) {
    return result.message ?? "All recent closed trades already have AXE journal scores.";
  }

  const lines = result.results.map(
    (r) => `${r.symbol} → ${r.axe_label} (${r.alignment_score}/100)`,
  );
  return `Journaled ${result.journaled} trade(s):\n${lines.join("\n")}\nOpen [[link:/journal|Journal]] to review.`;
}

export async function ensurePrimaryConversation(
  userId: string,
  existingAuth?: { supabase: SupabaseClient; user: User } | null,
): Promise<ConversationSummary | null> {
  const authed = existingAuth ?? await getAuthedServiceSupabase();
  if (!authed || authed.user.id !== userId) return null;
  const { supabase } = authed;

  const { data: conversations, error: convErr } = await supabase
    .from("conversations")
    .select("id,title,pinned_context,last_message_at,messages(count)")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false });

  if (convErr) {
    console.error("Failed to load conversations", convErr);
    return null;
  }

  if (conversations && conversations.length > 0) {
    const sorted = [...conversations].sort((a, b) => {
      const countA = Array.isArray(a.messages) ? (a.messages[0] as { count: number })?.count ?? 0 : 0;
      const countB = Array.isArray(b.messages) ? (b.messages[0] as { count: number })?.count ?? 0 : 0;
      return countB - countA;
    });
    return mapConversation(sorted[0] as ConversationRow);
  }

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      title: "AXE",
      pinned_context: null,
      last_message_at: new Date().toISOString(),
    })
    .select("id,title,pinned_context,last_message_at")
    .single();

  if (createError) {
    console.error("Failed to create conversation", createError);
    return null;
  }

  return mapConversation(created as ConversationRow);
}

export async function getChatThread(): Promise<{
  conversation: ConversationSummary;
  messages: DomainChatMessage[];
}> {
  const authed = await getAuthedServiceSupabase();
  if (authed) {
    const conversation = await ensurePrimaryConversation(authed.user.id, authed);
    if (conversation) {
      const { data, error } = await authed.supabase
        .from("messages")
        .select("id,role,content,created_at,metadata")
        .eq("conversation_id", conversation.id)
        .eq("user_id", authed.user.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load messages", error);
      } else {
        return {
          conversation,
          messages: (data as MessageRow[]).map(mapMessage),
        };
      }
    }
  }

  return {
    conversation: {
      id: "demo",
      title: "AXE",
      pinnedContext: "",
      lastMessageAt: new Date().toISOString(),
    },
    messages: mockMessages,
  };
}

export type SendChatMessageResult =
  | { ok: true }
  | { ok: false; quotaExceeded?: boolean; aiFailed?: boolean; errorDetail?: string };

export async function sendChatMessage(
  text: string,
  imageBase64?: string,
  imageType?: string,
  symbol?: string,
  tf?: string,
  edgeAuth?: { supabase: SupabaseClient; user: User } | null,
): Promise<SendChatMessageResult> {
  const trimmed = text.trim();
  if (!trimmed && !imageBase64) return { ok: false };

  const authed = edgeAuth ?? await getAuthedServiceSupabase();
  if (!authed) return { ok: false };

  const conversation = await ensurePrimaryConversation(authed.user.id, authed);
  if (!conversation) return { ok: false };

  const { supabase, user } = authed;

  const quota = await tryConsumeChatQuota(supabase, user.id);
  if (!quota.ok) {
    if (quota.quotaExceeded) return { ok: false, quotaExceeded: true };
    return { ok: false };
  }
  const consumed = quota.consumed;

  // 1. Save user message
  const userContent = trimmed || (imageBase64 ? "[chart attached]" : "");
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    user_id: user.id,
    role: "user",
    content: imageBase64 && trimmed ? `${trimmed} [chart attached]` : userContent,
  });

  if (insertError) {
    console.error("Failed to insert chat message", insertError);
    if (consumed) await refundChatQuota(supabase, user.id);
    return { ok: false };
  }

  // 2. Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .eq("user_id", user.id);

  // 3. Fetch message history + central TradingOS context in parallel
  const [historyResult, context, knowledgeLayer] = await Promise.all([
    supabase
      .from("messages")
      .select("role,content")
      .eq("conversation_id", conversation.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),

    fetchTradingOSContext(user.id, supabase, symbol, tf),
    buildAxeKnowledgeLayerBlock(supabase, user.id, trimmed, symbol ?? null),
  ]);

  const history = ((historyResult.data ?? []) as { role: "user" | "assistant"; content: string }[])
    .reverse()
    .slice(0, -1);

  // 4. Inject candles_summary from pinned_context
  const contextWithCandles = {
    ...context,
    candles_summary: conversation.pinnedContext || null,
    knowledge_layer: knowledgeLayer,
  };

  // 5. Build OpenAI messages using the unified context
  const aiMessages = buildAxeMessagesFromContext(
    contextWithCandles,
    history,
    trimmed || "(the trader attached a chart image — analyse it)",
    imageBase64,
    imageType
  );

  const axeResponse = await callAxe(aiMessages as LLMMessage[]);

  // Fire-and-forget push notification to user's subscribed devices
  async function firePush(title: string, body: string, url = "/chat") {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost:5000"}`;
      await fetch(`${baseUrl}/api/push/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, title, body, url }),
      });
    } catch (e) {
      console.warn("[push] send failed:", e);
    }
  }

  // Helper: execute a single tool call and return its string result
  async function executeTool(tc: AxeToolCall): Promise<string> {
    if (tc.tool === "create_alert") {
      const { title, body } = tc.args;
      const row = buildUserAlertFromChatTool(tc.args);
      const { error: alertError } = await supabase.from("user_alerts").insert({
        user_id: user.id,
        ...row,
      });
      if (alertError) {
        console.error("[create_alert] insert failed:", alertError.message);
        return `Alert creation failed: ${alertError.message}`;
      }
      firePush(`AXE Alert: ${title}`, body ?? "Alert set.", "/alerts");
      return "Alert created — visible under Alerts in the app.";

    } else if (tc.tool === "track_commitment") {
      const { description, symbol: commitSymbol } = tc.args as TrackCommitmentArgs;
      const { error: commitError } = await supabase.from("axe_commitments").insert({
        user_id: user.id,
        description,
        symbol: commitSymbol?.toUpperCase() ?? null,
        status: "open",
      });
      if (commitError) console.error("[track_commitment] insert failed:", commitError.message);
      return commitError ? "Failed to record commitment." : "Commitment tracked — I'll follow up on this.";

    } else if (tc.tool === "get_live_price") {
      return formatBrokerPriceForChat(contextWithCandles, tc.args.symbol);

    } else if (tc.tool === "get_economic_calendar") {
      const calendar = await fetchEconomicCalendar(tc.args.currency, tc.args.impact);
      return "error" in calendar ? calendar.error : formatEconomicCalendar(calendar);

    } else if (tc.tool === "save_note") {
      const { content, tag } = tc.args;
      const entryKey = `note-${Date.now()}`;
      const { error: noteError } = await supabase.from("assistant_memory_entries").insert({
        user_id: user.id, scope: "notes", entry_key: entryKey,
        content: tag ? `[${tag}] ${content}` : content,
      });
      return noteError ? "Failed to save note." : "Note saved.";

    } else if (tc.tool === "calculate_fibonacci") {
      return computeFibonacci(tc.args);
    } else if (tc.tool === "analyze_orderblock") {
      return computeOrderBlock(tc.args);
    } else if (tc.tool === "analyze_pdh_pdl") {
      return computePdhPdl(tc.args);
    } else if (tc.tool === "calculate_trendline") {
      return computeTrendline(tc.args);

    } else if (tc.tool === "get_news_headlines") {
      const limit = Math.max(1, Math.min(15, Number(tc.args.limit ?? 8)));
      const requested = (tc.args.symbol ?? symbol ?? "").toString().toUpperCase().trim();
      if (!requested) return "No symbol provided and no active pair on this session.";
      try {
        const items = await loadNews({ symbol: requested, watchlist: [], limit });
        if (!items.length) {
          return `No headlines available for ${requested}. Either no provider is configured (Perigon / Finnhub / EODHD) or the upstream returned nothing in the last few hours.`;
        }
        const lines = items.slice(0, limit).map((n) => {
          const when = (() => {
            const d = new Date(n.publishedAt);
            return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(11, 16) + "Z";
          })();
          const src = n.source ? ` (${n.source})` : "";
          return `${when}  ${n.title}${src}`;
        });
        return `HEADLINES for ${requested} (top ${lines.length})\n${lines.join("\n")}`;
      } catch (e) {
        return `News fetch failed: ${e instanceof Error ? e.message : "unknown error"}.`;
      }

    } else if (tc.tool === "get_smart_money_intel") {
      try {
        const focus = (tc.args.symbol ?? "").toString().toUpperCase().trim() || undefined;
        const intel = await loadIntelSnapshot({ symbol: focus });
        if (!intel.hasLiveData) {
          return "Smart-money intel is limited right now. SEC insider filings and cached DB rows may still be available once feeds warm — Unusual Whales premium flow requires a valid UNUSUAL_WHALES_TOKEN on Supabase.";
        }
        const lines: string[] = [];
        if (intel.tide) {
          const callM = (intel.tide.netCallPremium / 1e6).toFixed(1);
          const putM = (intel.tide.netPutPremium / 1e6).toFixed(1);
          lines.push(`MARKET TIDE: ${intel.tide.bias.toUpperCase()} (calls $${callM}M / puts $${putM}M)`);
        }
        if (intel.insiders.length > 0) {
          lines.push(
            "INSIDER (Form 4): " +
              intel.insiders
                .slice(0, 3)
                .map((r) => `${r.ticker} ${r.type} ${r.insider} $${(r.value / 1e6).toFixed(2)}M (${r.date})`)
                .join(" | "),
          );
        }
        if (intel.senate.length > 0) {
          lines.push(
            "CONGRESS: " +
              intel.senate
                .slice(0, 3)
                .map((r) => `${r.ticker} ${r.direction} ${r.politician} ${r.size} (${r.date})`)
                .join(" | "),
          );
        }
        if (intel.darkPool.length > 0) {
          lines.push(
            "DARK POOL: " +
              intel.darkPool
                .slice(0, 3)
                .map((r) => `${r.symbol} ${r.size.toLocaleString()} @ $${r.price.toFixed(2)} = $${(r.notional / 1e6).toFixed(2)}M`)
                .join(" | "),
          );
        }
        if (intel.options.length > 0) {
          lines.push(
            "OPTIONS FLOW: " +
              intel.options
                .slice(0, 3)
                .map((r) => `${r.symbol} ${r.side} ${r.strike} ${r.exp} $${(r.premium / 1e6).toFixed(2)}M`)
                .join(" | "),
          );
        }
        return lines.length > 0 ? lines.join("\n") : "Smart-money intel returned no rows.";
      } catch (e) {
        return `Intel fetch failed: ${e instanceof Error ? e.message : "unknown error"}.`;
      }

    } else if (tc.tool === "list_alerts") {
      const sym = (tc.args.symbol ?? "").toString().toUpperCase().trim();
      const includePaused = tc.args.include_paused !== false;
      let q = supabase
        .from("user_alerts")
        .select("id,symbol,type,condition,threshold,keyword,status,triggered_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (sym) q = q.eq("symbol", sym);
      if (!includePaused) q = q.eq("status", "active");
      const { data, error } = await q;
      if (error) return `Could not load alerts: ${error.message}`;
      if (!data || data.length === 0) {
        return sym ? `No alerts on ${sym}.` : "No alerts saved yet.";
      }
      const lines = data.map((a) => {
        const cond =
          a.condition && a.threshold != null
            ? `${a.condition} ${a.threshold}`
            : a.keyword
              ? `keyword "${a.keyword}"`
              : "";
        const status = a.status === "active" ? "ACTIVE" : a.status?.toUpperCase() ?? "?";
        const fired = a.triggered_at ? `  fired ${a.triggered_at.slice(0, 16).replace("T", " ")}Z` : "";
        return `${a.id}  [${status}] ${a.symbol ?? "—"} ${a.type} ${cond}${fired}`;
      });
      return `ALERTS (${data.length})\n${lines.join("\n")}`;

    } else if (tc.tool === "update_alert") {
      const { alert_id, action } = tc.args;
      if (!alert_id) return "alert_id is required.";
      if (action === "delete") {
        const { error } = await supabase.from("user_alerts").delete().eq("id", alert_id).eq("user_id", user.id);
        return error ? `Delete failed: ${error.message}` : "Alert deleted.";
      }
      const nextStatus = action === "pause" ? "paused" : "active";
      const { error } = await supabase
        .from("user_alerts")
        .update({ status: nextStatus })
        .eq("id", alert_id)
        .eq("user_id", user.id);
      if (error) return `Update failed: ${error.message}`;
      return action === "pause" ? "Alert paused." : "Alert resumed.";

    } else if (tc.tool === "read_journal") {
      const sym = (tc.args.symbol ?? "").toString().toUpperCase().trim();
      const days = Math.max(1, Math.min(90, Number(tc.args.days ?? 7)));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      // Strip broker suffixes (.x, .r, etc.) for fuzzy symbol matching
      const cleanSym = (raw: string) => raw.toUpperCase().replace(/\.[a-z]+$/i, "").trim();
      const journalQ = supabase
        .from("user_journal_entries")
        .select("symbol,notes,created_at")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(30);
      const tradesQ = supabase
        .from("broker_trades")
        .select("id,symbol,side,volume,pnl,close_time")
        .eq("user_id", user.id)
        .not("close_time", "is", null)
        .gte("close_time", since)
        .order("close_time", { ascending: false })
        .limit(30);
      const [journalRes, tradesRes] = await Promise.all([journalQ, tradesQ]);
      const entries = (journalRes.data ?? []) as { symbol: string; notes: string; created_at: string }[];
      const trades = (tradesRes.data ?? []) as {
        id: string;
        symbol: string;
        side: string;
        volume: number;
        pnl: number;
        close_time: string | null;
      }[];
      const filteredEntries = sym ? entries.filter((e) => cleanSym(e.symbol ?? "") === cleanSym(sym)) : entries;
      const filteredTrades = sym ? trades.filter((t) => cleanSym(t.symbol ?? "") === cleanSym(sym)) : trades;
      const out: string[] = [];
      if (filteredTrades.length > 0) {
        out.push(`CLOSED TRADES (last ${days}d, top ${Math.min(filteredTrades.length, 10)})`);
        out.push(
          ...filteredTrades.slice(0, 10).map((t) => {
            const when = t.close_time?.slice(0, 16).replace("T", " ") ?? "—";
            const pnl = Number(t.pnl ?? 0);
            const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2);
            return `${when}Z  ${t.symbol} ${t.side} ${t.volume}lot  P&L:${pnlStr}`;
          }),
        );
      }
      if (filteredEntries.length > 0) {
        out.push(`\nJOURNAL ENTRIES (last ${days}d, top ${Math.min(filteredEntries.length, 10)})`);
        out.push(
          ...filteredEntries.slice(0, 10).map((e) => {
            const when = e.created_at?.slice(0, 16).replace("T", " ") ?? "—";
            const note = (e.notes ?? "").trim().slice(0, 240);
            return `${when}Z  ${e.symbol}: ${note}`;
          }),
        );
      }
      if (out.length === 0) {
        return `No journal entries or closed trades found in the last ${days}d${sym ? ` for ${sym}` : ""}.`;
      }
      return out.join("\n");

    } else if (tc.tool === "auto_journal_trades") {
      // @ts-ignore — existing tool handler overlap, not caused by Ollama changes
      return runAutoJournalTool(supabase, user.id, context, tc.args);

    } else if (tc.tool === "navigate_to") {
      const { page } = tc.args;
      const params: string[] = [];
      if (tc.args.symbol) params.push(`symbol=${encodeURIComponent(tc.args.symbol.toUpperCase())}`);
      if (tc.args.timeframe) params.push(`tf=${encodeURIComponent(tc.args.timeframe.toUpperCase())}`);
      const href = `/${page}${params.length ? `?${params.join("&")}` : ""}`;
      const label = tc.args.label ?? page.charAt(0).toUpperCase() + page.slice(1);
      // The chat UI parses [[link:...]] markers and renders them as buttons.
      return `Navigation prepared. Render this as a button in your reply: [[link:${href}|${label}]]`;

    } else if (tc.tool === "route_chart_action") {
      return handleRouteChartAction(supabase, user.id, tc.args);

    } else if (tc.tool === "prepare_execution_request") {
      return handlePrepareExecutionRequest(supabase, user.id, tc.args, (title, body, url) => {
        firePush(title, body, url);
      });
    }
    return "Unknown tool.";
  }

  function appendToolRound(
    msgs: LLMMessage[],
    tcs: AxeToolCall[],
    results: { tc: AxeToolCall; result: string }[]
  ): LLMMessage[] {
    return [
      ...msgs,
      {
        role: "assistant",
        content: null,
        tool_calls: tcs.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.tool, arguments: JSON.stringify(tc.args) },
        })),
      },
      ...results.map(
        ({ tc, result }) =>
          ({
            role: "tool" as const,
            tool_call_id: tc.id,
            content: result,
          })
      ),
    ];
  }

  let finalReply: string | null = null;

  if (axeResponse.toolCalls.length > 0) {
    const round1Results = await Promise.all(
      axeResponse.toolCalls.map(async (tc) => ({ tc, result: await executeTool(tc) }))
    );
    const afterRound1 = appendToolRound(aiMessages, axeResponse.toolCalls, round1Results);

    const round2Response = await callAxeAfterTool(afterRound1 as LLMMessage[]);

    if (round2Response.toolCalls.length > 0) {
      const round2Results = await Promise.all(
        round2Response.toolCalls.map(async (tc) => ({ tc, result: await executeTool(tc) }))
      );
      const afterRound2 = appendToolRound(afterRound1, round2Response.toolCalls, round2Results);
      finalReply = await callAxeFinal(afterRound2 as LLMMessage[]);
    } else {
      finalReply = round2Response.content;
    }
  } else {
    finalReply = axeResponse.content;
  }

  if (!finalReply) {
    console.error("[chatService] AXE returned no reply");
    if (consumed) await refundChatQuota(supabase, user.id);
    return { ok: false, aiFailed: true };
  }

  const { error: replyError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    user_id: user.id,
    role: "assistant",
    content: finalReply,
  });

  if (replyError) {
    console.error("Failed to save AXE reply", replyError);
  }

  // Fire-and-forget: extract durable memories from this conversation
  extractMemoriesAsync(supabase, user.id, trimmed, finalReply).catch((e) =>
    console.error("[chatService] memory extraction failed:", e),
  );

  return { ok: true };
}

/* ── Streaming chat ─────────────────────────────────────────────
   SSE-based streaming variant. Emits events via onEvent callback
   as tokens arrive from OpenAI. The final message is saved to DB
   after the stream completes.
   ────────────────────────────────────────────────────────────── */

export type StreamEvent =
  | { type: "status"; phase: "thinking" | "tools" | "responding"; tools?: string[] }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function streamChatMessage(
  text: string,
  onEvent: (event: StreamEvent) => void,
  imageBase64?: string,
  imageType?: string,
  symbol?: string,
  tf?: string,
  edgeAuth?: { supabase: SupabaseClient; user: User } | null,
): Promise<{ ok: boolean; quotaExceeded?: boolean; aiFailed?: boolean; errorDetail?: string }> {
  const trimmed = text.trim();
  if (!trimmed && !imageBase64) return { ok: false };

  const authed = edgeAuth ?? await getAuthedServiceSupabase();
  if (!authed) return { ok: false };

  const conversation = await ensurePrimaryConversation(authed.user.id, authed);
  if (!conversation) return { ok: false };

  const { supabase, user } = authed;

  const quota = await tryConsumeChatQuota(supabase, user.id);
  if (!quota.ok) {
    if (quota.quotaExceeded) return { ok: false, quotaExceeded: true };
    return { ok: false };
  }
  const consumed = quota.consumed;

  // 1. Save user message
  const userContent = trimmed || (imageBase64 ? "[chart attached]" : "");
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    user_id: user.id,
    role: "user",
    content: imageBase64 && trimmed ? `${trimmed} [chart attached]` : userContent,
  });

  if (insertError) {
    console.error("Failed to insert chat message", insertError);
    if (consumed) await refundChatQuota(supabase, user.id);
    return { ok: false };
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .eq("user_id", user.id);

  onEvent({ type: "status", phase: "thinking" });

  // 2. Fetch context in parallel
  const [historyResult, context, knowledgeLayer] = await Promise.all([
    supabase
      .from("messages")
      .select("role,content")
      .eq("conversation_id", conversation.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),
    fetchTradingOSContext(user.id, supabase, symbol, tf),
    buildAxeKnowledgeLayerBlock(supabase, user.id, trimmed, symbol ?? null),
  ]);

  const history = ((historyResult.data ?? []) as { role: "user" | "assistant"; content: string }[])
    .reverse()
    .slice(0, -1);

  const contextWithCandles = {
    ...context,
    candles_summary: conversation.pinnedContext || null,
    knowledge_layer: knowledgeLayer,
  };

  const aiMessages = buildAxeMessagesFromContext(
    contextWithCandles,
    history,
    trimmed || "(the trader attached a chart image — analyse it)",
    imageBase64,
    imageType,
  );

  // --- Reuse the same executeTool + appendToolRound from sendChatMessage ---
  // (tool execution is non-streaming; only the final text response streams)

  async function firePush(title: string, body: string, url = "/chat") {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost:5000"}`;
      await fetch(`${baseUrl}/api/push/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, title, body, url }),
      });
    } catch (e) {
      console.warn("[push] send failed:", e);
    }
  }

  async function executeTool(tc: AxeToolCall): Promise<string> {
    if (tc.tool === "create_alert") {
      const { title, body } = tc.args;
      const row = buildUserAlertFromChatTool(tc.args);
      const { error: alertError } = await supabase.from("user_alerts").insert({
        user_id: user.id,
        ...row,
      });
      if (alertError) return `Alert creation failed: ${alertError.message}`;
      firePush(`AXE Alert: ${title}`, body ?? "Alert set.", "/alerts");
      return "Alert created — visible under Alerts in the app.";
    } else if (tc.tool === "track_commitment") {
      const { description, symbol: commitSymbol } = tc.args as TrackCommitmentArgs;
      const { error: commitError } = await supabase.from("axe_commitments").insert({ user_id: user.id, description, symbol: commitSymbol?.toUpperCase() ?? null, status: "open" });
      return commitError ? "Failed to record commitment." : "Commitment tracked — I'll follow up on this.";
    } else if (tc.tool === "get_live_price") {
      return formatBrokerPriceForChat(contextWithCandles, tc.args.symbol);
    } else if (tc.tool === "get_economic_calendar") {
      const calendar = await fetchEconomicCalendar(tc.args.currency, tc.args.impact);
      return "error" in calendar ? calendar.error : formatEconomicCalendar(calendar);
    } else if (tc.tool === "get_news_headlines") {
      try {
        const requested = (tc.args.symbol ?? "").toString().toUpperCase().trim();
        const limit = Math.max(1, Math.min(20, Number(tc.args.limit ?? 10)));
        const newsItems = await loadNews({ symbol: requested, watchlist: [], limit });
        if (newsItems.length === 0) return requested ? `No recent headlines for ${requested}.` : "No recent headlines available.";
        const lines = newsItems.slice(0, limit).map((n) => {
          const when = (() => { const d = new Date(n.publishedAt); return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(11, 16) + "Z"; })();
          const src = n.source ? ` (${n.source})` : "";
          return `${when}  ${n.title}${src}`;
        });
        return `HEADLINES for ${requested || "MARKET"} (top ${lines.length})\n${lines.join("\n")}`;
      } catch (e) { return `News fetch failed: ${e instanceof Error ? e.message : "unknown error"}.`; }
    } else if (tc.tool === "get_smart_money_intel") {
      try {
        const focus = (tc.args.symbol ?? "").toString().toUpperCase().trim() || undefined;
        const intel = await loadIntelSnapshot({ symbol: focus });
        if (!intel.hasLiveData) return "Smart-money intel unavailable.";
        const lines: string[] = [];
        if (intel.tide) {
          lines.push(`MARKET TIDE: ${intel.tide.bias.toUpperCase()} (calls $${(intel.tide.netCallPremium / 1e6).toFixed(1)}M / puts $${(intel.tide.netPutPremium / 1e6).toFixed(1)}M)`);
        }
        if (intel.insiders.length > 0) lines.push("INSIDER (Form 4): " + intel.insiders.slice(0, 3).map((r) => `${r.ticker} ${r.type} ${r.insider} $${(r.value / 1e6).toFixed(2)}M (${r.date})`).join(" | "));
        if (intel.senate.length > 0) lines.push("CONGRESS: " + intel.senate.slice(0, 3).map((r) => `${r.ticker} ${r.direction} ${r.politician} ${r.size} (${r.date})`).join(" | "));
        if (intel.darkPool.length > 0) lines.push("DARK POOL: " + intel.darkPool.slice(0, 3).map((r) => `${r.symbol} ${r.size.toLocaleString()} @ $${r.price.toFixed(2)} = $${(r.notional / 1e6).toFixed(2)}M`).join(" | "));
        if (intel.options.length > 0) lines.push("OPTIONS FLOW: " + intel.options.slice(0, 3).map((r) => `${r.symbol} ${r.side} ${r.strike} ${r.exp} $${(r.premium / 1e6).toFixed(2)}M`).join(" | "));
        return lines.length > 0 ? lines.join("\n") : "Smart-money intel returned no rows.";
      } catch (e) { return `Intel fetch failed: ${e instanceof Error ? e.message : "unknown error"}.`; }
    } else if (tc.tool === "list_alerts") {
      const sym = (tc.args.symbol ?? "").toString().toUpperCase().trim();
      const includePaused = tc.args.include_paused !== false;
      let q = supabase.from("user_alerts").select("id,symbol,type,condition,threshold,keyword,status,triggered_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (sym) q = q.eq("symbol", sym);
      if (!includePaused) q = q.eq("status", "active");
      const { data, error } = await q;
      if (error) return `Could not load alerts: ${error.message}`;
      if (!data || data.length === 0) return sym ? `No alerts on ${sym}.` : "No alerts saved yet.";
      const lines = data.map((a) => {
        const cond = a.condition && a.threshold != null ? `${a.condition} ${a.threshold}` : a.keyword ? `keyword "${a.keyword}"` : "";
        const status = a.status === "active" ? "ACTIVE" : a.status?.toUpperCase() ?? "?";
        const fired = a.triggered_at ? `  fired ${a.triggered_at.slice(0, 16).replace("T", " ")}Z` : "";
        return `${a.id}  [${status}] ${a.symbol ?? "—"} ${a.type} ${cond}${fired}`;
      });
      return `ALERTS (${data.length})\n${lines.join("\n")}`;
    } else if (tc.tool === "update_alert") {
      const { alert_id, action } = tc.args;
      if (!alert_id) return "alert_id is required.";
      if (action === "delete") {
        const { error } = await supabase.from("user_alerts").delete().eq("id", alert_id).eq("user_id", user.id);
        return error ? `Delete failed: ${error.message}` : "Alert deleted.";
      }
      const nextStatus = action === "pause" ? "paused" : "active";
      const { error } = await supabase.from("user_alerts").update({ status: nextStatus }).eq("id", alert_id).eq("user_id", user.id);
      if (error) return `Update failed: ${error.message}`;
      return action === "pause" ? "Alert paused." : "Alert resumed.";
    } else if (tc.tool === "read_journal") {
      const sym = (tc.args.symbol ?? "").toString().toUpperCase().trim();
      const days = Math.max(1, Math.min(90, Number(tc.args.days ?? 7)));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const cleanSym = (raw: string) => raw.toUpperCase().replace(/\.[a-z]+$/i, "").trim();
      const [journalRes, tradesRes] = await Promise.all([
        supabase.from("user_journal_entries").select("symbol,notes,created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(30),
        supabase.from("broker_trades").select("id,symbol,side,volume,pnl,close_time").eq("user_id", user.id).not("close_time", "is", null).gte("close_time", since).order("close_time", { ascending: false }).limit(30),
      ]);
      const entries = (journalRes.data ?? []) as { symbol: string; notes: string; created_at: string }[];
      const trades = (tradesRes.data ?? []) as { id: string; symbol: string; side: string; volume: number; pnl: number; close_time: string | null }[];
      const filteredEntries = sym ? entries.filter((e) => cleanSym(e.symbol ?? "") === cleanSym(sym)) : entries;
      const filteredTrades = sym ? trades.filter((t) => cleanSym(t.symbol ?? "") === cleanSym(sym)) : trades;
      const out: string[] = [];
      if (filteredTrades.length > 0) {
        out.push(`CLOSED TRADES (last ${days}d, top ${Math.min(filteredTrades.length, 10)})`);
        out.push(...filteredTrades.slice(0, 10).map((t) => {
          const when = t.close_time?.slice(0, 16).replace("T", " ") ?? "—";
          const pnl = Number(t.pnl ?? 0);
          return `${when}Z  ${t.symbol} ${t.side} ${t.volume}lot  P&L:${pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2)}`;
        }));
      }
      if (filteredEntries.length > 0) {
        out.push(`\nJOURNAL ENTRIES (last ${days}d, top ${Math.min(filteredEntries.length, 10)})`);
        out.push(...filteredEntries.slice(0, 10).map((e) => {
          const when = e.created_at?.slice(0, 16).replace("T", " ") ?? "—";
          return `${when}Z  ${e.symbol}: ${(e.notes ?? "").trim().slice(0, 240)}`;
        }));
      }
      if (out.length === 0) return `No journal entries or closed trades found in the last ${days}d${sym ? ` for ${sym}` : ""}.`;
      return out.join("\n");
    } else if (tc.tool === "calculate_fibonacci") {
      return computeFibonacci(tc.args);
    } else if (tc.tool === "analyze_orderblock") {
      return computeOrderBlock(tc.args);
    } else if (tc.tool === "analyze_pdh_pdl") {
      return computePdhPdl(tc.args);
    } else if (tc.tool === "calculate_trendline") {
      return computeTrendline(tc.args);
    } else if (tc.tool === "auto_journal_trades") {
      return runAutoJournalTool(supabase, user.id, context, tc.args);
    } else if (tc.tool === "navigate_to") {
      const { page } = tc.args;
      const params: string[] = [];
      if (tc.args.symbol) params.push(`symbol=${encodeURIComponent(tc.args.symbol.toUpperCase())}`);
      if (tc.args.timeframe) params.push(`tf=${encodeURIComponent(tc.args.timeframe.toUpperCase())}`);
      const href = `/${page}${params.length ? `?${params.join("&")}` : ""}`;
      const label = tc.args.label ?? page.charAt(0).toUpperCase() + page.slice(1);
      return `Navigation prepared. Render this as a button in your reply: [[link:${href}|${label}]]`;
    } else if (tc.tool === "route_chart_action") {
      return handleRouteChartAction(supabase, user.id, tc.args);
    } else if (tc.tool === "prepare_execution_request") {
      return handlePrepareExecutionRequest(supabase, user.id, tc.args, (title, body, url) => {
        firePush(title, body, url);
      });
    } else if (tc.tool === "save_note") {
      const { content, tag } = tc.args;
      const entryKey = `note-${Date.now()}`;
      const noteBody = tag ? `[${tag}] ${content}` : content;
      const { error: noteError } = await supabase.from("assistant_memory_entries").insert({
        user_id: user.id, scope: "notes", entry_key: entryKey,
        content: noteBody,
      });
      const { error: journalError } = await supabase.from("user_journal_entries").insert({
        user_id: user.id,
        symbol: "NOTE",
        notes: noteBody,
        tags: tag ? [tag] : [],
      });
      if (noteError && journalError) {
        return `Note failed: ${noteError.message}`;
      }
      return "Note saved to your journal.";
    }
    return "Unknown tool.";
  }

  function appendToolRound(
    msgs: LLMMessage[],
    tcs: AxeToolCall[],
    results: { tc: AxeToolCall; result: string }[],
  ): LLMMessage[] {
    return [
      ...msgs,
      { role: "assistant", content: null, tool_calls: tcs.map((tc) => ({ id: tc.id, type: "function" as const, function: { name: tc.tool, arguments: JSON.stringify(tc.args) } })) },
      ...results.map(({ tc, result }) => ({ role: "tool" as const, tool_call_id: tc.id, content: result })),
    ];
  }

  // 3. Stream the response — tool rounds are non-streaming, final text is streaming
  let finalReply: string | null = null;

  try {
    // First call: streaming — may return tool calls or text
    let firstContent = "";
    const firstResponse = await callAxeStreaming(aiMessages, (token) => {
      firstContent += token;
      onEvent({ type: "token", text: token });
    });

    if (firstResponse.toolCalls.length > 0) {
      // Tool calls — execute them
      onEvent({ type: "status", phase: "tools", tools: firstResponse.toolCalls.map((t) => t.tool) });

      const round1Results = await Promise.all(
        firstResponse.toolCalls.map(async (tc) => ({ tc, result: await executeTool(tc) })),
      );
      const afterRound1 = appendToolRound(aiMessages, firstResponse.toolCalls, round1Results);

      // Second call: streaming for text, but may have more tool calls
      onEvent({ type: "status", phase: "responding" });
      let round2Content = "";
      const round2Response = await callAxeStreaming(afterRound1, (token) => {
        round2Content += token;
        onEvent({ type: "token", text: token });
      });

      if (round2Response.toolCalls.length > 0) {
        // Third round of tools (rare)
        onEvent({ type: "status", phase: "tools", tools: round2Response.toolCalls.map((t) => t.tool) });
        const round2Results = await Promise.all(
          round2Response.toolCalls.map(async (tc) => ({ tc, result: await executeTool(tc) })),
        );
        const afterRound2 = appendToolRound(afterRound1, round2Response.toolCalls, round2Results);

        // Final streaming call (no tools)
        onEvent({ type: "status", phase: "responding" });
        let round3Content = "";
        await callAxeFinalStreaming(afterRound2, (token) => {
          round3Content += token;
          onEvent({ type: "token", text: token });
        });
        finalReply = round3Content || null;
      } else {
        finalReply = round2Content || null;
      }
    } else {
      finalReply = firstContent || null;
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[chatService] streaming error:", detail);
    // The reserved free-tier slot produced no reply — give it back.
    if (consumed) await refundChatQuota(supabase, user.id);
    return { ok: false, aiFailed: true, errorDetail: detail };
  }

  // AXE produced no reply at all (e.g. OpenAI not configured or errored).
  // Refund the reserved slot and surface a real error instead of a silent
  // "done" that leaves the UI spinning forever.
  if (!finalReply) {
    console.error("[chatService] AXE returned no reply (stream)");
    if (consumed) await refundChatQuota(supabase, user.id);
    return { ok: false, aiFailed: true };
  }

  // 4. Save assistant reply
  const { error: replyError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    user_id: user.id,
    role: "assistant",
    content: finalReply,
  });
  if (replyError) console.error("Failed to save AXE reply", replyError);

  extractMemoriesAsync(supabase, user.id, trimmed, finalReply).catch((e) =>
    console.error("[chatService] memory extraction failed:", e),
  );

  onEvent({ type: "done" });
  return { ok: true };
}

/**
 * Async memory extraction — runs after the reply is saved.
 * Pulls the last few messages and asks GPT-4o-mini to extract
 * durable observations about the trader.
 */
async function extractMemoriesAsync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
  if (!openaiKey) return;

  // Load recent conversation context (last 6 messages)
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("role,content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(6);

  const messages = [
    ...(recentMessages ?? []).reverse().map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantReply },
  ];

  // Load existing to avoid duplicates
  const { data: existing } = await supabase
    .from("axe_memory")
    .select("content,memory_type")
    .eq("user_id", userId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const conversationText = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
    .join("\n");

  const existingText = (existing?.length ?? 0) > 0
    ? `\n\nEXISTING MEMORIES (do not duplicate):\n${(existing ?? []).map((e: { memory_type: string; content: string }) => `- [${e.memory_type}] ${e.content}`).join("\n")}`
    : "";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You extract durable trader observations from AXE conversations. Extract 0-3 memories.

Types: observation, pattern, preference, weakness, strength, rule, context

Return JSON (no fences): {"memories": [{"memory_type": "...", "content": "...", "symbol": "..." or null, "confidence": 0.5-1.0}]}

Only extract behavioral patterns, preferences, rules, and durable insights. Skip temporary facts. Return empty array if nothing worth remembering.`,
        },
        { role: "user", content: `${conversationText}${existingText}` },
      ],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!res.ok) return;

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) return;

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { memories: Array<{ memory_type: string; content: string; symbol: string | null; confidence: number }> };

    for (const mem of parsed.memories ?? []) {
      if (!mem.content || !mem.memory_type) continue;
      await supabase.from("axe_memory").insert({
        user_id: userId,
        memory_type: mem.memory_type,
        content: String(mem.content).slice(0, 500),
        symbol: mem.symbol || null,
        confidence: Math.max(0.5, Math.min(1, Number(mem.confidence) || 0.7)),
        source: "chat",
        type: mem.memory_type,
      });
    }
  } catch {
    // Silent — memory extraction is best-effort
  }
}
