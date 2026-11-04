import type { Metadata } from "next";
import { ComplianceSiteFooter } from "@/components/legal/ComplianceSiteFooter";
import { LandingCockpitExample } from "@/components/marketing/landing/LandingCockpitExample";
import { LandingDemoSession } from "@/components/marketing/landing/LandingDemoSession";
import { LandingDeskChat } from "@/components/marketing/landing/LandingDeskChat";
import { LandingEngine } from "@/components/marketing/landing/LandingEngine";
import { LandingFaq } from "@/components/marketing/landing/LandingFaq";
import { LandingFeatureGrid } from "@/components/marketing/landing/LandingFeatureGrid";
import { LandingGlowBand } from "@/components/marketing/landing/LandingGlowBand";
import { LandingFinalCta } from "@/components/marketing/landing/LandingFinalCta";
import { LandingHeader } from "@/components/marketing/landing/LandingHeader";
import { LandingHero } from "@/components/marketing/landing/LandingHero";
import { LandingMt5 } from "@/components/marketing/landing/LandingMt5";
import { LandingPricing } from "@/components/marketing/landing/LandingPricing";
import { LandingSurfaces } from "@/components/marketing/landing/LandingSurfaces";
import { LandingTestimonialsSlot } from "@/components/marketing/landing/LandingTestimonialsSlot";
import { LandingTosBridge } from "@/components/marketing/landing/LandingTosBridge";
import { loadLandingCatalog } from "@/lib/marketing/loadLandingCatalog";

export const metadata: Metadata = {
  title: "AXE Companion — your trades, your journal, your intelligence",
  description:
    "AXE Companion is the trader phone OS: live chart, estimated depth, news, one-tap execution, quick journal, push alerts and AXE chat — synced with Trading OS on your desktop.",
};

/** Founder seats are read from the database on each request — do not bake 0. */
export const dynamic = "force-dynamic";

export default async function HomeLandingPage() {
  const catalog = await loadLandingCatalog();

  return (
    <div className="axe-landing-matte-bg relative min-h-dvh overflow-hidden text-tos-text">
      {/* Hier lagen drie cyaan wassen over de bovenste 820px. Op de zwarte
          achtergrond die er was, waren ze het enige licht; op het grijs van nu
          geven ze het alleen een groenblauwe waas. Het verloop doet het werk. */}

      <LandingHeader />
      <LandingHero />

      {/* De vier gloedbanden uit final-landing-v2-enhanced.html, op dezelfde
          soort secties: het aanbod, AXE zelf, de feeds en het gedrag. */}
      <LandingGlowBand>
        <LandingSurfaces />
      </LandingGlowBand>
      <LandingGlowBand>
        <LandingEngine />
      </LandingGlowBand>
      <LandingDeskChat />
      <LandingGlowBand>
        <LandingCockpitExample />
      </LandingGlowBand>
      <LandingGlowBand>
        <LandingFeatureGrid />
      </LandingGlowBand>
      <LandingDemoSession />
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
