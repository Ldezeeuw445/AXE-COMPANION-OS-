import type { Metadata } from "next";
import { ContactPageContent } from "@/content/legal/ContactPageContent";

export const metadata: Metadata = {
  title: "Contact · Trading OS",
  description: "Contact Trading OS support.",
};

export default function ContactPage() {
  return <ContactPageContent />;
}
