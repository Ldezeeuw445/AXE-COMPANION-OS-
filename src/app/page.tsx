import type { Metadata } from "next";
import { ComplianceSiteFooter } from "@/components/legal/ComplianceSiteFooter";
import { LandingCockpitExample } from "@/components/marketing/landing/LandingCockpitExample";
import { LandingDemoSession } from "@/components/marketing/landing/LandingDemoSession";
import { LandingDeskChat } from "@/components/marketing/landing/LandingDeskChat";
import { LandingEngine } from "@/components/marketing/landing/LandingEngine";
import { LandingFaq } from "@/components/marketing/landing/LandingFaq";
import { LandingFeatureGrid } from "@/components/marketing/landing/LandingFeatureGrid";
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
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[820px]"
        style={{
          background:
            "radial-gradient(900px circle at 22% 18%, rgba(0,224,255,0.07), transparent 55%), radial-gradient(900px circle at 80% 8%, rgba(0,224,255,0.05), transparent 55%), radial-gradient(800px circle at 50% 60%, rgba(0,224,255,0.03), transparent 65%)",
        }}
      />

      <LandingHeader />
      <LandingHero />
      <LandingSurfaces />
      <LandingEngine />
      <LandingDeskChat />
      <LandingCockpitExample />
      <LandingFeatureGrid />
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
