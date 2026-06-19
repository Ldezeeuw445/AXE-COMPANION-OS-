import type { Metadata } from "next";
import { AiDisclaimerPageContent } from "@/content/legal/AiDisclaimerPageContent";

export const metadata: Metadata = {
  title: "AI disclaimer · Trading OS",
  description: "Artificial intelligence disclaimer for Trading OS.",
};

export default function AiDisclaimerPage() {
  return <AiDisclaimerPageContent />;
}
