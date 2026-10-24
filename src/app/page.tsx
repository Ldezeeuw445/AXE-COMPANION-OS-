import type { Metadata } from "next";
import { ComplianceSiteFooter } from "@/components/legal/ComplianceSiteFooter";
import { LandingDiscipline } from "@/components/marketing/landing/LandingDiscipline";
import { LandingFaq } from "@/components/marketing/landing/LandingFaq";
import { LandingFeatureGrid } from "@/components/marketing/landing/LandingFeatureGrid";
import { LandingFinalCta } from "@/components/marketing/landing/LandingFinalCta";
import { LandingHeader } from "@/components/marketing/landing/LandingHeader";
import { LaunchHeroExperience } from "@/components/marketing/LaunchHeroExperience";
import { LandingShowcase } from "@/components/marketing/landing/LandingShowcase";
import { LandingIntelFeeds } from "@/components/marketing/landing/LandingIntelFeeds";
import { LandingMt5 } from "@/components/marketing/landing/LandingMt5";
import { LandingPricing } from "@/components/marketing/landing/LandingPricing";
import { LandingRevealCards } from "@/components/marketing/landing/LandingRevealCards";
import { LandingSecondBrain } from "@/components/marketing/landing/LandingSecondBrain";
import { LandingTestimonialsSlot } from "@/components/marketing/landing/LandingTestimonialsSlot";
import { LandingTosBridge } from "@/components/marketing/landing/LandingTosBridge";
import { loadLandingCatalog } from "@/lib/marketing/loadLandingCatalog";

export const metadata: Metadata = {
  title: "AXE Companion — the trader's phone OS",
  description:
    "AXE Companion is the trader phone OS: live chart, market depth, news, one-tap execution, quick journal, push alerts and AXE chat — synced with Trading OS on your desktop.",
};

/** Founder seats are read from the database on each request — do not bake 0. */
export const dynamic = "force-dynamic";

export default async function HomeLandingPage() {
  const catalog = await loadLandingCatalog();

  return (
    <div className="axe-landing-matte-bg relative min-h-dvh overflow-hidden text-tos-text">
      <LandingHeader />
      <LaunchHeroExperience />
      <LandingRevealCards />
      <LandingSecondBrain />
      <LandingShowcase />
      <LandingIntelFeeds />
      <LandingDiscipline />
      <LandingFeatureGrid />
      <LandingTosBridge />
      <LandingMt5 />
      <LandingPricing catalog={catalog} />
      <LandingTestimonialsSlot />
      <LandingFaq />
      <LandingFinalCta />

      <ComplianceSiteFooter
        className="relative z-10"
        tagline="AXE Companion OS · Algorithmic insights & technical analysis tool"
      />
    </div>
  );
}
