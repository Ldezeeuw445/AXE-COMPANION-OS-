import type { ReactNode } from "react";
import { ClientBottomNav } from "@/components/shell/ClientBottomNav";

type MobileShellProps = {
  children: ReactNode;
};

export function MobileShell({ children }: MobileShellProps) {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <div className="flex flex-1 flex-col px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
        {children}
      </div>
      <ClientBottomNav />
    </div>
  );
}
