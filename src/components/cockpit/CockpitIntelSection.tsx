import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { CockpitGenerateButton } from "@/components/cockpit/CockpitGenerateButton";
import { CockpitIntelVaultSave } from "@/components/cockpit/CockpitIntelVaultSave";
import { getIntelThreadSummary } from "@/services/chatService";

export async function CockpitIntelSection({ userId }: { userId: string }) {
  const intel = await getIntelThreadSummary(userId);

  return (
    <GlassPanel className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
            AXE Intelligence
          </p>
          <p className="mt-1 text-sm leading-relaxed text-tos-muted">
            Intel chat shares the same memory and learning arc as AXE — correlations, smart money, and alt-data in one thread.
          </p>
        </div>
        <Link
          href="/chat?intel=1"
          className="shrink-0 rounded-lg border border-[#00d4f5]/25 bg-[#00d4f5]/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#00d4f5]"
        >
          Open intel chat
        </Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-tos-dim">Messages</p>
          <p className="mt-0.5 text-lg font-semibold text-tos-text">{intel.messageCount}</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-tos-dim">Last activity</p>
          <p className="mt-0.5 text-sm text-tos-text">
            {intel.lastMessageAt
              ? new Date(intel.lastMessageAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "No intel chat yet"}
          </p>
        </div>
      </div>

      {intel.lastPreview ? (
        <>
          <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-tos-muted">
            {intel.lastPreview}
          </p>
          <CockpitIntelVaultSave content={intel.lastPreview} title="Latest AXE Intel reply" />
        </>
      ) : null}

      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <CockpitGenerateButton
          label="Generate intel snapshot"
          snapshotType="intel"
        />
      </div>
    </GlassPanel>
  );
}
