import type { Metadata } from "next";
import { SubprocessorsPageContent } from "@/content/legal/SubprocessorsPageContent";

export const metadata: Metadata = {
  title: "Subprocessors · Trading OS",
  description: "Subprocessors and infrastructure providers for Trading OS.",
};

export default function SubprocessorsPage() {
  return <SubprocessorsPageContent />;
}
