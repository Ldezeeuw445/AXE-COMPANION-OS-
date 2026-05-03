import { AxeLegalShell } from '@/components/axe/AxeLegalShell';

export default function AxeTerms() {
  return (
    <AxeLegalShell title="Terms of Service">
      <p>
        By accessing AXE Companion you agree to use the product only for lawful purposes and in accordance with any
        policies posted by the operator of your deployment.
      </p>
      <p>
        AXE Companion is provided &ldquo;as is&rdquo; during early access. Features may change, be limited, or be
        temporarily unavailable. Nothing in AXE constitutes financial, investment, tax, or legal advice.
      </p>
      <p>
        You remain solely responsible for decisions you make in markets and for complying with agreements between you and
        your broker or other third parties.
      </p>
      <p>
        &ldquo;Trading OS&rdquo; refers to our upcoming premium trading terminal (live charts, intelligence, alerts, and
        execution workspace) on the same account stack when available — separate from this AXE Companion surface but not
        a separate data island where we wire shared services.
      </p>
    </AxeLegalShell>
  );
}
