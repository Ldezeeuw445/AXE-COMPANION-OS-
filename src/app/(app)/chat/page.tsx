import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { Composer } from "@/components/chat/Composer";
import { ChatComposerDock } from "@/components/chat/ChatComposerDock";
import { PinnedContext } from "@/components/chat/PinnedContext";
import { CHAT_USES_MOCK_DATA, getChatThread } from "@/services/chatService";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { skipChatQuota } from "@/lib/chatQuota";
import type { ChatQuotaPayload } from "@/lib/chatQuota";

export default async function ChatPage() {
  const { conversation, messages } = await getChatThread();
  const supabase = await createServerSupabaseClient();
  let operatorName: string | null = null;
  let initialQuota: ChatQuotaPayload | null = null;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      operatorName = data?.display_name ?? null;

      if (!CHAT_USES_MOCK_DATA) {
        if (skipChatQuota()) {
          initialQuota = {
            ok: true,
            plan: "pro",
            limit: 20,
            used: 0,
            remaining: -1,
            skipped: true,
          };
        } else {
          const { data: q, error } = await supabase.rpc("axe_chat_quota_status");
          if (!error && q) {
            initialQuota = q as ChatQuotaPayload;
          }
        }
      }
    }
  }

  // Pulse: green when chat thread loaded AND OpenAI is wired (we
  // detect this via getChatThread succeeding without falling back to
  // mock seed data). Mock seed → amber so the dot is honest.
  const liveCount = (CHAT_USES_MOCK_DATA ? 0 : 1) + (initialQuota ? 1 : 0);
  const totalCount = 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col overscroll-none">
      <LiveStatusReporter
        liveCount={liveCount}
        totalCount={totalCount}
        label={`Chat · ${operatorName ?? "AXE"}`}
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {CHAT_USES_MOCK_DATA ? (
          <p className="shrink-0 border-b border-white/[0.08] bg-gradient-to-r from-tos-gold-soft/25 via-tos-warm-soft/20 to-tos-gold-soft/25 px-4 py-2.5 text-center text-[11px] text-tos-muted">
            You&apos;re signed in, but this thread is still{" "}
            <span className="font-medium text-tos-gold/90">demo seed data</span>.
            Live chat persistence is not wired to the database yet.
          </p>
        ) : null}
        <PinnedContext text={conversation.pinnedContext} />
        <ChatMessageList messages={messages} />
      </div>
      <ChatComposerDock>
        <Composer initialQuota={initialQuota} showQuota={!CHAT_USES_MOCK_DATA} />
      </ChatComposerDock>
    </div>
  );
}
