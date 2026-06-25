import { Link } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  BarChart2,
  Brain,
  Check,
  ChevronRight,
  Database,
  GraduationCap,
  Layout,
  LineChart,
  Radio,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
  Smartphone,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { InternalLink } from '@/components/layout/InternalLink';
import AxeLandingNavbar from '@/components/landing/AxeLandingNavbar';
import AxeLandingModularDeck from '@/components/landing/AxeLandingModularDeck';
import { AxeCompanionInstallDialog } from '@/components/axe/AxeCompanionInstallDialog';
import { TICKER_DATA } from '@/content/landing';
import {
  AXE_BUILT_DIFFERENT,
  AXE_BOTTOM_CTA,
  AXE_MOBILE_INSTALL,
  AXE_FAQ,
  AXE_FEATURES,
  AXE_FEATURES_SECTION,
  AXE_FOOTER,
  AXE_HERO,
  AXE_INSTRUMENTS,
  AXE_PRICING_PLANS,
  AXE_PRICING_SECTION,
  AXE_PRODUCT_BRIDGE,
  AXE_STATS,
  AXE_STORY_QUOTE,
  AXE_WAITLIST_HELPER,
} from '@/content/axeLanding';

const FEATURE_ICON_MAP: Record<string, LucideIcon> = {
  LineChart,
  Radio,
  Database,
  Brain,
  BarChart2,
  Target,
  Shield,
  Layout,
};

const COLOR_ICON: Record<string, string> = {
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
  amber: 'text-amber-400',
  violet: 'text-violet-400',
  cyan: 'text-cyan-400',
  red: 'text-red-400',
  teal: 'text-teal-400',
  indigo: 'text-indigo-400',
};

const STAT_GRADIENT: Record<string, string> = {
  emerald: 'from-emerald-400 to-emerald-400/30',
  blue: 'from-blue-400 to-blue-400/30',
  violet: 'from-violet-400 to-violet-400/30',
};

function PhoneHeroMockup() {
  return (
    <div className="relative flex w-full justify-center lg:justify-end">
      <div
        className="relative rounded-[40px] border border-white/10 bg-gradient-to-b from-[#12141c] to-[#07080c] p-2 shadow-2xl"
        style={{
          boxShadow:
            '0 40px 120px rgba(0,0,0,0.60), 0 10px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 h-7 w-[100px] -translate-x-1/2 rounded-b-[18px] border-b border-white/[0.08] bg-[#0a0b10]" />
        <img
          src="/assets/axe-landing-hero-chat.jpg"
          alt={AXE_HERO.phoneAlt}
          className="block w-[240px] rounded-[32px] sm:w-[260px] md:w-[280px]"
          width={280}
          height={560}
        />
      </div>
      <div
        className="pointer-events-none absolute -bottom-8 left-1/2 h-24 w-[70%] max-w-[320px] -translate-x-1/2 rounded-full opacity-70"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.22), transparent 70%)',
          filter: 'blur(22px)',
        }}
      />
    </div>
  );
}

