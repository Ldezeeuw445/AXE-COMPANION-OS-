import { CockpitAlignment } from "@/components/cockpit/CockpitAlignment";
import { CockpitBehaviorMap } from "@/components/cockpit/CockpitBehaviorMap";
import { CockpitConfidenceChart } from "@/components/cockpit/CockpitConfidenceChart";
import { CockpitFeedbackImpact } from "@/components/cockpit/CockpitFeedbackImpact";
import { CockpitFooterNote } from "@/components/cockpit/CockpitFooterNote";
import { CockpitLearningProgress } from "@/components/cockpit/CockpitLearningProgress";
import { CockpitLearningArc } from "@/components/cockpit/CockpitLearningArc";
import { CockpitGenerateButton } from "@/components/cockpit/CockpitGenerateButton";
import { CockpitAutoRefresh } from "@/components/cockpit/CockpitAutoRefresh";
import { CockpitTodayStrip } from "@/components/cockpit/CockpitTodayStrip";
import { CockpitIntelSection } from "@/components/cockpit/CockpitIntelSection";
import { CockpitMorningBrief } from "@/components/cockpit/CockpitMorningBrief";
import { CockpitEngineStatus } from "@/components/cockpit/CockpitEngineStatus";
import { CockpitAdaptiveSuggestions } from "@/components/adaptive/CockpitAdaptiveSuggestions";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { hasEntitlementFeature } from "@/lib/billing/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import type { UserAxeEntitlement } from "@/lib/billing/types";
import { getCockpitDashboard } from "@/services/cockpitService";
import { loadAdaptiveSuggestions } from "@/lib/adaptive/server";
import type { AdaptiveSuggestionState } from "@/types/adaptive";

const EMPTY_ENTITLEMENT: UserAxeEntitlement = {
  plan: "free",
  isPaid: false,
  founderBadge: false,
  proUntil: null,
  chatQuotaExempt: false,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  label: "Free",
};

