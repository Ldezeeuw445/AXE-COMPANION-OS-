import { CockpitLearningModel } from "@/components/cockpit/CockpitLearningModel";
import { getLearningModel, type LearningModelView } from "@/services/learningModelService";
import { CockpitBehaviorMap } from "@/components/cockpit/CockpitBehaviorMap";
import { CockpitConfidenceChart } from "@/components/cockpit/CockpitConfidenceChart";
import { CockpitFeedbackImpact } from "@/components/cockpit/CockpitFeedbackImpact";
import { CockpitFooterNote } from "@/components/cockpit/CockpitFooterNote";
import { CockpitLearningProgress } from "@/components/cockpit/CockpitLearningProgress";
import { CockpitLearningArc } from "@/components/cockpit/CockpitLearningArc";
import { CockpitKnowledgeFiles } from "@/components/cockpit/CockpitKnowledgeFiles";
import { CockpitGenerateButton } from "@/components/cockpit/CockpitGenerateButton";
import { CockpitAutoRefresh } from "@/components/cockpit/CockpitAutoRefresh";
import { CockpitTodayStrip } from "@/components/cockpit/CockpitTodayStrip";
import { CockpitIntelSection } from "@/components/cockpit/CockpitIntelSection";
import { CockpitMorningBrief } from "@/components/cockpit/CockpitMorningBrief";
import { CockpitEngineStatus } from "@/components/cockpit/CockpitEngineStatus";
import { CockpitAdaptiveSuggestions } from "@/components/adaptive/CockpitAdaptiveSuggestions";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { CockpitLearningSection } from "@/components/home/CockpitLearningSection";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { ActiveSessionSeed } from "@/components/session/ActiveSessionSeed";
import { ActiveSessionChip } from "@/components/session/ActiveSessionChip";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { hasEntitlementFeature } from "@/lib/billing/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import type { UserAxeEntitlement } from "@/lib/billing/types";
import { getCockpitDashboard } from "@/services/cockpitService";
import { getUserKnowledgeOverview, type UserKnowledgeOverview } from "@/services/userKnowledgeReadService";
import { loadAdaptiveSuggestions } from "@/lib/adaptive/server";
import { loadHomePageData } from "@/lib/home/loadHomePageData";
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
  const [dash, home] = await Promise.all([getCockpitDashboard(), loadHomePageData()]);
  const supabase = await createServerSupabaseClient();
  let entitlement = EMPTY_ENTITLEMENT;
  let userId: string | undefined;
  let adaptiveSuggestions: AdaptiveSuggestionState[] = [];
  let knowledge: UserKnowledgeOverview = { files: [], sharedDocCount: 0 };
  let learning: LearningModelView | null = null;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const [nextEntitlement, suggestionRows, knowledgeOverview] = await Promise.all([
        getUserAxeEntitlement(supabase, user.id),
        loadAdaptiveSuggestions(supabase, user.id),
        getUserKnowledgeOverview(supabase, user.id),
      ]);
      entitlement = nextEntitlement;
      // Learning model v2 — the honest score, across all accounts.
      learning = await getLearningModel(supabase, user.id).catch(() => null);
      knowledge = knowledgeOverview;
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
  const learningScore = canLearn ? (learning?.state.score ?? null) : null;

  return (
    <div className="axe-stagger-enter flex flex-col gap-5 pb-2">
      <ActiveSessionSeed userId={userId ?? null} lastTab="home" />
      <PageTitleInjector title="Home" />
      <HomeDashboard data={home} />

      <CockpitLearningSection
        badge={
          cockpitCalibrated ? "Calibrated" : cockpitPreview ? "Early snapshot" : "Learning"
        }
        alignmentScore={learningScore}
        signalCount={canLearn && learning ? learning.state.dataPoints : undefined}
        message={dash.calibration.message}
      >
      <ActiveSessionChip />
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
      <CockpitAutoRefresh shouldRefresh={dash.shouldAutoRefresh} />

      {userId ? <CockpitIntelSection userId={userId} /> : null}

      {canBriefings ? <CockpitMorningBrief /> : null}
      <CockpitEngineStatus engine={dash.engine} />
      {canLearn ? <CockpitAdaptiveSuggestions initialSuggestions={adaptiveSuggestions} /> : null}

      <CockpitTodayStrip
        initial={dash.today}
        traderScores={dash.traderScores}
        axeAlignment={learningScore != null ? { ...dash.alignment, score: learningScore } : null}
      />


      {canLearn ? (
        <>
          <CockpitLearningModel
            initial={
              learning
                ? {
                    state: learning.state,
                    changes: learning.changes,
                    history: learning.history,
                    overridesAvailable: learning.overridesAvailable,
                  }
                : null
            }
          />
          <CockpitLearningArc data={dash.learningArc} />
          <CockpitKnowledgeFiles data={knowledge} />
        </>
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
      </CockpitLearningSection>
    </div>
  );
}
