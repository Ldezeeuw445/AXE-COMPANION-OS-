"use client";

/**
 * AXE Alignment Badge — shows a circular score (0-100) + expandable breakdown.
 * Used on journal trade cards to show how well a trade aligned with rules/playbooks/memory.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type Breakdown = {
  rule_adherence: number;
  playbook_alignment: number;
  risk_management: number;
  emotional_discipline: number;
  explanation: string;
};

type Props = {
  score: number;
  axeLabel: string | null;
  axeNote: string | null;
  breakdown: Breakdown | null;
};

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-300";
  if (score >= 75) return "text-cyan-300";
  if (score >= 60) return "text-amber-200";
  if (score >= 40) return "text-orange-300";
  return "text-red-300";
}

function scoreBgRing(score: number): string {
  if (score >= 90) return "border-emerald-400/30";
  if (score >= 75) return "border-cyan-400/30";
  if (score >= 60) return "border-amber-300/30";
  if (score >= 40) return "border-orange-400/30";
  return "border-red-400/30";
}

function labelEmoji(label: string | null): string {
  switch (label) {
    case "Perfect": return "💎";
    case "Good": return "✅";
    case "OK": return "🆗";
    case "Impatient": return "⚡";
    case "Poor": return "⚠️";
    case "Emotional": return "🔥";
    default: return "📊";
  }
}

function barWidth(value: number): string {
  return `${Math.round((value / 25) * 100)}%`;
}

function barColor(value: number): string {
  if (value >= 22) return "bg-emerald-400/60";
  if (value >= 18) return "bg-cyan-400/50";
  if (value >= 14) return "bg-amber-300/40";
  if (value >= 10) return "bg-orange-400/40";
  return "bg-red-400/40";
}

const DIMENSION_LABELS = [
  { key: "rule_adherence" as const, label: "Rules", icon: "📏" },
  { key: "playbook_alignment" as const, label: "Playbook", icon: "📖" },
  { key: "risk_management" as const, label: "Risk", icon: "🛡" },
  { key: "emotional_discipline" as const, label: "Discipline", icon: "🧠" },
];

export function AlignmentBadge({ score, axeLabel, axeNote, breakdown }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-1.5">
      {/* Compact badge */}
      <button
        onClick={() => breakdown && setExpanded(!expanded)}
        className="flex items-center gap-2 transition-opacity hover:opacity-80"
        disabled={!breakdown}
      >
        {/* Score circle */}
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${scoreBgRing(score)} bg-white/[0.02]`}
        >
          <span className={`text-[11px] font-bold ${scoreColor(score)}`}>{score}</span>
        </div>

        {/* Label + note */}
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-1">
            <span className="text-[10px]">{labelEmoji(axeLabel)}</span>
            <span className="text-[10px] font-semibold text-white/50">{axeLabel ?? "—"}</span>
            {breakdown && (
              expanded ? <ChevronUp size={10} className="text-white/25" /> : <ChevronDown size={10} className="text-white/25" />
            )}
          </div>
          {axeNote && (
            <p className="truncate text-[9px] leading-tight text-white/30" title={axeNote}>
              {axeNote}
            </p>
          )}
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && breakdown && (
        <div className="ml-1 space-y-2 rounded-lg border border-white/[0.05] bg-white/[0.015] p-2.5">
          {DIMENSION_LABELS.map(({ key, label, icon }) => (
            <div key={key} className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/40">
                  {icon} {label}
                </span>
                <span className="text-[9px] font-mono text-white/30">
                  {breakdown[key]}/25
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className={`h-full rounded-full transition-all ${barColor(breakdown[key])}`}
                  style={{ width: barWidth(breakdown[key]) }}
                />
              </div>
            </div>
          ))}

          {breakdown.explanation && (
            <p className="mt-1.5 border-t border-white/[0.04] pt-1.5 text-[9px] leading-relaxed text-white/35">
              {breakdown.explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
