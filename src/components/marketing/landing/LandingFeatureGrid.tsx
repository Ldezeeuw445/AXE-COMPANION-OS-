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
  LANDING_STATUS_LABEL,
  type LandingFeatureIcon,
  type LandingFeatureStatus,
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

const STATUS_CLASS: Record<LandingFeatureStatus, string> = {
  available: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100/95",
  beta: "border-amber-300/30 bg-amber-300/10 text-amber-100/95",
  coming_soon: "border-white/15 bg-white/[0.04] text-white/60",
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
          Each tile is labelled Available, Beta or Coming soon — based on what the app ships today,
          not a roadmap pitch.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COMPANION_FEATURES.map(({ title, desc, icon, status }) => {
            const Icon = ICONS[icon];
            return (
              <div key={title} className="axe-landing-card-glow p-6">
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                    <Icon className="h-5 w-5 text-cyan-300" aria-hidden />
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${STATUS_CLASS[status]}`}
                  >
                    {LANDING_STATUS_LABEL[status]}
                  </span>
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
