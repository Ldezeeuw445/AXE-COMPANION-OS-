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
 * AmbientProvider owns the particle canvas + sound-fx context.
 * The canvas renders at z-0 behind everything; pointer-events:none.
 *
 * SwipeNavProvider connects the content swipe gestures to the
 * navbar glass bubble indicator.
 *
 * Bottom padding uses a CSS custom property so full-screen pages (chat,
 * chart) can override it to just the safe-area inset instead of the full
 * nav-bar clearance.  See `tos-fullscreen-page` in globals.css.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <AppTopBarProvider>
      <AmbientProvider>
        <SwipeNavProvider>
          <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:flex-row">
            <AppNavigation />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pl-[4.25rem]">
              <SwipeContentWrapper>
                <div className="tos-app-content flex min-h-0 flex-1 flex-col px-4 pt-0 md:px-6 md:pt-[max(0.75rem,env(safe-area-inset-top))]">
                  {children}
                </div>
              </SwipeContentWrapper>
            </div>
            {/* Bottom nav: only on mobile, hidden on chart/chat */}
            <div className="md:hidden">
              <ClientBottomNav />
            </div>
          </div>
        </SwipeNavProvider>
      </AmbientProvider>
      <ClientSplashOverlay />
    </AppTopBarProvider>
  );
}
