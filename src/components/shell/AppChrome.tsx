import type { ReactNode } from "react";
import { AppNavigation } from "@/components/shell/AppNavigation";
import { AppTopBarProvider } from "@/components/shell/AppTopBarContext";
import { ClientBottomNav } from "@/components/shell/ClientBottomNav";
import { ClientSplashOverlay } from "@/components/shell/ClientSplashOverlay";
import { AmbientProvider } from "@/components/ambient/AmbientProvider";
import { SwipeNavProvider } from "@/components/shell/SwipeNavContext";
import { SwipeContentWrapper } from "@/components/shell/SwipeContentWrapper";

/**
 * Shell: top bar + hamburger nav + bottom tab bar + main column.
 *
 * Mobile: `fixed inset-0` flex column. This is the most bulletproof way
 * to fill the viewport on iOS PWA — fixed positioning always uses the
 * actual visual viewport as its containing block, with zero dependency
 * on dvh/svh/lvh timing. The navbar is the last flex child and
 * physically cannot move.
 *
 * Desktop: regular flow with min-h-dvh + row layout.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <AppTopBarProvider>
      <AmbientProvider>
        <SwipeNavProvider>
          <div className="fixed inset-0 z-0 mx-auto flex w-full max-w-6xl flex-col overflow-hidden md:relative md:inset-auto md:z-auto md:min-h-dvh md:flex-row md:overflow-visible">
            <AppNavigation />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pl-[4.25rem]">
              <SwipeContentWrapper>
                <div className="tos-app-content flex min-h-0 flex-1 flex-col px-4 pt-0 md:px-6 md:pt-[max(0.75rem,env(safe-area-inset-top))]">
                  {children}
                </div>
              </SwipeContentWrapper>
            </div>
            {/* Bottom nav: last flex child, always at bottom.
                tos-nav-safe fills the safe-area gap below the navbar
                with the same background — handled in CSS to guarantee
                env() is parsed (inline styles can't always do env()). */}
            <div className="tos-nav-safe shrink-0 md:hidden">
              <ClientBottomNav />
            </div>
          </div>
        </SwipeNavProvider>
      </AmbientProvider>
      <ClientSplashOverlay />
    </AppTopBarProvider>
  );
}
