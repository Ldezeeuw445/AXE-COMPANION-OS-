import Link from "next/link";

function GlassPanelStatic({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4 shadow-inner">{children}</div>
  );
}

/**
 * Checklist: MetaApi cloud (primary) and link-token ingest (advanced).
 */
export function Mt5LiveProofChecklist() {
  const steps = [
    {
      n: 1,
      title: "Connect MT5 (MetaApi cloud)",
      body: (
        <>
          On{" "}
          <Link href="/accounts" className="text-tos-warm hover:underline">
            Accounts
          </Link>
          , use <strong className="text-tos-text">Recommended — Connect MT5 account (MetaApi cloud)</strong>. Confirm
          read-only password, then <strong className="text-tos-text">Test</strong> and <strong className="text-tos-text">Sync</strong> on the account card.
        </>
      ),
    },
    {
      n: 2,
      title: "Confirm broker_trades",
      body: (
        <>
          Open{" "}
          <Link href="/history" className="text-tos-warm hover:underline">
            History
          </Link>{" "}
          with the account active. You should see closed rows (PnL, symbol, close time) from MetaApi sync or ingest.
        </>
      ),
    },
    {
      n: 3,
      title: "Label a trade",
      body: (
        <>
          From History, use <strong className="text-tos-text">Journal → Open</strong> on a row. Save a label/note to{" "}
          <code className="text-[10px] text-tos-text">trade_journal_labels</code>.
        </>
      ),
    },
    {
      n: 4,
      title: "AXE chat context",
      body: (
        <>
          Send a message on{" "}
          <Link href="/chat" className="text-tos-warm hover:underline">
            AXE chat
          </Link>
          . Context includes the active account, recent <code className="text-[10px] text-tos-text">broker_trades</code>
          , labels, and journal entries (server-side assembly).
        </>
      ),
    },
    {
      n: 5,
      title: "Advanced — link token / EA",
      body: (
        <>
          Optional: <strong className="text-tos-text">Advanced — Local MT5 bridge token</strong> for{" "}
          <code className="text-[10px] text-tos-text">axe-mt5-ingest</code> when you prefer your own bridge instead of
          MetaApi.
        </>
      ),
    },
  ];

  return (
    <GlassPanelStatic>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-300/90">MT5 live proof checklist</p>
      <p className="mt-2 text-xs leading-relaxed text-tos-muted">
        Primary path: <strong className="text-tos-text">MetaApi cloud</strong> from this app →{" "}
        <code className="text-[10px] text-tos-text">broker_trades</code> → History / Journal / AXE. Advanced path: token +{" "}
        <code className="text-[10px] text-tos-text">axe-mt5-ingest</code>.
      </p>
      <ol className="mt-4 space-y-3 text-[11px] leading-relaxed text-tos-muted">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-[10px] font-bold text-tos-warm">
              {s.n}
            </span>
            <div>
              <p className="font-medium text-tos-text">{s.title}</p>
              <p className="mt-1">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </GlassPanelStatic>
  );
}
