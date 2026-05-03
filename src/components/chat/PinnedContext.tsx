import { GlassPanel } from "@/components/ui/GlassPanel";

type PinnedContextProps = {
  text: string;
};

export function PinnedContext({ text }: PinnedContextProps) {
  return (
    <GlassPanel glow="warm" className="relative mb-4 px-3 py-3">
      <div className="flex gap-3">
        <div
          className="w-1 shrink-0 self-stretch rounded-full bg-gradient-to-b from-tos-gold/90 via-tos-warm/50 to-tos-warm/10"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-widest text-tos-muted">
            <span className="text-tos-gold/95">Pinned</span>
            <span className="text-tos-dim"> · context</span>
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-tos-text/90">{text}</p>
        </div>
      </div>
    </GlassPanel>
  );
}