export default function AxeHomeLanding() {
  const [email, setEmail] = useState('');
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  const handleWaitlist = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const existing = JSON.parse(localStorage.getItem('axe_waitlist') || '[]');
    localStorage.setItem('axe_waitlist', JSON.stringify([...existing, email]));
    toast({
      title: "You're on the list",
      description: "We'll reach out as AXE access widens and with updates on Trading OS — our upcoming premium terminal.",
    });
    setEmail('');
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 landing-matte-bg draft-depth">
      <AxeLandingNavbar />

      <div className="mt-[4.25rem] border-b border-white/[0.04] bg-white/[0.01] py-2">
        <div className="mx-auto max-w-[1400px] overflow-hidden px-6">
          <div className="flex w-[200%] animate-marquee gap-0">
            {[...TICKER_DATA, ...TICKER_DATA].map((t, i) => (
              <div key={i} className="flex items-center gap-3 whitespace-nowrap px-4">
                <span className="font-mono text-[11px] font-semibold text-foreground">{t.symbol}</span>
                <span className="font-mono text-[11px] text-foreground">{t.price}</span>
                <span
                  className={`flex items-center gap-0.5 font-mono text-[11px] font-semibold ${
                    t.up ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {t.up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                  {t.change}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section
        className="relative overflow-hidden"
        style={{
          background:
            'radial-gradient(900px circle at 50% 12%, rgba(34,211,238,0.08), transparent 34%), linear-gradient(180deg, #050508 0%, #06070c 38%, #070a12 72%, #050508 100%)',
          minHeight: 'min(100svh, 920px)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(5,5,8,0.18) 0%, rgba(5,5,8,0.08) 40%, rgba(5,5,8,0.02) 100%)',
            zIndex: 1,
          }}
        />

        <div className="relative z-20 mx-auto max-w-[1200px] px-6 pb-16 pt-12 md:pt-16 lg:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-10">
            <div>
              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
                style={{
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.20) 0%, rgba(16,185,129,0.10) 100%)',
                  border: '1px solid rgba(34,197,94,0.35)',
                  boxShadow: '0 0 26px rgba(34,197,94,0.12)',
                }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-emerald-300">{AXE_HERO.badge}</span>
              </div>

              <h1 className="mt-8 max-w-[560px] text-4xl font-bold leading-[0.98] tracking-[-0.05em] text-white sm:text-5xl md:text-6xl">
                {AXE_HERO.headlineLine1}
                <br />
                <span className="landing-heading-shimmer">{AXE_HERO.headlineLine2}</span>
              </h1>

              <p className="mt-6 max-w-[520px] text-sm leading-7 text-white/55 sm:text-base">{AXE_HERO.subtext}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link to="/auth">
                  <Button className="h-11 bg-emerald-500 px-6 font-semibold text-black hover:bg-emerald-400">
                    Start free <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-white/10 bg-white/5 px-6 hover:bg-white/10"
                  onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  View demo
                </Button>
                <Link to="/app">
                  <Button variant="ghost" className="h-11 text-white/55 hover:bg-white/[0.04] hover:text-white/85">
                    Open app
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 text-white/45 hover:bg-white/[0.04] hover:text-white/70"
                  onClick={() => document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Join waitlist
                </Button>
              </div>
            </div>

            <div id="demo" className="scroll-mt-28">
              <PhoneHeroMockup />
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/[0.04] px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <p
            className="mx-auto mb-6 max-w-3xl text-center text-sm italic leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.38)' }}
          >
            &ldquo;{AXE_STORY_QUOTE}&rdquo;
          </p>
          <div className="mb-6 flex flex-wrap justify-center gap-x-6 gap-y-2">
            {AXE_INSTRUMENTS.map((inst) => (
              <span
                key={inst}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] text-white/70"
              >
                {inst}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.04] px-6 py-20">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 md:p-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200/90">
            {AXE_PRODUCT_BRIDGE.badge}
          </div>
          <h2 className="mb-3 text-2xl font-bold leading-tight text-white md:text-3xl">
            {AXE_PRODUCT_BRIDGE.headline1}{' '}
            <span className="landing-heading-shimmer">{AXE_PRODUCT_BRIDGE.headline2}</span>
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground md:text-base">{AXE_PRODUCT_BRIDGE.body}</p>
          <p className="text-sm font-semibold text-white/85">{AXE_PRODUCT_BRIDGE.tagline}</p>
        </div>
      </section>

      <section id="features" className="px-6 py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-20 text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
              <Zap className="h-3 w-3 text-emerald-400" /> {AXE_FEATURES_SECTION.badge}
            </div>
            <h2 className="mb-6 text-4xl font-bold leading-tight md:text-5xl">
              {AXE_FEATURES_SECTION.headline1}
              <br />
              <span className="landing-heading-shimmer">{AXE_FEATURES_SECTION.headline2}</span>
            </h2>
            <p className="mx-auto max-w-xl text-lg text-muted-foreground">{AXE_FEATURES_SECTION.subtext}</p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {AXE_FEATURES.map((feature, i) => {
              const FeatureIcon = FEATURE_ICON_MAP[feature.iconKey];
              return (
                <div key={i} className="tos-card rounded-2xl p-7">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/5">
                    {FeatureIcon ? (
                      <FeatureIcon className={`h-5 w-5 ${COLOR_ICON[feature.colorKey] ?? 'text-white'}`} />
                    ) : null}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="relative mt-8 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.04] via-emerald-500/[0.02] to-transparent p-8">
            <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-emerald-500/[0.03] blur-[80px]" />
            <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center">
              <div className="flex shrink-0 items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                  <GraduationCap className="h-7 w-7 text-emerald-400" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative h-7 w-12 rounded-full border border-emerald-500/30 bg-emerald-500/20">
                    <div className="absolute right-0.5 top-0.5 h-6 w-6 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/30" />
                  </div>
                  <span className="text-sm font-bold uppercase tracking-wider text-emerald-400">ON</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="mb-1 text-xl font-bold">Beginner-friendly by default</h3>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Same philosophy as Trading OS — our upcoming premium trading terminal: progressive disclosure, fewer sharp edges, and room to grow into power features as you link real accounts.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-400/60" />
                <span className="text-xs text-muted-foreground">Ingest · RLS · Revocable tokens</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AxeLandingModularDeck />

      <section className="border-t border-white/[0.04] px-6 py-28">
        <div className="mx-auto max-w-6xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
            <Shield className="h-3 w-3 text-emerald-400" /> {AXE_BUILT_DIFFERENT.badge}
          </div>
          <h2 className="mb-16 text-4xl font-bold leading-tight md:text-5xl">
            {AXE_BUILT_DIFFERENT.headline1}
            <br />
            <span className="landing-heading-shimmer">{AXE_BUILT_DIFFERENT.headline2}</span>
          </h2>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {AXE_STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div
                  className={`mb-3 bg-gradient-to-b bg-clip-text font-mono text-5xl font-bold text-transparent ${
                    STAT_GRADIENT[stat.color] ?? 'from-white to-white/30'
                  }`}
                >
                  {stat.number}
                </div>
                <div className="mb-1 text-sm font-semibold">{stat.label}</div>
                <div className="text-xs text-muted-foreground">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-white/[0.04] px-6 py-28">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">{AXE_PRICING_SECTION.headline}</h2>
            <p className="text-muted-foreground">{AXE_PRICING_SECTION.subtext}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {AXE_PRICING_PLANS.map((plan) => (
              <div
                key={plan.tier}
                className={`relative rounded-2xl p-8 transition-all duration-300 ${
                  plan.highlight ? 'tos-card border border-emerald-500/20' : 'tos-card'
                }`}
              >
                {plan.highlight ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1 text-xs font-bold text-black">
                    Most Popular
                  </div>
                ) : null}
                <div className="mb-6">
                  <h3 className="mb-1 text-xl font-bold">{plan.tier}</h3>
                  <p className="text-xs text-muted-foreground">{plan.desc}</p>
                </div>
                <div className="mb-1 font-mono text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  {AXE_PRICING_SECTION.priceText}
                </div>
                <p className="mb-6 text-xs text-muted-foreground">{AXE_PRICING_SECTION.priceSub}</p>
                <ul className="mb-8 space-y-3">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <Check className="h-4 w-4 flex-shrink-0 text-emerald-400/60" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  className={`h-11 w-full ${
                    plan.highlight
                      ? 'bg-emerald-500 font-semibold text-black hover:bg-emerald-400'
                      : 'border border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                  onClick={() =>
                    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-white/[0.04] px-6 py-28">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full space-y-2">
            {AXE_FAQ.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`axe-item-${i}`}
                className="tos-card rounded-xl px-5 data-[state=open]:bg-white/[0.02]"
              >
                <AccordionTrigger className="py-4 text-left text-sm hover:text-emerald-400">{faq.q}</AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section id="mobile-app" className="scroll-mt-28 border-t border-white/[0.04] px-6 py-28">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
            <Smartphone className="h-3 w-3 text-cyan-400" /> {AXE_MOBILE_INSTALL.badge}
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl">{AXE_MOBILE_INSTALL.headline}</h2>
          <p className="mx-auto mb-10 max-w-xl text-center text-muted-foreground">{AXE_MOBILE_INSTALL.subtext}</p>
          <div className="flex flex-col items-center justify-center gap-8 md:flex-row md:items-start md:gap-12">
            <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8">
              <p className="text-center text-sm text-muted-foreground">{AXE_MOBILE_INSTALL.envHint}</p>
              <Button
                type="button"
                onClick={() => setInstallDialogOpen(true)}
                className="h-12 w-full bg-gradient-to-r from-purple-500/90 to-cyan-500/90 px-6 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 hover:from-purple-500 hover:to-cyan-500 sm:max-w-xs"
              >
                <Download className="mr-2 h-4 w-4" />
                Get AXE Companion
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">QR appears in a window — scan with your phone.</p>
            </div>
            <div className="max-w-md space-y-4 text-sm text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Web here</span> — dashboard, broker linking, and journal
                live in this site (<Link to="/app" className="text-cyan-400/90 underline-offset-2 hover:underline">/app</Link>
                ).
              </p>
              <p>
                <span className="font-semibold text-foreground">Phone shell</span> — the separate Companion app is tuned
                for chat and quick actions; deploy it and point the QR URL at your public <code className="rounded bg-white/10 px-1 text-xs">/chat</code>{' '}
                route.
              </p>
              <Link to="/auth">
                <Button className="mt-2 h-11 w-full bg-emerald-500 font-semibold text-black hover:bg-emerald-400 sm:w-auto">
                  Same login everywhere <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <AxeCompanionInstallDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} />

      <section id="waitlist" className="scroll-mt-28 border-t border-white/[0.04] px-6 py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-4xl font-bold md:text-5xl">
            {AXE_BOTTOM_CTA.headline1}{' '}
            <span className="landing-heading-shimmer">{AXE_BOTTOM_CTA.headlineShimmer}</span>
            {AXE_BOTTOM_CTA.headline2}
          </h2>
          <p className="mb-10 text-lg text-muted-foreground">{AXE_BOTTOM_CTA.subtext}</p>
          <p className="mx-auto mb-8 max-w-xl text-center text-sm text-muted-foreground">{AXE_WAITLIST_HELPER}</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
            <Link to="/auth">
              <Button className="h-12 bg-emerald-500 px-8 text-base font-semibold text-black hover:bg-emerald-400">
                Start free <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              className="h-12 border-white/10 bg-white/5 px-8 text-base hover:bg-white/10"
              onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              View demo
            </Button>
            <Link to="/app">
              <Button variant="ghost" className="h-12 px-8 text-base text-white/70 hover:bg-white/[0.04] hover:text-white">
                Open app
              </Button>
            </Link>
          </div>

          <form onSubmit={handleWaitlist} className="mt-10 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-[260px] rounded-md border border-white/10 bg-white/5 px-3 text-sm outline-none placeholder:text-white/30"
            />
            <Button type="submit" className="h-11 border border-cyan-500/25 bg-cyan-500/20 px-5 text-cyan-200 hover:bg-cyan-500/25">
              Join the Trading OS waitlist
            </Button>
          </form>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] bg-white/[0.01] px-6 py-16 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex flex-col items-start justify-between gap-10 md:flex-row">
            <div>
              <Link to="/" className="mb-4 inline-flex items-center gap-2" aria-label="AXE Companion home">
                <img
                  src="/assets/axe-companion-os.png"
                  alt=""
                  className="h-10 w-10 rounded-lg border border-white/10 object-cover"
                />
                <span className="text-base font-semibold text-white/90">AXE Companion</span>
              </Link>
              <p className="max-w-xs text-sm text-muted-foreground">{AXE_FOOTER.tagline}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-white/50">{AXE_FOOTER.terminalTitle}</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{AXE_FOOTER.terminalBody}</p>
              <a
                href="#waitlist"
                className="mt-3 inline-block text-sm font-medium text-cyan-400/90 underline-offset-2 hover:text-cyan-300 hover:underline"
              >
                Join the Trading OS waitlist
              </a>
            </div>
            <div className="flex gap-16">
              <div>
                <div className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Product</div>
                <div className="space-y-2.5">
                  <a href="#features" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Features
                  </a>
                  <a href="#pricing" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Pricing
                  </a>
                  <Link to="/app" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                    App
                  </Link>
                  <a
                    href="#mobile-app"
                    className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Mobile app
                  </a>
                </div>
              </div>
              <div>
                <div className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Legal</div>
                <div className="space-y-2.5">
                  <InternalLink href="/privacy" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Privacy Policy
                  </InternalLink>
                  <InternalLink href="/terms" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Terms of Service
                  </InternalLink>
                  <InternalLink href="/disclaimer" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Disclaimer
                  </InternalLink>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 text-center">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {AXE_FOOTER.copyright} |{' '}
              <InternalLink href="/privacy" className="underline-offset-2 hover:text-foreground hover:underline">
                Privacy
              </InternalLink>
              {' · '}
              <InternalLink href="/disclaimer" className="underline-offset-2 hover:text-foreground hover:underline">
                Disclaimer
              </InternalLink>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
