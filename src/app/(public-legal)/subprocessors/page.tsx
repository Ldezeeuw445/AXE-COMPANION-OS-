import type { Metadata } from "next";
import { SubprocessorsPageContent } from "@/content/legal/SubprocessorsPageContent";

export const metadata: Metadata = {
  title: "Subprocessors · AXE Companion",
  description: "Subprocessors and infrastructure providers for AXE Companion and Trading OS.",
};

export default function SubprocessorsPage() {
  return <SubprocessorsPageContent />;
}
