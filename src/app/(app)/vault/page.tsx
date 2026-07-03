import { Suspense } from "react";
import { VaultClient } from "@/components/vault/VaultClient";
import { listVaultMedia, listVaultNotes } from "@/services/vaultService";
import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";

export default async function VaultPage() {
  const [notes, media] = await Promise.all([
    listVaultNotes(),
    listVaultMedia(),
  ]);

  const toolbarSections: AxeToolbarSection[] = [
    {
      id: "ask-axe",
      title: "Ask AXE",
      items: [
        {
          id: "summarize",
          label: "Summarize my latest notes",
          description: "Turn Vault into a short brief",
          href: `/chat?q=${encodeURIComponent(
            "[AXE · vault]\nSummarize my recent Vault notes into a short actionable brief. If you can’t see them directly, tell me what to paste.",
          )}`,
        },
        {
          id: "intel-tab",
          label: "What did I save from Intel?",
          description: "Correlations and intel signals",
          href: `/chat?intel=1&q=${encodeURIComponent(
            "[AXE Intel · vault]\nSummarize my saved intel notes and highlight the strongest signals.",
          )}`,
        },
        {
          id: "axe-tab",
          label: "What did I save from AXE?",
          description: "Find insights worth reusing",
          href: `/chat?q=${encodeURIComponent(
            "[AXE · vault]\nHelp me review what I've saved from AXE and extract 5 reusable rules/checklists.",
          )}`,
        },
      ],
    },
    {
      id: "shortcuts",
      title: "Shortcuts",
      items: [
        { id: "chat", label: "Chat", description: "Ask AXE", href: "/chat" },
        { id: "journal", label: "Journal", description: "Tag trades + notes", href: "/journal" },
      ],
    },
  ];

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col overflow-y-auto">
      <LiveStatusReporter
        liveCount={0}
        totalCount={0}
        label={`Vault · ${notes.length} notes · ${media.length} media`}
        allLiveOverride={null}
      />
      <AxeTopBarInjector title="Vault" subtitle="Notes & media" sections={toolbarSections} center={<span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Vault</span>} />
      <Suspense fallback={null}>
        <VaultClient notes={notes} media={media} />
      </Suspense>
    </div>
  );
}