export default async function CockpitPage() {
  const dash = await getCockpitDashboard();
  const supabase = await createServerSupabaseClient();
  let entitlement = EMPTY_ENTITLEMENT;
  let userId: string | undefined;
  let adaptiveSuggestions: AdaptiveSuggestionState[] = [];
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const [nextEntitlement, suggestionRows] = await Promise.all([
        getUserAxeEntitlement(supabase, user.id),
        loadAdaptiveSuggestions(supabase, user.id),
      ]);
      entitlement = nextEntitlement;
      adaptiveSuggestions = suggestionRows
        .filter((row) => row.status === "pending")
        .slice(0, 4)
        .map((row) => ({
          id: row.id,
          kind: row.kind,
          accountId: row.account_id ?? undefined,
          status: row.status,
          payload: row.payload,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
        }));
    }
  }
  const canLearn = hasEntitlementFeature(entitlement, "cockpit_learning", userId);
  const canBriefings = hasEntitlementFeature(entitlement, "briefings", userId);
  const hasSnapshot = Boolean(dash.snapshotId);
  const cockpitCalibrated = hasSnapshot && dash.calibration.state === "active";
  const cockpitPreview = hasSnapshot && dash.calibration.state !== "active";
  const alignmentDelta = dash.alignment.deltaFromPrior;
  const showRecalibrationCue = hasSnapshot && dash.calibration.lastCalculatedAt != null;
  const significantShift = Math.abs(alignmentDelta) >= 10;

  return (
    <div className="axe-stagger-enter flex flex-col gap-5 pb-2">
      <LiveStatusReporter
        liveCount={hasSnapshot ? 1 : 0}
        totalCount={1}
        label={
          cockpitCalibrated
            ? "Cockpit · calibrated"
            : cockpitPreview
              ? "Cockpit · early snapshot"
              : "Cockpit · calibrating"
        }
        allLiveOverride={cockpitCalibrated ? true : hasSnapshot ? false : null}
        severity={cockpitCalibrated ? "fresh" : hasSnapshot ? "inactive" : "inactive"}
        reason={
          cockpitCalibrated
            ? `${dash.calibration.signalCount} real signals are available.`
            : hasSnapshot
              ? `Snapshot ready with ${dash.calibration.signalCount} signals — scores stay conservative until more history exists.`
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

      <CockpitAutoRefresh shouldRefresh={dash.shouldAutoRefresh} />

      {userId ? <CockpitIntelSection userId={userId} /> : null}

      {canBriefings ? <CockpitMorningBrief /> : null}
      <CockpitEngineStatus engine={dash.engine} />
      {canLearn ? <CockpitAdaptiveSuggestions initialSuggestions={adaptiveSuggestions} /> : null}

      <CockpitTodayStrip
        initial={dash.today}
        traderScores={dash.traderScores}
        axeAlignment={hasSnapshot && canLearn ? dash.alignment : null}
      />

      {canLearn ? (
        <GlassPanel className="p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
            How growth happens
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-tos-muted">
            Cockpit grows from real per-user signals: chat feedback, journal notes, closed trades, and feed/alert actions.
            You currently have <span className="font-semibold text-tos-text">{dash.calibration.signalCount}</span> signals
            in this snapshot.
          </p>
          <p className="mt-1.5 text-[11px] text-tos-dim">
            Fastest way to move Learning Arc: rate AXE replies, journal trades, and refresh snapshot after your session.
          </p>
        </GlassPanel>
      ) : null}

      {canLearn ? (
        <CockpitLearningArc data={dash.learningArc} />
      ) : (
        <>
          <UpgradeGate
            feature="cockpit_learning"
            title="Cockpit learning is a Pro feature"
            description="Free includes a weekly market snapshot. Upgrade for Learning Arc, AXE alignment, confidence trends, and the full Cockpit learning loop."
          />
          <GlassPanel className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
              Weekly market snapshot · Free
            </p>
            <p className="mt-2 text-sm leading-relaxed text-tos-muted">
              Check Market and Intel for this week&apos;s macro and news context. Full Cockpit calibration
              unlocks on Pro.
            </p>
          </GlassPanel>
        </>
      )}

      {!canLearn ? null : !hasSnapshot ? (
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
          {cockpitPreview ? (
            <GlassPanel className="border-tos-warm/20 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-tos-warm/90">
                Early calibration
              </p>
              <p className="mt-2 text-sm leading-relaxed text-tos-muted">
                {dash.calibration.message}
              </p>
              <p className="mt-2 text-[11px] text-tos-dim">
                {dash.calibration.signalCount} signals ·{" "}
                {dash.calibration.missingSignals.length
                  ? `still missing ${dash.calibration.missingSignals.join(", ")}`
                  : "building toward full calibration"}
              </p>
            </GlassPanel>
          ) : null}

          <CockpitAlignment data={dash.alignment} calibrationMessage={dash.calibration.message} />

          <GlassPanel className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">Two scores</p>
            <p className="mt-1 text-xs leading-relaxed text-tos-muted">
              <span className="font-medium text-tos-text">Trader score</span> (top) averages Discipline,
              Execution, Risk and Patience from your last 90 days of journal and trade history.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-tos-muted">
              <span className="font-medium text-tos-text">AXE alignment {dash.alignment.score}</span> (below)
              measures how well AXE fits your book —{" "}
              <span className="font-medium text-tos-text">100 = fully aligned</span>. Based on{" "}
              {dash.calibration.signalCount} real workspace signals from the latest snapshot.
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
            {showRecalibrationCue ? (
              <p
                className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                  significantShift
                    ? "border-tos-warm/40 bg-tos-warm/10 text-tos-warm"
                    : "border-emerald-400/35 bg-emerald-500/10 text-emerald-300"
                }`}
              >
                {significantShift
                  ? `Latest recalibration · ${alignmentDelta >= 0 ? "+" : ""}${alignmentDelta} pts`
                  : "Latest recalibration · stable"}
              </p>
            ) : null}
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
