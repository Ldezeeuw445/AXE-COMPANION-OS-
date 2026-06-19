import type { Metadata } from "next";
import { PrivacyPageContent } from "@/content/legal/PrivacyPageContent";

export const metadata: Metadata = {
  title: "Privacy Policy · Trading OS",
  description: "Privacy Policy for Trading OS and Trading OS.",
};

export default function PrivacyPage() {
  return <PrivacyPageContent />;
}
