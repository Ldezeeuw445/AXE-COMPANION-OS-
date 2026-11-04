import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { RoadmapClient } from "@/components/roadmap/RoadmapClient";
import Link from "next/link";

export default function RoadmapPage() {
  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6">
      <AxeTopBarInjector
        title="Roadmap"
        subtitle="Vote on what ships next"
        sections={[]}
        center={
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Roadmap
          </span>
        }
      />
      <RoadmapClient />
      <p className="text-center text-[10px] text-tos-dim">
        <Link href="/upgrade" className="underline-offset-2 hover:underline">
          Plans
        </Link>{" "}
        ·{" "}
        <Link href="/feedback" className="underline-offset-2 hover:underline">
          Feedback
        </Link>
      </p>
    </div>
  );
}
