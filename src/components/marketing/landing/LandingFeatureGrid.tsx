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
    <section className="relative z-10 border-t border-white/[0.04] px-5 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          Companion features
        </p>
        <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
          Native trader feel, calmly.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-tos-muted md:text-base">
          Each tile is something AXE Companion does today — not a Trading OS desk widget, not a roadmap.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
