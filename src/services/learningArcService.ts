import type { SupabaseClient } from "@supabase/supabase-js";
import type { CockpitLearningArc } from "@/types/cockpit";

const EMPTY: CockpitLearningArc = {
  headline: "",
  weeklyFocus: [],
  messageFeedback: { up: 0, down: 0 },
  weeklyFeedbackTrend: [],
};

export async function fetchLearningArc(
  supabase: SupabaseClient,
  userId: string,
): Promise<CockpitLearningArc> {
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("assistant_learning_signals")
    .select("signal_type,payload,created_at")
    .eq("user_id", userId)
    .gte("created_at", since30d)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error || !data?.length) {
    return {
      ...EMPTY,
      headline: "Learning arc builds from journal tags, trade reviews, and chat thumbs — no synthetic progress.",
    };
  }

  const focusCounts = new Map<string, number>();
  let up = 0;
  let down = 0;

  const weekBuckets = new Map<string, { up: number; down: number }>();
  for (let w = 3; w >= 0; w -= 1) {
    const start = new Date(Date.now() - (w + 1) * 7 * 86_400_000);
    const label = start.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
    weekBuckets.set(label, { up: 0, down: 0 });
  }

  for (const row of data) {
    const type = String(row.signal_type);
    focusCounts.set(type, (focusCounts.get(type) ?? 0) + 1);

    const createdAt = new Date(String(row.created_at)).getTime();
    const payload = (row.payload ?? {}) as Record<string, unknown>;

    if (type === "message_feedback") {
      const rating = String(payload.rating ?? "");
      if (rating === "up") up += 1;
      if (rating === "down") down += 1;

      for (let w = 3; w >= 0; w -= 1) {
        const start = new Date(Date.now() - (w + 1) * 7 * 86_400_000);
        const end = new Date(Date.now() - w * 7 * 86_400_000);
        const label = start.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
        if (createdAt >= start.getTime() && createdAt < end.getTime()) {
          const bucket = weekBuckets.get(label);
          if (bucket) {
            if (rating === "up") bucket.up += 1;
            if (rating === "down") bucket.down += 1;
          }
        }
      }
    }
  }

  const labelForType: Record<string, string> = {
    journal_label: "Journal discipline",
    trade_alignment: "Trade alignment",
    ai_correction: "Reasoning fixes",
    message_feedback: "Chat response quality",
  };

  const weeklyFocus = [...focusCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => ({
      label: labelForType[type] ?? type.replace(/_/g, " "),
      count,
    }));

  const totalFeedback = up + down;
  const headline =
    totalFeedback > 0
      ? `Last 30 days: ${up} helpful vs ${down} off-target AXE replies — your arc follows real teaching moments.`
      : weeklyFocus.length > 0
        ? `AXE is tracking ${weeklyFocus[0]?.label?.toLowerCase() ?? "behavior"} as your strongest learning signal this month.`
        : "Keep journaling and rating AXE replies — the arc only moves on real signals.";

  return {
    headline,
    weeklyFocus,
    messageFeedback: { up, down },
    weeklyFeedbackTrend: [...weekBuckets.entries()].map(([weekLabel, bucket]) => ({
      weekLabel,
      up: bucket.up,
      down: bucket.down,
    })),
  };
}
