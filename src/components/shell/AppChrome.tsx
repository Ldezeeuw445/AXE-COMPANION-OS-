"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppNavigation } from "@/components/shell/AppNavigation";
import { AppTopBarProvider } from "@/components/shell/AppTopBarContext";
import { ClientBottomNav } from "@/components/shell/ClientBottomNav";
import { ClientSplashOverlay } from "@/components/shell/ClientSplashOverlay";
import { AmbientProvider } from "@/components/ambient/AmbientProvider";
import { SwipeNavProvider } from "@/components/shell/SwipeNavContext";
import { SwipeContentWrapper } from "@/components/shell/SwipeContentWrapper";
import { ContentShell } from "@/components/shell/ContentShell";
import { RouteBodyFlags } from "@/components/shell/RouteBodyFlags";
import { TabletShellEffects } from "@/components/shell/TabletShellEffects";
import { TabletNavCollapseProvider } from "@/components/shell/TabletNavCollapse";
import { Toaster } from "@/components/ui/sonner";
import { AppComplianceStrip } from "@/components/legal/AppComplianceStrip";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { tabFromPathname } from "@/lib/session/activeSession";
import { useActiveSession } from "@/lib/session/activeSessionStore";
import { useShellViewport } from "@/lib/viewport/shellViewport";

/**
 * Shell: top bar + hamburger nav + bottom tab bar + main column.
 *
 * Route + viewport classes are applied during render (pathname is known on
 * the server) so the first paint matches the post-navigation layout.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useActiveSession();
  const viewport = useShellViewport();
  const isChart = pathname === "/chart" || pathname.startsWith("/chart/");
  const isChat = pathname === "/chat" || pathname.startsWith("/chat/");
  const tab = tabFromPathname(pathname) ?? session.lastTab;

  return (
    <AppTopBarProvider>
      <TabletNavCollapseProvider>
      <RouteBodyFlags />
      <TabletShellEffects />
      <AmbientProvider>
        <SwipeNavProvider>
          <div
            data-testid="mobile-shell"
            data-shell-tab={tab}
            data-shell-viewport={viewport}
            data-shell-symbol={session.symbol}
            data-shell-tf={session.timeframe}
            data-shell-account-type={session.accountType}
            data-shell-account-id={session.accountId ?? ""}
            className={`relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col [touch-action:pan-y] tos-shell-desktop-layout ${
              isChart ? "tos-route-chart" : ""
            } ${isChat ? "tos-route-chat" : ""} ${
              viewport === "tablet" ? "tos-tablet-device" : ""
            } ${viewport === "desktop" ? "tos-shell-mouse-desktop" : ""}`}
          >
            <AppNavigation />
            <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col">
              <SwipeContentWrapper>
                <ContentShell>{children}</ContentShell>
              </SwipeContentWrapper>
            </div>
            <ClientBottomNav />
            <AppComplianceStrip />
          </div>
        </SwipeNavProvider>
      </AmbientProvider>
      <ClientSplashOverlay />
      <OnboardingGate />
      <Toaster />
      </TabletNavCollapseProvider>
    </AppTopBarProvider>
  );
}
