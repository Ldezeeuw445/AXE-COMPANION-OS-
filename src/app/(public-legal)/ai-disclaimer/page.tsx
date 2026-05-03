import type { Metadata } from "next";
import { AiDisclaimerPageContent } from "@/content/legal/AiDisclaimerPageContent";

export const metadata: Metadata = {
  title: "AI disclaimer · AXE Companion",
  description: "Artificial intelligence disclaimer for AXE Companion.",
};

export default function AiDisclaimerPage() {
  return <AiDisclaimerPageContent />;
}
