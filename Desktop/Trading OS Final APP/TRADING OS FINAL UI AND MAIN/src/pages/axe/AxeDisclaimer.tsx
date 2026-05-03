import { AxeLegalShell } from '@/components/axe/AxeLegalShell';

export default function AxeDisclaimer() {
  return (
    <AxeLegalShell title="Risk disclaimer">
      <p>
        Trading and investing involve substantial risk of loss. Past performance, analytics, labels, or AI-assisted
        summaries are not reliable indicators of future results.
      </p>
      <p>
        AXE Companion does not execute trades in Phase 1. Any ingest, analytics, or journaling features are informational
        and organizational tools only.
      </p>
      <p>If you do not understand these risks, seek independent professional advice before using AXE.</p>
    </AxeLegalShell>
  );
}
