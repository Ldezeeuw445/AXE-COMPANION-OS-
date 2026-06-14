import { ArrowRight, Database, Monitor, Workflow } from "lucide-react";

const TERMINAL_STEPS = [
  {
    title: "Same memory layer",
    copy: "App en terminal delen dezelfde Supabase context zodat insights niet verdwijnen.",
    Icon: Database,
  },
  {
    title: "Desktop execution speed",
    copy: "Terminal brengt snellere workflows voor multi-account execution en scenario maps.",
    Icon: Monitor,
  },
  {
    title: "Phone-to-terminal handoff",
    copy: "Start op mobiel met AXE, vervolg op desktop zonder context-switch.",
    Icon: Workflow,
  },
] as const;

export function FinalTerminalShowcase() {
  return (
    <div className="launch-wide-showcase grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
      <div>
        <p className="launch-panel-kicker">Terminal preview</p>
        <h3 className="mt-4 font-[family-name:var(--font-space)] text-3xl tracking-[-0.05em] text-white sm:text-4xl">
          Trading Terminal is the same brain on a larger execution surface.
        </h3>
        <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/58">
          Wat je in AXE Companion opbouwt, wordt direct bruikbaar in de terminal.
          Geen losse tooling, maar een doorlopende workflow met een gedeeld geheugen.
        </p>

        <div className="mt-7 space-y-3">
          {TERMINAL_STEPS.map(({ title, copy, Icon }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/18"
            >
              <div className="flex items-center gap-3">
                <span className="launch-icon-well h-9 w-9">
                  <Icon className="h-4.5 w-4.5 text-cyan-300" />
                </span>
                <p className="text-sm font-semibold tracking-[-0.02em] text-white">{title}</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/58">{copy}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#090a11] p-4">
        <div className="pointer-events-none absolute inset-x-12 top-8 h-40 rounded-full bg-[radial-gradient(circle,rgba(90,220,255,0.18),transparent_70%)] blur-2xl" />
        <div className="relative rounded-[1.25rem] border border-white/10 bg-black/70 p-3">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
              AXE Trading Terminal
            </span>
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
              Soon
            </span>
          </div>

          <div className="space-y-2.5 text-xs text-white/70">
            <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
              <span className="text-cyan-200">&gt;</span> sync --workspace axecompanion
            </div>
            <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
              <span className="text-cyan-200">&gt;</span> load context --pair XAUUSD --session london
            </div>
            <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-white/62">
              Memory state ready. 14 linked signals, 3 active risk rules.
            </div>
            <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-2 text-cyan-100">
              Open workflow <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
