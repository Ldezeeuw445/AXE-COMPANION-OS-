import type { ReactNode } from "react";
import { AppNavigation } from "@/components/shell/AppNavigation";
import { AppTopBarProvider } from "@/components/shell/AppTopBarContext";
import { ClientBottomNav } from "@/components/shell/ClientBottomNav";
import { ClientSplashOverlay } from "@/components/shell/ClientSplashOverlay";
import { AmbientProvider } from "@/components/ambient/AmbientProvider";
import { SwipeNavProvider } from "@/components/shell/SwipeNavContext";
import { SwipeContentWrapper } from "@/components/shell/SwipeContentWrapper";
import { ContentShell } from "@/components/shell/ContentShell";

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
          <div className="relative mx-auto flex min-h-svh w-full max-w-6xl flex-col overflow-x-hidden overscroll-none [touch-action:pan-y] md:flex-row">
            <AppNavigation />
            <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden md:pl-[4.25rem]">
              <SwipeContentWrapper>
                <ContentShell>{children}</ContentShell>
              </SwipeContentWrapper>
            </div>
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
