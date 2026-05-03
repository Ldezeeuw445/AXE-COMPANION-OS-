import type { Metadata } from "next";
import { RiskDisclaimerPageContent } from "@/content/legal/RiskDisclaimerPageContent";

export const metadata: Metadata = {
  title: "Risk disclaimer · AXE Companion",
  description: "Trading risk disclaimer for AXE Companion and Trading OS.",
};

export default function RiskDisclaimerPage() {
  return <RiskDisclaimerPageContent />;
}
