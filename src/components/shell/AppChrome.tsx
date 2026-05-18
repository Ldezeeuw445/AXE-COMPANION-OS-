import type { ReactNode } from "react";
import { AppNavigation } from "@/components/shell/AppNavigation";
import { AppTopBarProvider } from "@/components/shell/AppTopBarContext";

/** Shell: fixed mobile-app viewport + side navigation on desktop. */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <AppTopBarProvider>
      <div className="relative flex h-dvh w-screen max-w-full flex-col overflow-hidden md:flex-row">
        <AppNavigation />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:pl-[4.25rem]">
          <main className="tos-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-0 overscroll-contain sm:px-4 md:px-6 md:pt-[max(0.75rem,env(safe-area-inset-top))]">
            {children}
          </main>
        </div>
      </div>
    </AppTopBarProvider>
  );
}
