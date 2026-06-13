import type { ReactNode } from "react";
import { AppNavigation } from "@/components/shell/AppNavigation";
import { AppTopBarProvider } from "@/components/shell/AppTopBarContext";
import { ClientBottomNav } from "@/components/shell/ClientBottomNav";

/** Shell: side navigation + main column (no bottom tab bar). */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <AppTopBarProvider>
      <div className="relative mx-auto flex min-h-svh w-full max-w-6xl flex-col md:flex-row">
        <AppNavigation />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pl-[4.25rem]">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-0 md:px-6 md:pb-[max(1rem,env(safe-area-inset-bottom))] md:pt-[max(0.75rem,env(safe-area-inset-top))]">
            {children}
          </div>
        </div>
        <ClientBottomNav />
      </div>
    </AppTopBarProvider>
  );
}
