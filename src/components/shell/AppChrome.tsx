import type { ReactNode } from "react";
import { AppNavigation } from "@/components/shell/AppNavigation";

/** Shell: side navigation + main column (no bottom tab bar). */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:flex-row">
      <AppNavigation />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pl-[4.25rem]">
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-0 md:px-6 md:pt-[max(0.75rem,env(safe-area-inset-top))]">
          {children}
        </div>
      </div>
    </div>
  );
}
