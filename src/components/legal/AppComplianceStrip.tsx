"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ComplianceRiskNotice } from "@/components/legal/ComplianceRiskNotice";

/** Routes where a bottom strip would crowd trading UI. */
const HIDE_ON = ["/chart"];

/** Compact in-app risk notice — visible on authenticated surfaces. */
export function AppComplianceStrip() {
  const pathname = usePathname() ?? "";
  if (HIDE_ON.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return null;

  return (
    <div
      className="border-t border-white/[0.05] bg-[#030406]/80 px-4 py-2.5 text-center backdrop-blur-sm"
      aria-label="Risk notice"
    >
      <ComplianceRiskNotice compact className="mx-auto max-w-lg" />
      <p className="mt-1.5 text-[9px] text-tos-dim">
        <Link href="/terms" className="hover:text-tos-warm hover:underline">
          Terms
        </Link>
        {" · "}
        <Link href="/risk-disclaimer" className="hover:text-tos-warm hover:underline">
          Risk disclaimer
        </Link>
        {" · "}
        <Link href="/ai-disclaimer" className="hover:text-tos-warm hover:underline">
          AI disclaimer
        </Link>
      </p>
    </div>
  );
}
