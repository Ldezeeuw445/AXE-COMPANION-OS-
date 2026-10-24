"use client";

import type { PointerEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Anchor,
  BarChart3,
  CalendarDays,
  Eye,
  Landmark,
  LineChart,
  Newspaper,
  Plane,
  Radar,
  RefreshCcw,
  Shield,
  Ship,
  Swords,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  LANDING_FEEDS_BAND,
  LANDING_INTEL_FEED_COUNT,
  LANDING_INTEL_FEEDS,
  type LandingFeedIcon,
  type LandingIntelFeed,
} from "@/lib/marketing/landingCopy";

const ICONS: Record<LandingFeedIcon, LucideIcon> = {
  tide: Activity,
  macro: Radar,
  conviction: Zap,
  insider: Eye,
  policy: Landmark,
  darkpool: BarChart3,
  options: TrendingUp,
  jets: Plane,
  radar: Radar,
  emergency: AlertTriangle,
  vessel: Ship,
  energy: Zap,
  chokepoints: Anchor,
  seismic: Swords,
  cyber: Shield,
  correlation: LineChart,
  news: Newspaper,
  calendar: CalendarDays,
  dejavu: RefreshCcw,
};

function setCardPoint(event: PointerEvent<HTMLElement>) {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  el.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

function FeedCard({ feed }: { feed: LandingIntelFeed }) {
  const Icon = ICONS[feed.icon];

  return (
    <article
      className={`axe-launch-feed-card ${feed.span === 2 ? "axe-launch-feed-card--feature" : ""}`}
      onPointerMove={setCardPoint}
    >
      <span className="axe-launch-feed-pill" aria-hidden />
      <div className="axe-launch-feed-icon">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h3>{feed.title}</h3>
      <p>{feed.desc}</p>
    </article>
  );
}

export function LandingIntelFeeds() {
  return (
    <section id="product" className="relative scroll-mt-24">
      <div className="axe-launch-band">
        <p className="axe-launch-eyebrow">{LANDING_FEEDS_BAND.kicker}</p>
        <h2 className="axe-launch-band-title">
          {LANDING_INTEL_FEED_COUNT} {LANDING_FEEDS_BAND.titleLead}
          <br />
          <span className="axe-launch-gradient">{LANDING_FEEDS_BAND.titleAccent}</span>
        </h2>
        <p className="axe-launch-band-copy">{LANDING_FEEDS_BAND.body}</p>
      </div>

      <div className="px-5 py-10 md:py-14">
        <div className="axe-launch-feeds-grid mx-auto max-w-6xl">
          {LANDING_INTEL_FEEDS.map((feed) => (
            <FeedCard key={feed.title} feed={feed} />
          ))}
        </div>
      </div>
    </section>
  );
}
