import { MobileShell } from "@/components/shell/MobileShell";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MobileShell>{children}</MobileShell>;
}
