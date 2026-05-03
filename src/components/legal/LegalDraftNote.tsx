/** Small internal notice — not a loud public headline. */
export function LegalDraftNote() {
  return (
    <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-tos-dim">
      <span className="font-medium text-tos-muted">Draft — needs legal review.</span> Trading, AI, broker data and
      subscriptions require counsel sign-off (AFM / GDPR / consumer law). Placeholders remain where noted.
    </p>
  );
}
