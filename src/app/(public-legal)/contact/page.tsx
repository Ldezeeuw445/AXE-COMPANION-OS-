import type { Metadata } from "next";
import { ContactPageContent } from "@/content/legal/ContactPageContent";

export const metadata: Metadata = {
  title: "Contact · Trading OS",
  description: "Contact Trading OS for Trading OS and Trading OS support.",
};

export default function ContactPage() {
  return <ContactPageContent />;
}
