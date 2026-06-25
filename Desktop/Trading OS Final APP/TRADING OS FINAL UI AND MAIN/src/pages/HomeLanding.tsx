import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/layout/Navbar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BarChart2,
  Brain,
  Calendar,
  Check,
  ChevronRight,
  Eye,
  GraduationCap,
  Layout,
  LineChart,
  List,
  Radio,
  Ship,
  Plane,
  Target,
  Bell,
  TrendingUp,
  TrendingDown,
  Zap,
  Database,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { useState, useRef, useEffect, type FormEvent } from 'react';
import { toast } from '@/hooks/use-toast';
import { TradingOsLogo } from '@/components/branding/TradingOsLogo';
import { InternalLink } from '@/components/layout/InternalLink';
import { isPublicDemoOnly } from '@/lib/publicSurface';
import LandingModularDeck from '@/components/landing/LandingModularDeck';
import {
  HERO,
  STORY_QUOTE,
  TICKER_DATA,
  INSTRUMENTS,
  FEATURES as FEATURES_CONTENT,
  FEATURES_SECTION,
  STATS,
  BUILT_DIFFERENT,
  PRICING_SECTION,
  PRICING_PLANS,
  FAQ as FAQ_CONTENT,
  BOTTOM_CTA,
  FOOTER,
} from '@/content/landing';

const FEATURE_ICON_MAP: Record<string, LucideIcon> = {
  LineChart,
  Radio,
  Database,
  Brain,
  Ship,
  Plane,
  BarChart2,
  Target,
  Calendar,
  List,
  Bell,
  Layout,
};

const COLOR_ICON: Record<string, string> = {
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
  amber: 'text-amber-400',
  violet: 'text-violet-400',
  cyan: 'text-cyan-400',
  orange: 'text-orange-400',
  pink: 'text-pink-400',
  red: 'text-red-400',
  teal: 'text-teal-400',
  sky: 'text-sky-400',
  rose: 'text-rose-400',
  indigo: 'text-indigo-400',
};

const STAT_GRADIENT: Record<string, string> = {
  emerald: 'from-emerald-400 to-emerald-400/30',
  blue: 'from-blue-400 to-blue-400/30',
  violet: 'from-violet-400 to-violet-400/30',
};

