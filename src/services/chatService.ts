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
  computeFibonacci,
  computeOrderBlock,
  computePdhPdl,
  computeTrendline,
  type AxeToolCall,
  type TrackCommitmentArgs,
} from "@/services/axeService";
import {
  fetchLivePrice,
  formatLivePrice,
  fetchEconomicCalendar,
  formatEconomicCalendar,
} from "@/services/marketDataService";
import { fetchTradingOSContext } from "@/services/contextService";
import { buildAxeKnowledgeLayerBlock } from "@/lib/axe/knowledgeLayerContext";
import { tryConsumeChatQuota } from "@/lib/chatQuota";
import type { ChatMessage, ConversationSummary } from "@/types/domain";
import type OpenAI from "openai";

export const CHAT_USES_MOCK_DATA = SERVICES_USE_MOCK_DATA;

type ConversationRow = {
  id: string;
  title: string;
  pinned_context: string | null;
  last_message_at: string;
};

type MessageRow = {
  id: string;
  role: ChatMessage["role"];
  content: string;
  created_at: string;
};

function mapConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    pinnedContext: row.pinned_context ?? "",
    lastMessageAt: row.last_message_at,
  };
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function ensurePrimaryConversation(userId: string): Promise<ConversationSummary | null> {
  const authed = await getAuthedServiceSupabase();
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
  messages: ChatMessage[];
}> {
  const authed = await getAuthedServiceSupabase();
  if (authed) {
    const conversation = await ensurePrimaryConversation(authed.user.id);
    if (conversation) {
      const { data, error } = await authed.supabase
        .from("messages")
        .select("id,role,content,created_at")
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
  | { ok: false; quotaExceeded?: boolean };

export async function sendChatMessage(
  text: string,
  imageBase64?: string,
  imageType?: string,
  symbol?: string,
  tf?: string
): Promise<SendChatMessageResult> {
  const trimmed = text.trim();
  if (!trimmed && !imageBase64) return { ok: false };

  const authed = await getAuthedServiceSupabase();
  if (!authed) return { ok: false };

  const conversation = await ensurePrimaryConversation(authed.user.id);
  if (!conversation) return { ok: false };

  const { supabase, user } = authed;

  const quota = await tryConsumeChatQuota(supabase);
  if (!quota.ok) {
    if (quota.quotaExceeded) return { ok: false, quotaExceeded: true };
    return { ok: false };
  }

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
    return { ok: false };
  }

  // 2. Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .eq("user_id", user.id);

  // 3. Fetch message history + central TradingOS context in parallel
  console.log(`[AXE:chain] symbol=${symbol ?? "—"}  tf=${tf ?? "—"}`);
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

  const axeResponse = await callAxe(aiMessages);

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
      const { title, body, type, symbol: alertSymbol } = tc.args;
      let alertError = null;
      if (alertSymbol) {
        const { error: e1 } = await supabase.from("alerts").insert({
          user_id: user.id, type, title, body,
          symbol: alertSymbol.toUpperCase(), read: false,
        });
        if (e1 && e1.message?.includes("column")) {
          const { error: e2 } = await supabase.from("alerts").insert({
            user_id: user.id, type, title,
            body: `${body} [${alertSymbol.toUpperCase()}]`, read: false,
          });
          alertError = e2;
        } else {
          alertError = e1;
        }
      } else {
        const { error: e } = await supabase.from("alerts").insert({
          user_id: user.id, type, title, body, read: false,
        });
        alertError = e;
      }
      if (alertError) {
        console.error("[create_alert] insert failed:", alertError.message);
        return `Alert creation failed: ${alertError.message}`;
      }
      // Push notification: alert is set — fire and don't wait
      firePush(`AXE Alert: ${title}`, body ?? "Alert set.", "/alerts");
      return "Alert created and visible in TradingOS.";

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
      const price = await fetchLivePrice(tc.args.symbol);
      return "error" in price ? price.error : formatLivePrice(price);

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
    }
    return "Unknown tool.";
  }

  function appendToolRound(
    msgs: OpenAI.Chat.ChatCompletionMessageParam[],
    tcs: AxeToolCall[],
    results: { tc: AxeToolCall; result: string }[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
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
      } as OpenAI.Chat.ChatCompletionAssistantMessageParam,
      ...results.map(
        ({ tc, result }) =>
          ({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          }) as OpenAI.Chat.ChatCompletionToolMessageParam
      ),
    ];
  }

  let finalReply: string | null = null;

  if (axeResponse.toolCalls.length > 0) {
    const round1Results = await Promise.all(
      axeResponse.toolCalls.map(async (tc) => ({ tc, result: await executeTool(tc) }))
    );
    const afterRound1 = appendToolRound(aiMessages, axeResponse.toolCalls, round1Results);

    const round2Response = await callAxeAfterTool(afterRound1);

    if (round2Response.toolCalls.length > 0) {
      const round2Results = await Promise.all(
        round2Response.toolCalls.map(async (tc) => ({ tc, result: await executeTool(tc) }))
      );
      const afterRound2 = appendToolRound(afterRound1, round2Response.toolCalls, round2Results);
      finalReply = await callAxeFinal(afterRound2);
    } else {
      finalReply = round2Response.content;
    }
  } else {
    finalReply = axeResponse.content;
  }

  if (!finalReply) {
    console.error("[chatService] AXE returned no reply");
    return { ok: true };
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

  return { ok: true };
}
