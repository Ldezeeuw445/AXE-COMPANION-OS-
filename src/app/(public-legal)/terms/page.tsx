import type { Metadata } from "next";
import { TermsPageContent } from "@/content/legal/TermsPageContent";

export const metadata: Metadata = {
  title: "Terms of Service · Trading OS",
  description: "Terms of Service for Trading OS and Trading OS.",
};

export default function TermsPage() {
  return <TermsPageContent />;
}
