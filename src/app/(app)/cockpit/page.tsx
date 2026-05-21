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
  const cockpitReady = hasSnapshot && dash.calibration.state === "active";

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-5 pb-2">
      <LiveStatusReporter
        liveCount={cockpitReady ? 1 : 0}
        totalCount={1}
        label={cockpitReady ? "Cockpit · calibrated" : "Cockpit · calibrating"}
        allLiveOverride={cockpitReady ? true : null}
        severity={cockpitReady ? "fresh" : "inactive"}
        reason={
          cockpitReady
            ? `${dash.calibration.signalCount} real signals are available.`
            : `${dash.calibration.signalCount} real signals found; missing ${dash.calibration.missingSignals.join(", ") || "snapshot"}.`
        }
        scope="cockpit"
      />
      <PageTitleInjector title="Cockpit" />
      <div className="-mt-1 border-l-2 border-tos-warm/35 pl-3.5">
        <p className="text-[13px] leading-relaxed text-tos-text/95">
          A quiet read on the same brain you message in Chat — pacing, doubt,
          and what stuck after feedback.
        </p>
      </div>

      {!hasSnapshot || dash.calibration.state !== "active" ? (
        <GlassPanel className="p-6 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
            {dash.calibration.state === "insufficient_data" ? "Insufficient data" : "Calibrating"}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-tos-muted">
            {dash.calibration.message}
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-tos-dim">
            {dash.calibration.signalCount} real signals found
          </p>
          {dash.calibration.missingSignals.length > 0 ? (
            <p className="mt-2 text-[11px] text-tos-dim">
              Missing: {dash.calibration.missingSignals.join(", ")}
            </p>
          ) : null}
          <CockpitGenerateButton />
        </GlassPanel>
      ) : (
        <>
          <CockpitAlignment data={dash.alignment} calibrationMessage={dash.calibration.message} />

          <GlassPanel className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">Score basis</p>
            <p className="mt-1 text-xs leading-relaxed text-tos-muted">
              {dash.alignment.score} is based on {dash.calibration.signalCount} real workspace signals. Mock/fallback cockpit
              data is ignored once live user data exists.
            </p>
            <p className="mt-1 text-[11px] text-tos-dim">
              Last recalculated:{" "}
              {dash.calibration.lastCalculatedAt
                ? new Date(dash.calibration.lastCalculatedAt).toLocaleString()
                : "not yet"}
              {dash.calibration.missingSignals.length
                ? ` · Missing: ${dash.calibration.missingSignals.join(", ")}`
                : ""}
            </p>
          </GlassPanel>

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
