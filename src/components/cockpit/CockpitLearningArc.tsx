import type { CockpitLearningArc } from "@/types/cockpit";
import { GlassPanel } from "@/components/ui/GlassPanel";
import Link from "next/link";

type Props = {
  data: CockpitLearningArc;
};

export function CockpitLearningArc({ data }: Props) {
  const totalFeedback = data.messageFeedback.up + data.messageFeedback.down;
  const maxWeek = Math.max(
    ...data.weeklyFeedbackTrend.map((w) => w.up + w.down),
    1,
  );

  return (
    <GlassPanel className="p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
        Learning arc · live
      </p>
      <p className="mt-2 text-sm leading-relaxed text-tos-muted">
        {data.headline ||
          "Weekly focus areas and chat feedback — no fake milestones, only signals you actually sent."}
      </p>

      {data.weeklyFocus.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {data.weeklyFocus.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <span className="text-[13px] font-medium text-tos-text">{item.label}</span>
              <span className="font-mono text-[11px] tabular-nums text-tos-warm/90">
                {item.count} signal{item.count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-[12px] text-tos-muted">
          No learning signals in the last 30 days. Journal a trade or thumbs-rate an AXE reply in chat.
        </p>
      )}

      <div className="mt-6 border-t border-tos-border/80 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-tos-dim">Chat feedback</p>
            <div className="mt-2 flex items-baseline gap-4">
              <p className="font-mono text-xl font-semibold tabular-nums text-tos-long">
                {data.messageFeedback.up}
                <span className="ml-1 text-[11px] font-normal text-tos-dim">helpful</span>
              </p>
              <p className="font-mono text-xl font-semibold tabular-nums text-tos-short">
                {data.messageFeedback.down}
                <span className="ml-1 text-[11px] font-normal text-tos-dim">off</span>
              </p>
            </div>
          </div>
          <Link
            href="/chat"
            className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400/85 hover:text-cyan-300"
          >
            Rate in chat →
          </Link>
        </div>

        {totalFeedback > 0 && data.weeklyFeedbackTrend.length > 0 ? (
          <>
            <p className="mt-4 text-[10px] uppercase tracking-wider text-tos-dim">Four-week rhythm</p>
            <div className="mt-2 flex h-14 items-end gap-2">
              {data.weeklyFeedbackTrend.map((w) => {
                const total = w.up + w.down;
                const upPct = total > 0 ? (w.up / total) * 100 : 0;
                return (
                  <div
                    key={w.weekLabel}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                    title={`${w.up} helpful · ${w.down} off`}
                  >
                    <div
                      className="flex w-full max-w-[2.75rem] flex-1 flex-col justify-end overflow-hidden rounded-t-md"
                      style={{ height: `${Math.max((total / maxWeek) * 100, 12)}%` }}
                    >
                      {total > 0 ? (
                        <>
                          <div
                            className="w-full bg-gradient-to-t from-tos-short/70 to-tos-short/40"
                            style={{ height: `${100 - upPct}%` }}
                          />
                          <div
                            className="w-full bg-gradient-to-t from-tos-long/40 to-tos-long/80"
                            style={{ height: `${upPct}%` }}
                          />
                        </>
                      ) : (
                        <div className="h-full w-full bg-white/[0.06]" />
                      )}
                    </div>
                    <span className="max-w-full truncate text-center text-[9px] text-tos-dim">
                      {w.weekLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="mt-4 text-[11px] leading-relaxed text-tos-dim">
            Thumbs on AXE replies train tone and depth — they show up here within a session.
          </p>
        )}
      </div>
    </GlassPanel>
  );
}
