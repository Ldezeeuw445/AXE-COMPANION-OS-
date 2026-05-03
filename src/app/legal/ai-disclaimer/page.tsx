import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Disclaimer · AXE Companion",
};

export default function AiDisclaimerPage() {
  return (
    <>
      <h1>Artificial intelligence disclaimer</h1>
      <p>
        AXE uses large language models and related AI systems. Outputs may be incorrect, incomplete, outdated, or biased.
        AI-generated text is not financial advice and must not be the sole basis for trading or risk decisions.
      </p>
      <p>
        Always verify important facts against primary sources (broker statements, exchange data, official calendars).
        You remain responsible for your trading and compliance obligations.
      </p>
    </>
  );
}
