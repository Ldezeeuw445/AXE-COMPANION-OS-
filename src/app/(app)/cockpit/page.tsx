import { CockpitAlignment } from "@/components/cockpit/CockpitAlignment";
import { CockpitBehaviorMap } from "@/components/cockpit/CockpitBehaviorMap";
import { CockpitConfidenceChart } from "@/components/cockpit/CockpitConfidenceChart";
import { CockpitFeedbackImpact } from "@/components/cockpit/CockpitFeedbackImpact";
import { CockpitFooterNote } from "@/components/cockpit/CockpitFooterNote";
import { CockpitLearningProgress } from "@/components/cockpit/CockpitLearningProgress";
import { CockpitGenerateButton } from "@/components/cockpit/CockpitGenerateButton";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { getCockpitDashboard } from "@/services/cockpitService";

export default async function CockpitPage() {
  const dash = await getCockpitDashboard();
  const hasSnapshot = Boolean(dash.snapshotId);

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-5 pb-2">
      <LiveStatusReporter
        liveCount={hasSnapshot ? 1 : 0}
        totalCount={1}
        label={hasSnapshot ? "Cockpit · snapshot live" : "Cockpit · awaiting snapshot"}
        allLiveOverride={hasSnapshot ? true : null}
      />
      <PageTitleInjector title="Cockpit" />
      <div className="-mt-1 border-l-2 border-tos-warm/35 pl-3.5">
        <p className="text-[13px] leading-relaxed text-tos-text/95">
          A quiet read on the same brain you message in Chat — pacing, doubt,
          and what stuck after feedback.
        </p>
      </div>

      {!hasSnapshot ? (
        <GlassPanel className="p-6 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
            Private snapshot
          </p>
          <p className="mt-3 text-sm leading-relaxed text-tos-muted">
            AXE hasn&apos;t built a snapshot yet. Hit the button below and it will
            analyse your session history — sessions, instruments, patterns, and
            how well it&apos;s tracking your rules.
          </p>
          <CockpitGenerateButton />
        </GlassPanel>
      ) : (
        <>
          <CockpitAlignment data={dash.alignment} />

          <CockpitLearningProgress
            headline={dash.learningProgress.headline}
            milestones={dash.learningProgress.milestones}
          />

          <CockpitConfidenceChart
            headline={dash.confidence.headline}
            series={dash.confidence.series}
          />

          <CockpitFeedbackImpact data={dash.feedback} />

          <CockpitBehaviorMap data={dash.behavior} />

          <CockpitFooterNote metricKeysSample={dash.metricKeysSample} />

          <div className="pt-2">
            <p className="mb-2 text-center text-[11px] text-tos-dim">
              Snapshot from{" "}
              {new Date(dash.alignment.capturedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
            <CockpitGenerateButton label="Refresh snapshot" />
          </div>
        </>
      )}
    </div>
  );
}
