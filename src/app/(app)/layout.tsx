import { MobileShell } from "@/components/shell/MobileShell";
import { SplashOverlay } from "@/components/shell/SplashOverlay";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SplashOverlay />
      <MobileShell>{children}</MobileShell>
    </>
  );
}
