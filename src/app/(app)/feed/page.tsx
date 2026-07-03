import { Suspense } from "react";
import { AxeFeedClient } from "@/components/feed/AxeFeedClient";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { parseFeedTabParam } from "@/lib/feed/feedTabs";

type FeedPageProps = {
  searchParams: Promise<{ tab?: string }> | { tab?: string };
};

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const params = await searchParams;
  const initialTab = parseFeedTabParam(params.tab);

  return (
    <div className="axe-stagger-enter flex flex-col gap-5 pb-2">
      <LiveStatusReporter
        liveCount={1}
        totalCount={1}
        label="AXE Feed"
        allLiveOverride={null}
        severity="fresh"
        reason="Morning brief, daily news, market recap, and personal AXE activity."
        scope="feed"
      />
      <PageTitleInjector title="AXE Feed" premium />
      <div className="-mt-1 border-l-2 border-cyan-400/35 pl-3.5">
        <p className="axe-body text-tos-text/95">
          Three lanes — your personal morning brief, daily news broadcast, and end-of-day market recap. Last 7 days.
        </p>
      </div>
      <Suspense
        fallback={
          <p className="axe-body text-center text-sm text-tos-muted">Loading AXE feed…</p>
        }
      >
        <AxeFeedClient initialTab={initialTab} />
      </Suspense>
    </div>
  );
}
