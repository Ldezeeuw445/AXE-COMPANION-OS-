import type { Metadata } from "next";
import { ComplianceSiteFooter } from "@/components/legal/ComplianceSiteFooter";
import { LandingEcosystem } from "@/components/marketing/landing/LandingEcosystem";
import { LandingFaq } from "@/components/marketing/landing/LandingFaq";
import { LandingFeatureGrid } from "@/components/marketing/landing/LandingFeatureGrid";
import { LandingGlowBand } from "@/components/marketing/landing/LandingGlowBand";
import { LandingFinalCta } from "@/components/marketing/landing/LandingFinalCta";
import { LandingHeader } from "@/components/marketing/landing/LandingHeader";
import { LaunchHeroExperience } from "@/components/marketing/LaunchHeroExperience";
import { LandingIntelFeeds } from "@/components/marketing/landing/LandingIntelFeeds";
import { LandingMt5 } from "@/components/marketing/landing/LandingMt5";
import { LandingPricing } from "@/components/marketing/landing/LandingPricing";
import { LandingRevealCards } from "@/components/marketing/landing/LandingRevealCards";
import { loadLandingCatalog } from "@/lib/marketing/loadLandingCatalog";

export const metadata: Metadata = {
  title: "AXE Companion — your trading desk, in your pocket",
  description:
    "AXE Companion is the phone app of the AXE ecosystem: chart, positions, journal, alerts, news, intel and AXE, your personal AI assistant. Same login, broker accounts and data as Trading OS on your desktop.",
};

/** Founder seats are read from the database on each request — do not bake 0. */
export const dynamic = "force-dynamic";

/**
 * The AXE Companion landing. Every claim on it is checked against the live
 * product (scripts/verify-landing-claims.mjs). No mock screens, no sample
 * numbers, no empty slots: a section that cannot be shown truthfully is left
 * out rather than filled.
 */
export default async function HomeLandingPage() {
  const catalog = await loadLandingCatalog();

  return (
    <div className="axe-landing-matte-bg relative min-h-dvh overflow-hidden text-tos-text">
      <LandingHeader />
      <LaunchHeroExperience />
      <LandingGlowBand>
        <LandingEcosystem />
      </LandingGlowBand>
      <LandingRevealCards />
      <LandingGlowBand>
        <LandingFeatureGrid />
      </LandingGlowBand>
      <LandingGlowBand>
        <LandingIntelFeeds />
      </LandingGlowBand>
      <LandingMt5 />
      <LandingPricing catalog={catalog} />
      <LandingFaq />
      <LandingFinalCta />

      <ComplianceSiteFooter
        className="relative z-10"
        tagline="AXE Companion · Algorithmic insights & technical analysis tool"
      />
    </div>
  );
}
