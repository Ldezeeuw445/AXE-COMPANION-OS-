import { GlassPanel } from "@/components/ui/GlassPanel";
import type { UserKnowledgeOverview } from "@/services/userKnowledgeReadService";

type Props = {
  data: UserKnowledgeOverview;
};

function relativeDay(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "never";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * The RAG files AXE keeps about this trader. Shows the actual text, because a
 * counter that says "3 documents" tells you nothing about whether the assistant
 * understood you — and being able to read what it believes is the only way to
 * catch it believing something wrong.
 */
export function CockpitKnowledgeFiles({ data }: Props) {
  return (
    <GlassPanel className="p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
        Memory files · per user
      </p>
      <p className="mt-2 text-sm leading-relaxed text-tos-muted">
        What AXE and AXE Intel have written down about you specifically. Both
        assistants retrieve these before answering, alongside{" "}
        <span className="font-mono text-tos-warm/90">{data.sharedDocCount}</span>{" "}
        shared reference documents everyone gets.
      </p>

      {data.files.length > 0 ? (
        <div className="mt-5 space-y-3">
          {data.files.map((file) => (
            <details
              key={file.slug}
              className="group rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-tos-text">{file.title}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-tos-dim">
                  {file.embeddedCount}/{file.chunkCount} · {relativeDay(file.updatedAt)}
                </span>
              </summary>
              <p className="mt-3 whitespace-pre-wrap border-t border-white/[0.06] pt-3 text-[12px] leading-relaxed text-tos-muted">
                {file.content}
              </p>
            </details>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-[12px] text-tos-muted">
          Nothing written yet. AXE builds these from your closed trades, the
          corrections you make in chat, and the notes it saves — so they appear
          once there is enough of your own material to say something true.
        </p>
      )}
    </GlassPanel>
  );
}
