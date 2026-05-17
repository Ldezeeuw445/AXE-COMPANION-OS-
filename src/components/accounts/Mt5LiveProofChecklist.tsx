import Link from "next/link";

type Props = {
  /** When true, omit outer promo card — for use inside a collapsible on Accounts. */
  embedded?: boolean;
};

const steps = [
  {
    n: 1,
    title: "Connect MT5 with AXE MT5 Cloud",
    body: (
      <>
        Use <strong className="text-tos-text">Recommended — Connect MT5 account</strong> above. Confirm read-only access,
        then use <strong className="text-tos-text">Test</strong> and <strong className="text-tos-text">Sync</strong> on
        the account card.
      </>
    ),
  },
  {
    n: 2,
    title: "Confirm history",
    body: (
      <>
        Open{" "}
        <Link href="/history" className="text-cyan-400/90 hover:underline">
          History
        </Link>{" "}
        with the account active. Closed trades should appear after a successful sync.
      </>
    ),
  },
  {
    n: 3,
    title: "Journal a trade",
    body: (
      <>
        From History, open a row in{" "}
        <Link href="/journal" className="text-cyan-400/90 hover:underline">
          Journal
        </Link>{" "}
        to add labels and notes.
      </>
    ),
  },
  {
    n: 4,
    title: "AXE context",
    body: (
      <>
        In{" "}
        <Link href="/chat" className="text-cyan-400/90 hover:underline">
          Chat
        </Link>
        , AXE uses your active account, recent trades and journal on the server — nothing is invented as live broker
        data.
      </>
    ),
  },
  {
    n: 5,
    title: "Advanced — local bridge",
    body: (
      <>
        Optional: expand <strong className="text-tos-text">Advanced — Local MT5 Bridge Token</strong> if you POST fills
        from your own EA instead of AXE MT5 Cloud.
      </>
    ),
  },
];

export function Mt5LiveProofChecklist({ embedded }: Props) {
  const inner = (
    <>
      {!embedded ? (
        <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-300/90">MT5 live proof checklist</p>
      ) : null}
      {!embedded ? (
        <p className="mt-2 text-xs leading-relaxed text-tos-muted">
          Primary path: <strong className="text-tos-text">AXE MT5 Cloud</strong> from this app. Advanced: local bridge
          token.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-tos-muted">
          Walk through these once after connecting — you can keep this section collapsed when you are set up.
        </p>
      )}
      <ol className={`space-y-3 text-[11px] leading-relaxed text-tos-muted ${embedded ? "mt-3" : "mt-4"}`}>
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-[10px] font-bold text-cyan-400/90">
              {s.n}
            </span>
            <div>
              <p className="font-medium text-tos-text">{s.title}</p>
              <p className="mt-1">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );

  if (embedded) {
    return <div className="text-tos-muted">{inner}</div>;
  }

  return (
    <div className="mb-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4 shadow-inner">{inner}</div>
  );
}
