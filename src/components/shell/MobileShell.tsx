import type { ReactNode } from "react";
import { AppChrome } from "@/components/shell/AppChrome";

type MobileShellProps = {
  children: ReactNode;
};

export function MobileShell({ children }: MobileShellProps) {
  return <AppChrome>{children}</AppChrome>;
}
