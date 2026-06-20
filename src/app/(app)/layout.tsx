import { Suspense } from "react";
import { MobileShell } from "@/components/shell/MobileShell";
import { EmbedDemoFlags } from "@/components/shell/EmbedDemoFlags";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <EmbedDemoFlags />
      </Suspense>
      <MobileShell>{children}</MobileShell>
    </>
  );
}
