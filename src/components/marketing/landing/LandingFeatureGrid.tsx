import {
  Bell,
  Brain,
  CircuitBoard,
  LineChart,
  Newspaper,
  Radio,
  Shield,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  COMPANION_FEATURES,
  type LandingFeatureIcon,
} from "@/lib/marketing/landingCopy";

const ICONS: Record<LandingFeatureIcon, LucideIcon> = {
  chart: LineChart,
  depth: CircuitBoard,
  news: Newspaper,
  execute: Zap,
  chat: Brain,
  journal: Sparkles,
  push: Bell,
  mt5: Radio,
  risk: ShieldCheck,
  arc: Sparkles,
  accounts: Shield,
  wallets: Wallet,
};

export function LandingFeatureGrid() {
  return (
    <section id="features" className="relative z-10">
      <div className="axe-launch-band">
        <p className="axe-launch-eyebrow">Built for real accounts</p>
        <h2 className="axe-launch-band-title">
          Native trader feel, <span className="axe-launch-gradient">calmly.</span>
        </h2>
        <p className="axe-launch-band-copy">
          Each tile is something AXE Companion does today — not a Trading OS desk widget, not a
          roadmap.
        </p>
      </div>

      <div className="px-5 py-10 md:py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COMPANION_FEATURES.map(({ title, desc, icon }) => {
            const Icon = ICONS[icon];
            return (
              <div key={title} className="axe-landing-card-glow p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                  <Icon className="h-5 w-5 text-cyan-300" aria-hidden />
                </div>
                <h3 className="mb-1.5 text-base font-semibold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-tos-muted">{desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
