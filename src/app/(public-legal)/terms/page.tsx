import type { Metadata } from "next";
import { TermsPageContent } from "@/content/legal/TermsPageContent";

export const metadata: Metadata = {
  title: "Terms of Service · AXE Companion",
  description: "Terms of Service for AXE Companion and Trading OS.",
};

export default function TermsPage() {
  return <TermsPageContent />;
}
