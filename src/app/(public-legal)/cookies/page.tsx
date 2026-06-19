import type { Metadata } from "next";
import { CookiesPageContent } from "@/content/legal/CookiesPageContent";

export const metadata: Metadata = {
  title: "Cookie policy · Trading OS",
  description: "Cookie policy for Trading OS and Trading OS.",
};

export default function CookiesPage() {
  return <CookiesPageContent />;
}
