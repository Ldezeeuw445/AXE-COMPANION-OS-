import Link from "next/link";

function GlassPanelStatic({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4 shadow-inner">{children}</div>
  );
}

/**
 * Ordered checklist to prove ingest → broker_trades → history → journal labels → AXE context.
 * No MetaApi; uses existing Edge `axe-mt5-ingest` + token flow.
 */
export function Mt5LiveProofChecklist() {
  const steps = [
    {
      n: 1,
      title: "Create broker row + link token",
      body: (
        <>
          On{" "}
          <Link href="/accounts" className="text-tos-warm hover:underline">
            Accounts
          </Link>
          , use <strong className="text-tos-text">Advanced — create broker row &amp; link token</strong>. Copy the
          one-time <code className="text-[10px] text-tos-text">axe_…</code> token.
        </>
      ),
    },
    {
      n: 2,
      title: "Verify ingest (optional dev step)",
      body: (
        <>
          Use <strong className="text-tos-text">Verify token</strong> only if you accept one{" "}
          <strong className="text-tos-text">synthetic</strong> closed trade for connectivity proof. Production fills
          should come from your EA/bridge POSTing to <code className="text-[10px] text-tos-text">axe-mt5-ingest</code>.
        </>
      ),
    },
    {
      n: 3,
      title: "Confirm broker_trades",
      body: (
        <>
          Open{" "}
          <Link href="/history" className="text-tos-warm hover:underline">
            History
          </Link>{" "}
          with the account selected / set active. You should see rows (PnL, symbol, close time).
        </>
      ),
    },
    {
      n: 4,
      title: "Label a trade",
      body: (
        <>
          From History, use <strong className="text-tos-text">Journal → Open</strong> on a row. Save a label/note;
          data is written to <code className="text-[10px] text-tos-text">trade_journal_labels</code>.
        </>
      ),
    },
    {
      n: 5,
      title: "AXE chat context",
      body: (
        <>
          Send a message on{" "}
          <Link href="/chat" className="text-tos-warm hover:underline">
            AXE chat
          </Link>
          . Context includes active account, recent <code className="text-[10px] text-tos-text">broker_trades</code>,
          labels, and <code className="text-[10px] text-tos-text">user_journal_entries</code> (server-side assembly).
        </>
      ),
    },
  ];

  return (
    <GlassPanelStatic>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-300/90">MT5 live proof checklist</p>
      <p className="mt-2 text-xs leading-relaxed text-tos-muted">
        End-to-end path for the <strong className="text-tos-text">current</strong> release: token / EA →{" "}
        <code className="text-[10px] text-tos-text">axe-mt5-ingest</code> → <code className="text-[10px] text-tos-text">broker_trades</code> → UI
        + AXE. In-app MetaApi cloud connect is a <strong className="text-tos-text">separate future build</strong> (Edge{" "}
        <code className="text-[10px] text-tos-text">axe-mt5-cloud</code>).
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
