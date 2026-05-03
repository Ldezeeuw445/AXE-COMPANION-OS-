import type { Metadata } from "next";
import { ContactPageContent } from "@/content/legal/ContactPageContent";

export const metadata: Metadata = {
  title: "Contact · AXE Companion",
  description: "Contact Trading OS for AXE Companion and Trading OS support.",
};

export default function ContactPage() {
  return <ContactPageContent />;
}
