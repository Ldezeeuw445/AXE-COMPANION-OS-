import { Link } from 'react-router-dom';
import JournalWorkspace from '@/pages/JournalWorkspace';

/** Journal + notes in AXE standalone (no Trading OS Layout chrome). Wrap with `AxeAppGate` in routes. */
export default function AxeJournalRoute() {
  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#0a0a0a] text-white">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
        <Link
          to="/app"
          className="text-[11px] font-medium text-white/45 transition-colors hover:text-cyan-300"
        >
          ← Back to AXE
        </Link>
        <span className="text-[10px] uppercase tracking-wider text-white/35">Journal · Notes · Trades</span>
        <span className="w-16" aria-hidden />
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <JournalWorkspace />
      </div>
    </div>
  );
}
