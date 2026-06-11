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
 * Layout: h-dvh flex column. The navbar is a regular flex child at the
 * bottom — NOT position:fixed. Content fills the remaining space and
 * handles its own scrolling. This is the only architecture that keeps
 * the navbar rock-solid on iOS PWA across cold starts, page transitions,
 * and keyboard events.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <AppTopBarProvider>
      <AmbientProvider>
        <SwipeNavProvider>
          <div className="relative mx-auto flex h-dvh w-full max-w-6xl flex-col overflow-hidden md:min-h-dvh md:flex-row md:overflow-visible">
            <AppNavigation />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pl-[4.25rem]">
              <SwipeContentWrapper>
                <div className="tos-app-content flex min-h-0 flex-1 flex-col px-4 pt-0 md:px-6 md:pt-[max(0.75rem,env(safe-area-inset-top))]">
                  {children}
                </div>
              </SwipeContentWrapper>
            </div>
            {/* Bottom nav: regular flex child, always at bottom */}
            <div className="shrink-0 md:hidden">
              <ClientBottomNav />
            </div>
          </div>
        </SwipeNavProvider>
      </AmbientProvider>
      <ClientSplashOverlay />
    </AppTopBarProvider>
  );
}
