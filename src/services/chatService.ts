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
  type: "axe" | "intel" = "axe",
): Promise<ConversationSummary | null> {
  const authed = existingAuth ?? await getAuthedServiceSupabase();
  if (!authed || authed.user.id !== userId) return null;
  const { supabase } = authed;

  const { data: conversations, error: convErr } = await supabase
    .from("conversations")
    .select("id,title,pinned_context,last_message_at,messages(count)")
    .eq("user_id", userId)
    // Include legacy conversations with null conversation_type as AXE
    .modify((q) => {
      if (type === "axe") {
        // conversation_type = 'axe' OR conversation_type IS NULL
        q.or(`conversation_type.eq.axe,conversation_type.is.null`);
      } else {
        q.eq("conversation_type", type);
      }
    })
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
      title: type === "intel" ? "AXE Intelligence" : "AXE",
      conversation_type: type,
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

export async function getChatThread(
  type: "axe" | "intel" = "axe",
): Promise<{
  conversation: ConversationSummary;
  messages: DomainChatMessage[];
}> {
  const authed = await getAuthedServiceSupabase();
  if (authed) {
    const conversation = await ensurePrimaryConversation(authed.user.id, authed, type);
    if (conversation) {
      const { data, error } = await authed.supabase
      ... (truncated)