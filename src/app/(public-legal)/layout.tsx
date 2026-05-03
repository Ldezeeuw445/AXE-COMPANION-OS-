import { LegalPagesShell } from "@/components/legal/LegalPagesShell";

export default function PublicLegalLayout({ children }: { children: React.ReactNode }) {
  return <LegalPagesShell>{children}</LegalPagesShell>;
}
