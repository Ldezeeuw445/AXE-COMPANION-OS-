import type { Metadata } from "next";
import { CookiesPageContent } from "@/content/legal/CookiesPageContent";

export const metadata: Metadata = {
  title: "Cookie policy · AXE Companion",
  description: "Cookie policy for AXE Companion and Trading OS.",
};

export default function CookiesPage() {
  return <CookiesPageContent />;
}