function HeroImage() {
  const [heroEmail, setHeroEmail] = useState('');
  const [heroSubmitted, setHeroSubmitted] = useState(false);

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const beamRef = useRef<HTMLDivElement | null>(null);
  const ambientRef = useRef<HTMLDivElement | null>(null);
  const farWidgetsRef = useRef<HTMLDivElement | null>(null);
  const midWidgetsRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  const mxRef = useRef(0.5);
  const myRef = useRef(0.5);
  const tmxRef = useRef(0.5);
  const tmyRef = useRef(0.5);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      mxRef.current += (tmxRef.current - mxRef.current) * 0.08;
      myRef.current += (tmyRef.current - myRef.current) * 0.08;

      const px = `${(mxRef.current * 100).toFixed(1)}%`;
      const py = `${(myRef.current * 100).toFixed(1)}%`;

      if (glowRef.current) {
        glowRef.current.style.background = `
          radial-gradient(420px circle at ${px} ${py},
            rgba(255,255,255,0.16) 0%,
            rgba(34,211,238,0.22) 16%,
            rgba(16,185,129,0.12) 34%,
            rgba(59,130,246,0.08) 52%,
            transparent 74%
          )
        `;
      }

      if (beamRef.current) {
        beamRef.current.style.background = `
          radial-gradient(240px circle at ${px} 16%,
            rgba(255,255,255,0.20) 0%,
            rgba(34,211,238,0.18) 18%,
            transparent 58%
          )
        `;
      }

      if (ambientRef.current) {
        ambientRef.current.style.background = `
          radial-gradient(900px circle at ${px} ${py},
            rgba(34,211,238,0.10) 0%,
            rgba(59,130,246,0.08) 24%,
            rgba(16,185,129,0.05) 44%,
            transparent 72%
          )
        `;
      }

      if (farWidgetsRef.current) {
        farWidgetsRef.current.style.transform = `translate3d(${(mxRef.current - 0.5) * 18}px, ${(myRef.current - 0.5) * 14}px, 0) scale(0.96)`;
      }

      if (midWidgetsRef.current) {
        midWidgetsRef.current.style.transform = `translate3d(${(mxRef.current - 0.5) * 30}px, ${(myRef.current - 0.5) * 22}px, 0) scale(1)`;
      }

      if (shellRef.current) {
        shellRef.current.style.transform = `perspective(1400px) rotateX(${8 + (0.5 - myRef.current) * 4}deg) rotateY(${(mxRef.current - 0.5) * 5}deg)`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const scene = sceneRef.current;
    if (!scene) return;

    const onMove = (e: MouseEvent) => {
      const r = scene.getBoundingClientRect();
      tmxRef.current = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      tmyRef.current = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    };

    const onLeave = () => {
      tmxRef.current = 0.5;
      tmyRef.current = 0.35;
    };

    scene.addEventListener('mousemove', onMove);
    scene.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(rafRef.current);
      scene.removeEventListener('mousemove', onMove);
      scene.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div className="relative z-20 flex justify-center w-full" style={{ marginTop: '-20px' }}>
      <div
        ref={sceneRef}
        className="relative w-[96vw] max-w-[1440px] select-none"
        style={{
          minHeight: '760px',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[40px]"
          style={{
            background: 'linear-gradient(180deg, rgba(5,8,16,0.2) 0%, rgba(5,8,16,0) 100%)',
            zIndex: 0,
          }}
        />

        <div
          ref={ambientRef}
          className="pointer-events-none absolute inset-[-8%] rounded-[60px]"
          style={{
            filter: 'blur(70px)',
            opacity: 1,
            zIndex: 0,
          }}
        />

        <div
          ref={beamRef}
          className="pointer-events-none absolute left-1/2 top-[2%] h-[320px] w-[620px] -translate-x-1/2"
          style={{
            filter: 'blur(26px)',
            opacity: 0.9,
            zIndex: 1,
          }}
        />

        <div
          className="pointer-events-none absolute left-1/2 top-[6%] h-[520px] w-[900px] -translate-x-1/2"
          style={{
            zIndex: 1,
            opacity: 0.4,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(34,211,238,0.08) 12%, rgba(34,211,238,0.02) 24%, transparent 65%)',
            clipPath: 'polygon(49% 0%, 51% 0%, 86% 100%, 14% 100%)',
            filter: 'blur(1px)',
          }}
        />

        <div
          ref={farWidgetsRef}
          className="pointer-events-none absolute inset-x-[8%] top-[18%] h-[420px]"
          style={{ zIndex: 1, opacity: 0.22, transition: 'transform 220ms ease-out' }}
        >
          <div className="absolute left-[3%] top-[18%] h-[140px] w-[220px] rounded-[22px] border border-white/8 bg-white/[0.03] backdrop-blur-[10px]" />
          <div className="absolute left-[18%] top-[5%] h-[100px] w-[170px] rounded-[18px] border border-cyan-400/10 bg-cyan-400/[0.03]" />
          <div className="absolute right-[8%] top-[8%] h-[130px] w-[210px] rounded-[20px] border border-white/8 bg-white/[0.03]" />
          <div className="absolute right-[18%] top-[28%] h-[180px] w-[280px] rounded-[26px] border border-emerald-400/10 bg-emerald-400/[0.03]" />
          <div className="absolute left-[28%] top-[24%] h-[190px] w-[320px] rounded-[28px] border border-blue-400/10 bg-blue-400/[0.03]" />
        </div>

        <div
          ref={midWidgetsRef}
          className="pointer-events-none absolute inset-x-[10%] top-[22%] h-[440px]"
          style={{ zIndex: 2, opacity: 0.34, transition: 'transform 220ms ease-out' }}
        >
          <div className="absolute left-[10%] top-[10%] h-[170px] w-[260px] rounded-[26px] border border-white/10 bg-white/[0.035] backdrop-blur-[14px]" />
          <div className="absolute right-[12%] top-[14%] h-[150px] w-[240px] rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-[14px]" />
          <div className="absolute left-[24%] top-[28%] h-[220px] w-[340px] rounded-[30px] border border-cyan-400/10 bg-cyan-400/[0.025]" />
        </div>

        <div className="relative z-10 flex flex-col items-center pt-6">
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
            <span className="text-emerald-300">{HERO.badge}</span>
          </div>

          <div className="mt-8 max-w-[980px] px-6 text-center">
            <h1 className="text-5xl font-bold leading-[0.95] tracking-[-0.05em] text-white sm:text-6xl md:text-7xl">
              {HERO.headlineLine1}
              <br />
              <span className="landing-heading-shimmer">{HERO.headlineLine2}</span>
            </h1>

            <p className="mx-auto mt-6 max-w-[760px] text-sm leading-7 text-white/55 sm:text-base">
              A focused trading workspace with synced widgets, live market context, and a cleaner way to manage charts, levels, news and execution prep.
            </p>
          </div>

          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
            <Link to="/auth">
              <Button className="h-11 px-6 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold">
                Request Access
              </Button>
            </Link>

            <Button
              variant="outline"
              className="h-11 px-6 border-white/10 bg-white/5 hover:bg-white/10"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              See Features
            </Button>
          </div>
        </div>

        <div className="relative z-20 mt-14 flex justify-center px-4 sm:px-6">
          <div
            ref={shellRef}
            className="relative w-full max-w-[1180px]"
            style={{
              transition: 'transform 180ms ease-out',
              transformStyle: 'preserve-3d',
            }}
          >
            <div
              ref={glowRef}
              className="pointer-events-none absolute inset-[-18px] rounded-[36px]"
              style={{
                filter: 'blur(18px)',
                opacity: 1,
                zIndex: 1,
              }}
            />

            <div
              className="pointer-events-none absolute left-[2%] right-[2%] bottom-[-26px] h-[70px]"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(34,211,238,0.16) 0%, rgba(16,185,129,0.08) 28%, transparent 72%)',
                filter: 'blur(40px)',
                zIndex: 0,
              }}
            />

            <div
              className="relative overflow-hidden rounded-[30px] border border-white/10"
              style={{
                background: 'linear-gradient(180deg, rgba(14,16,24,0.98) 0%, rgba(7,8,14,0.99) 100%)',
                boxShadow:
                  '0 40px 120px rgba(0,0,0,0.60), 0 10px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
                zIndex: 2,
              }}
            >
              <div
                className="flex items-center gap-3 border-b border-white/8 px-5"
                style={{
                  height: '52px',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                  <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>

                <div className="ml-2 flex h-8 flex-1 items-center justify-center rounded-md border border-white/8 bg-white/[0.04] text-[11px] text-white/35">
                  tradingos.app
                </div>
              </div>

              <div className="grid min-h-[520px] grid-cols-12 gap-4 p-4 md:min-h-[620px] md:p-5">
                <div className="hidden md:col-span-2 md:flex md:flex-col md:gap-3">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="mb-3 h-2 w-16 rounded-full bg-white/15" />
                    <div className="space-y-2">
                      <div className="h-2 w-full rounded-full bg-white/8" />
                      <div className="h-2 w-4/5 rounded-full bg-white/8" />
                      <div className="h-2 w-3/5 rounded-full bg-white/8" />
                      <div className="h-2 w-5/6 rounded-full bg-white/8" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="mb-3 h-2 w-20 rounded-full bg-cyan-300/20" />
                    <div className="space-y-2">
                      <div className="h-2 w-full rounded-full bg-white/8" />
                      <div className="h-2 w-2/3 rounded-full bg-white/8" />
                      <div className="h-2 w-5/6 rounded-full bg-white/8" />
                    </div>
                  </div>
                </div>

                <div className="col-span-12 flex flex-col gap-4 md:col-span-7">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {['BTC/USD', 'EUR/USD', 'NAS100'].map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3"
                      >
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">{item}</div>
                        <div className="mt-2 h-2 w-20 rounded-full bg-white/10" />
                        <div className="mt-2 h-2 w-12 rounded-full bg-emerald-400/20" />
                      </div>
                    ))}
                  </div>

                  <div
                    className="relative flex-1 overflow-hidden rounded-[26px] border border-white/8"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(12,14,20,0.98) 0%, rgba(6,7,12,0.99) 100%)',
                    }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage:
                          'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
                        backgroundSize: '34px 34px',
                        opacity: 0.4,
                      }}
                    />
                    <div
                      className="absolute inset-x-[8%] top-[18%] h-[2px]"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.9), transparent)',
                        boxShadow: '0 0 22px rgba(34,211,238,0.35)',
                      }}
                    />
                    <div
                      className="absolute inset-x-[14%] top-[44%] h-[2px]"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.7), transparent)',
                        boxShadow: '0 0 18px rgba(16,185,129,0.25)',
                      }}
                    />
                    <div
                      className="absolute bottom-[18%] left-[16%] right-[16%] h-[140px] rounded-[28px]"
                      style={{
                        background:
                          'radial-gradient(circle at 50% 50%, rgba(34,211,238,0.14) 0%, rgba(59,130,246,0.08) 32%, transparent 72%)',
                        filter: 'blur(12px)',
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="mb-3 h-2 w-28 rounded-full bg-white/12" />
                      <div className="space-y-2">
                        <div className="h-2 w-full rounded-full bg-white/8" />
                        <div className="h-2 w-full rounded-full bg-white/8" />
                        <div className="h-2 w-3/4 rounded-full bg-white/8" />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="mb-3 h-2 w-20 rounded-full bg-white/12" />
                      <div className="space-y-2">
                        <div className="h-2 w-full rounded-full bg-white/8" />
                        <div className="h-2 w-2/3 rounded-full bg-white/8" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden md:col-span-3 md:flex md:flex-col md:gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                    >
                      <div className="mb-3 h-2 w-24 rounded-full bg-white/12" />
                      <div className="space-y-2">
                        <div className="h-2 w-full rounded-full bg-white/8" />
                        <div className="h-2 w-4/5 rounded-full bg-white/8" />
                        <div className="h-2 w-3/5 rounded-full bg-white/8" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center px-6">
          {heroSubmitted ? (
            <div
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
              style={{
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.30)',
              }}
            >
              <span className="text-emerald-400">{HERO.waitlistConfirmation}</span>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!heroEmail) return;
                const ex = JSON.parse(localStorage.getItem('waitlist') || '[]');
                localStorage.setItem('waitlist', JSON.stringify([...ex, heroEmail]));
                setHeroSubmitted(true);
                setHeroEmail('');
              }}
              className="flex flex-col items-center gap-3 sm:flex-row"
            >
              <input
                type="email"
                placeholder={HERO.emailPlaceholder}
                value={heroEmail}
                onChange={(e) => setHeroEmail(e.target.value)}
                className="h-11 w-[260px] rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/30"
              />
              <button
                type="submit"
                className="h-11 rounded-md border border-emerald-400/20 bg-emerald-500 px-5 text-sm font-semibold text-black transition hover:bg-emerald-400"
              >
                Join Waitlist
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomeLanding() {
  const [email, setEmail] = useState('');

  const handleRequestAccess = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const existing = JSON.parse(localStorage.getItem('waitlist') || '[]');
    localStorage.setItem('waitlist', JSON.stringify([...existing, email]));
    toast({
      title: "You're on the list",
      description: "We'll be in touch when your access is ready.",
    });
    setEmail('');
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 landing-matte-bg draft-depth">
      <Navbar />

      <div className="py-2 mt-[4.25rem] border-b border-white/[0.04] bg-white/[0.01]">
        <div className="mx-auto max-w-[1400px] overflow-hidden px-6">
          <div className="flex gap-0 animate-marquee w-[200%]">
            {[...TICKER_DATA, ...TICKER_DATA].map((t, i) => (
              <div key={i} className="flex items-center gap-3 px-4 whitespace-nowrap">
                <span className="text-[11px] font-semibold text-foreground font-mono">{t.symbol}</span>
                <span className="text-[11px] font-mono text-foreground">{t.price}</span>
                <span className={`text-[11px] font-mono font-semibold flex items-center gap-0.5 ${t.up ? 'text-emerald-400' : 'text-red-400'}`}>
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
          minHeight: 'calc(100vh - 4.25rem - 2.5rem)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(5,5,8,0.18) 0%, rgba(5,5,8,0.08) 40%, rgba(5,5,8,0.02) 100%)',
            zIndex: 1,
          }}
        />

        <div className="relative z-20 flex justify-center w-full">
          <HeroImage />
        </div>
      </section>

      <section className="relative py-8 px-6 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-sm italic mb-6 max-w-3xl mx-auto leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>
            &ldquo;{STORY_QUOTE}&rdquo;
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-6">
            {INSTRUMENTS.map((inst) => (
              <span key={inst} className="text-[11px] font-mono px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/70">
                {inst}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground mb-6">
              <Zap className="h-3 w-3 text-emerald-400" /> {FEATURES_SECTION.badge}
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              {FEATURES_SECTION.headline1}
              <br />
              <span className="landing-heading-shimmer">{FEATURES_SECTION.headline2}</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">{FEATURES_SECTION.subtext}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {FEATURES_CONTENT.map((feature, i) => {
              const FeatureIcon = FEATURE_ICON_MAP[feature.iconKey];
              return (
                <div key={i} className="tos-card rounded-2xl p-7">
                  <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/[0.08] flex items-center justify-center mb-5">
                    {FeatureIcon ? <FeatureIcon className={`h-5 w-5 ${COLOR_ICON[feature.colorKey] ?? 'text-white'}`} /> : null}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.04] via-emerald-500/[0.02] to-transparent p-8">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/[0.03] rounded-full blur-[80px]" />
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="flex items-center gap-4 shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <GraduationCap className="h-7 w-7 text-emerald-400" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 relative">
                    <div className="absolute right-0.5 top-0.5 w-6 h-6 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/30" />
                  </div>
                  <span className="text-sm font-bold text-emerald-400 uppercase tracking-wider">ON</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-1">Beginner Mode</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  New to trading? Toggle Beginner Mode to unlock tooltips, guided explanations, and simplified views across every widget.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Eye className="h-4 w-4 text-emerald-400/60" />
                <span className="text-xs text-muted-foreground">Tooltips · Guides · Explanations</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingModularDeck />

      <section className="py-28 px-6 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground mb-6">
            <Shield className="h-3 w-3 text-emerald-400" /> {BUILT_DIFFERENT.badge}
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-16 leading-tight">
            {BUILT_DIFFERENT.headline1}
            <br />
            <span className="landing-heading-shimmer">{BUILT_DIFFERENT.headline2}</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className={`text-5xl font-bold font-mono text-transparent bg-clip-text bg-gradient-to-b ${STAT_GRADIENT[stat.color] ?? 'from-white to-white/30'} mb-3`}>
                  {stat.number}
                </div>
                <div className="text-sm font-semibold mb-1">{stat.label}</div>
                <div className="text-xs text-muted-foreground">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-28 px-6 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">{PRICING_SECTION.headline}</h2>
            <p className="text-muted-foreground">{PRICING_SECTION.subtext}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => (
              <div key={plan.tier} className={`relative rounded-2xl p-8 transition-all duration-300 ${plan.highlight ? 'tos-card border border-emerald-500/20' : 'tos-card'}`}>
                {plan.highlight ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-4 py-1 rounded-full text-xs font-bold">
                    Most Popular
                  </div>
                ) : null}
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-1">{plan.tier}</h3>
                  <p className="text-xs text-muted-foreground">{plan.desc}</p>
                </div>
                <div className="text-2xl md:text-3xl font-bold font-mono mb-1 text-foreground tracking-tight">{PRICING_SECTION.priceText}</div>
                <p className="text-xs text-muted-foreground mb-6">{PRICING_SECTION.priceSub}</p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <Check className="h-4 w-4 text-emerald-400/60 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button className={`w-full h-11 ${plan.highlight ? 'bg-emerald-500 hover:bg-emerald-400 text-black font-semibold' : 'bg-white/5 hover:bg-white/10 border border-white/10'}`} disabled>
                  {plan.cta}
                  <span className="ml-2 text-[10px] opacity-60 font-normal">Soon</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="py-28 px-6 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full space-y-2">
            {FAQ_CONTENT.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="tos-card rounded-xl px-5 data-[state=open]:bg-white/[0.02]">
                <AccordionTrigger className="text-left hover:text-emerald-400 text-sm py-4">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm pb-4 leading-relaxed">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="py-28 px-6 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            {BOTTOM_CTA.headline1} <span className="landing-heading-shimmer">{BOTTOM_CTA.headlineShimmer}</span>
            {BOTTOM_CTA.headline2}
          </h2>
          <p className="text-lg text-muted-foreground mb-10">{BOTTOM_CTA.subtext}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isPublicDemoOnly ? (
              <Link to="/demo">
                <Button className="h-12 px-8 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-base">
                  {BOTTOM_CTA.ctaDemo} <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/auth">
                  <Button className="h-12 px-8 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-base">
                    {BOTTOM_CTA.ctaSignup} <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/demo">
                  <Button variant="outline" className="h-12 px-8 border-white/10 bg-white/5 hover:bg-white/10 text-base">
                    {BOTTOM_CTA.ctaDemo}
                  </Button>
                </Link>
              </>
            )}
          </div>

          <form onSubmit={handleRequestAccess} className="mt-10 flex items-center justify-center gap-2">
            <input
              type="email"
              placeholder={HERO.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-[260px] rounded-md border border-white/10 bg-white/5 px-3 text-sm outline-none"
            />
            <Button type="submit" className="h-11 px-5 bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/25">
              Join Waitlist
            </Button>
          </form>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] py-16 px-6 bg-white/[0.01] backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-12">
            <div>
              <Link to="/home" className="inline-flex mb-4" aria-label="Trading OS home">
                <TradingOsLogo variant="wordmark" decorative imgClassName="h-10 sm:h-11 max-w-[min(100%,320px)]" />
              </Link>
              <p className="text-sm text-muted-foreground max-w-xs">{FOOTER.tagline}</p>
            </div>
            <div className="flex gap-16">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Product</div>
                <div className="space-y-2.5">
                  <a href="#features" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Features
                  </a>
                  <a href="#pricing" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Pricing
                  </a>
                  <Link to="/demo" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Demo
                  </Link>
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Legal</div>
                <div className="space-y-2.5">
                  <InternalLink href="/privacy" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Privacy Policy
                  </InternalLink>
                  <InternalLink href="/terms" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Terms of Service
                  </InternalLink>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {FOOTER.copyright} |{' '}
              <InternalLink href="/privacy" className="underline-offset-2 hover:underline hover:text-foreground">
                Privacy
              </InternalLink>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

