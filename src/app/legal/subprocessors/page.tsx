import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subprocessors · AXE Companion",
};

export default function SubprocessorsPage() {
  return (
    <>
      <h1>Subprocessors (draft)</h1>
      <p>
        Trading OS relies on third-party services to operate AXE Companion. This list is indicative — final DPA-ready
        tables should be maintained separately.
      </p>
      <ul>
        <li>
          <strong className="text-tos-text">Supabase</strong> — database, authentication, storage, and edge functions.
        </li>
        <li>
          <strong className="text-tos-text">Vercel</strong> — application hosting and serverless execution.
        </li>
        <li>
          <strong className="text-tos-text">OpenAI</strong> (or successor model providers) — AI inference for AXE chat,
          invoked server-side only.
        </li>
        <li>
          <strong className="text-tos-text">Email / analytics</strong> — add providers when you wire transactional email
          or product analytics.
        </li>
      </ul>
      <p>Updates to this list will be posted here and, where required, notified to customers in advance.</p>
    </>
  );
}
