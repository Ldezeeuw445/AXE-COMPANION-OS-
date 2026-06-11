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
 * The navbar is `position: fixed; bottom: 0` via CSS (.tos-nav-pill).
 * Content scrolls naturally in the body and clears the navbar via
 * padding-bottom on .tos-app-content.
 *
 * This is the simplest possible architecture — no viewport height
 * hacks, no overflow:hidden shell, no JS positioning. Content scrolls
 * normally. Navbar stays put.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <AppTopBarProvider>
      <AmbientProvider>
        <SwipeNavProvider>
          <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:flex-row">
            <AppNavigation />
            <div className="flex min-w-0 flex-1 flex-col md:pl-[4.25rem]">
              <SwipeContentWrapper>
                <div className="tos-app-content flex min-h-0 flex-1 flex-col px-4 pt-0 md:px-6 md:pt-[max(0.75rem,env(safe-area-inset-top))]">
                  {children}
                </div>
              </SwipeContentWrapper>
            </div>
            {/* Navbar: position:fixed via CSS, lives here for React tree */}
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
