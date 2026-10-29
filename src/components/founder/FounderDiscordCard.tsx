"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";

export function FounderDiscordCard({
  inviteUrl,
  visible,
}: {
  inviteUrl: string | null;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <GlassPanel className="p-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-tos-dim">
        Founder Discord
      </h3>
      {inviteUrl ? (
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="tos-btn-cyan mt-3 inline-flex w-full items-center justify-center rounded-xl py-2.5 text-xs font-semibold"
        >
          Join Founder Discord
        </a>
      ) : (
        <p className="mt-2 text-xs text-tos-muted">Invite komt — Discord server wordt nog opgezet.</p>
      )}
    </GlassPanel>
  );
}
