import type { Metadata } from "next";
import { RefundsPageContent } from "@/content/legal/RefundsPageContent";

export const metadata: Metadata = {
  title: "Refunds & cancellation · Trading OS",
  description: "Refund and cancellation policy for Trading OS and Trading OS.",
};

export default function RefundsPage() {
  return <RefundsPageContent />;
}
