import type { Metadata } from "next";
import { PrivacyPageContent } from "@/content/legal/PrivacyPageContent";

export const metadata: Metadata = {
  title: "Privacy Policy · AXE Companion",
  description: "Privacy Policy for AXE Companion and Trading OS.",
};

export default function PrivacyPage() {
  return <PrivacyPageContent />;
}
