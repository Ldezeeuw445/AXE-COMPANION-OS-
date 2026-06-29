import { RISK_WARNING } from "@/lib/legal/constants";

type Props = {
  className?: string;
  /** Compact single-line style for tight layouts. */
  compact?: boolean;
};

/** Mandatory AFM-style risk warning — use on login, footers, and onboarding. */
export function ComplianceRiskNotice({ className = "", compact = false }: Props) {
  return (
    <p
      className={`${compact ? "text-[10px] leading-snug" : "text-[11px] leading-relaxed"} text-tos-dim ${className}`}
      role="note"
    >
      {RISK_WARNING}
    </p>
  );
}
