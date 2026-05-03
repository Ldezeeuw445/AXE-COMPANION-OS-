import type { SupabaseClient } from "@supabase/supabase-js";
import { getRelevantKnowledge } from "@/lib/axe/knowledgeRetrieval";

function isMissingTable(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = err.message ?? "";
  return (
    err.code === "42P01" ||
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("Could not find the table")
  );
}

type PgResult<T> = { data: T | null; error: { message?: string; code?: string } | null };

async function safe<T>(query: PromiseLike<PgResult<T>>): Promise<T | null> {
  try {
    const r = await query;
    if (r.error && isMissingTable(r.error)) return null;
    if (r.error) return null;
    return r.data;
  } catch {
    return null;
  }
}

/**
 * Assembles the AXE Knowledge Layer block: curated chunks, playbooks, user rules,
 * structured memory, journal snippets, broker trade + label snapshot (Supabase truth).
 */
export async function buildAxeKnowledgeLayerBlock(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  symbol?: string | null,
): Promise<string | null> {
  const sections: string[] = [];

  const hits = await getRelevantKnowledge(supabase, userMessage, userId, symbol, 10);
  if (hits.length) {
    const lines = hits.map(
      (h, i) =>
        `[${i + 1}] ${h.category} / ${h.title}\n${h.chunkText.slice(0, 1400)}${h.chunkText.length > 1400 ? "…" : ""}`,
    );
    sections.push(`CURATED KNOWLEDGE (top matches)\n${lines.join("\n\n")}`);
  }

  const playbooks = await safe(
    supabase
      .from("axe_strategy_playbooks")
      .select("name,symbol,timeframe,rules,invalidation,checklist")
      .eq("active", true)
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("updated_at", { ascending: false })
      .limit(6),
  );
  if (playbooks?.length) {
    const pb = playbooks
      .map(
        (p: Record<string, unknown>) =>
          `— ${p.name as string}${p.symbol ? ` (${p.symbol})` : ""} ${p.timeframe ? `[${p.timeframe}]` : ""}\nRules: ${p.rules}\nInvalidation: ${p.invalidation}\nChecklist: ${p.checklist}`,
      )
      .join("\n\n");
    sections.push(`STRATEGY PLAYBOOKS\n${pb}`);
  }

  const rules = await safe(
    supabase
      .from("axe_user_rules")
      .select("rule_type,severity,rule_text")
      .eq("user_id", userId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(20),
  );
  if (rules?.length) {
    sections.push(
      `USER RISK & BEHAVIOUR RULES\n${rules
        .map(
          (r: Record<string, unknown>) =>
            `[${r.severity ?? "info"}] ${r.rule_type}: ${r.rule_text}`,
        )
        .join("\n")}`,
    );
  }

  const memories = await safe(
    supabase
      .from("axe_memory")
      .select("memory_type,content,symbol,confidence,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
  );
  if (memories?.length) {
    sections.push(
      `AXE MEMORY (structured)\n${memories
        .map(
          (m: Record<string, unknown>) =>
            `— [${m.memory_type}] ${m.symbol ?? "—"} conf=${m.confidence ?? "n/a"}: ${m.content}`,
        )
        .join("\n")}`,
    );
  }

  const journal = await safe(
    supabase
      .from("user_journal_entries")
      .select("symbol,notes,rating,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
  );
  if (journal?.length) {
    sections.push(
      `JOURNAL SNIPPETS (user_journal_entries)\n${journal
        .map(
          (j: Record<string, unknown>) =>
            `— ${(j.created_at as string)?.slice(0, 10)} ${j.symbol}: ${String(j.notes).slice(0, 220)}${String(j.notes).length > 220 ? "…" : ""}`,
        )
        .join("\n")}`,
    );
  }

  const prefs = await safe(
    supabase
      .from("user_workspace_preferences")
      .select("active_account_id")
      .eq("user_id", userId)
      .maybeSingle(),
  );
  const activeAccountId = (prefs as { active_account_id?: string } | null)?.active_account_id ?? null;

  if (activeAccountId) {
    const trades = await safe(
      supabase
        .from("broker_trades")
        .select("id,symbol,side,volume,close_time,pnl,fees")
        .eq("user_id", userId)
        .eq("account_id", activeAccountId)
        .order("close_time", { ascending: false, nullsFirst: false })
        .limit(12),
    );

    if (trades?.length) {
      const ids = trades.map((t: { id: string }) => t.id);
      const labels =
        ids.length > 0
          ? await safe(
              supabase
                .from("trade_journal_labels")
                .select("trade_id,label,note")
                .eq("user_id", userId)
                .in("trade_id", ids),
            )
          : null;
      const labelMap = new Map<string, { label: string; note: string | null }>();
      for (const row of labels ?? []) {
        const r = row as { trade_id: string; label: string; note: string | null };
        labelMap.set(r.trade_id, { label: r.label, note: r.note });
      }
      const lines = trades.map((t: Record<string, unknown>) => {
        const id = t.id as string;
        const lb = labelMap.get(id);
        const tag = lb ? ` label=${lb.label}${lb.note ? ` note="${String(lb.note).slice(0, 80)}"` : ""}` : "";
        return `— ${t.symbol} ${t.side} vol=${t.volume} pnl=${t.pnl} fees=${t.fees ?? 0} close=${(t.close_time as string)?.slice(0, 16) ?? "—"}${tag}`;
      });
      sections.push(`RECENT BROKER TRADES (active account, broker_trades)\n${lines.join("\n")}`);
    }
  }

  if (!sections.length) return null;
  return sections.join("\n\n");
}
