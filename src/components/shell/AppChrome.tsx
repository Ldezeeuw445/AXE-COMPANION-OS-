import type { ReactNode } from "react";
import { AppNavigation } from "@/components/shell/AppNavigation";
import { AppTopBarProvider } from "@/components/shell/AppTopBarContext";
import { ClientBottomNav } from "@/components/shell/ClientBottomNav";

/** Shell: top bar + hamburger nav + bottom tab bar + main column. */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <AppTopBarProvider>
      <div className="tos-ambient-glow relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:flex-row">
        <AppNavigation />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pl-[4.25rem]">
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(5rem,calc(4rem+env(safe-area-inset-bottom)))] pt-0 md:px-6 md:pb-[max(1rem,env(safe-area-inset-bottom))] md:pt-[max(0.75rem,env(safe-area-inset-top))]">
            {children}
          </div>
        </div>
        {/* Bottom nav: only on mobile, hidden on chart/chat */}
        <div className="md:hidden">
          <ClientBottomNav />
        </div>
      </div>
    </AppTopBarProvider>
  );
}
