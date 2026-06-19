import type { Metadata } from "next";
import { RiskDisclaimerPageContent } from "@/content/legal/RiskDisclaimerPageContent";

export const metadata: Metadata = {
  title: "Risk disclaimer · Trading OS",
  description: "Trading risk disclaimer for Trading OS and Trading OS.",
};

export default function RiskDisclaimerPage() {
  return <RiskDisclaimerPageContent />;
}
