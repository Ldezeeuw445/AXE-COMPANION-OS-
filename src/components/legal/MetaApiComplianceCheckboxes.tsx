"use client";

import Link from "next/link";
import { LEGAL_COPY, META_API_COMPLIANCE_FIELDS } from "@/lib/legal/constants";

type Props = {
  className?: string;
  /** Highlight master-password / live-trading context. */
  variant?: "default" | "master";
};

/**
 * Three mandatory, unchecked-by-default acknowledgements before MetaAPI connection
 * or live-trading activation (AFM / consumer-law compliance).
 */
export function MetaApiComplianceCheckboxes({ className = "", variant = "default" }: Props) {
  const border =
    variant === "master"
      ? "border-amber-400/15 bg-amber-400/[0.04] text-amber-100/85"
      : "border-white/[0.05] bg-white/[0.02] text-white/55";

  return (
    <div className={`space-y-2 ${className}`}>
      <label
        className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-[11px] leading-relaxed ${border}`}
      >
        <input
          type="checkbox"
          name={META_API_COMPLIANCE_FIELDS.terms}
          required
          className="mt-0.5 rounded border-white/20"
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="text-tos-warm underline-offset-2 hover:underline">
            Algemene Voorwaarden
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="text-tos-warm underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      <label
        className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-[11px] leading-relaxed ${border}`}
      >
        <input
          type="checkbox"
          name={META_API_COMPLIANCE_FIELDS.softwareTool}
          required
          className="mt-0.5 rounded border-white/20"
        />
        <span>{LEGAL_COPY.metaApiCheckbox2}</span>
      </label>

      <label
        className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-[11px] leading-relaxed ${border}`}
      >
        <input
          type="checkbox"
          name={META_API_COMPLIANCE_FIELDS.orderForward}
          required
          className="mt-0.5 rounded border-white/20"
        />
        <span>{LEGAL_COPY.metaApiCheckbox3}</span>
      </label>
    </div>
  );
}
