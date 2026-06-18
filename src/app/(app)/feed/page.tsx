import { AxeFeedClient } from "@/components/feed/AxeFeedClient";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";

export default function FeedPage() {
  return (
    <div className="axe-stagger-enter flex flex-col gap-5 pb-2">
      <LiveStatusReporter
        liveCount={1}
        totalCount={1}
        label="AXE Feed"
        allLiveOverride={null}
        severity="fresh"
        reason="What AXE noticed — trades, drafts, risk, and chart actions."
        scope="feed"
      />
      <PageTitleInjector title="AXE Feed" premium />
      <div className="-mt-1 border-l-2 border-cyan-400/35 pl-3.5">
        <p className="text-[13px] leading-relaxed text-tos-text/95">
          Your timeline with AXE — proactive alerts, trade drafts, and session context in one place.
        </p>
      </div>
      <AxeFeedClient />
    </div>
  );
}
