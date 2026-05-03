import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { MarketingStatusBar } from "@/components/marketing/MarketingStatusBar";
import { marketingVault } from "@/services/mock/marketingVisualData";
import { FileText, ImageIcon } from "lucide-react";

export function MarketingVaultScreen() {
  const v = marketingVault;
  return (
    <div className="flex h-[780px] flex-col bg-tos-bg">
      <MarketingStatusBar />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6">
        <header className="pt-1">
          <h2 className="text-base font-bold tracking-tight text-tos-text">
            Vault
          </h2>
          <p className="text-[11px] text-tos-muted">Notes · screenshots · voice</p>
        </header>

        <div className="rounded-xl border border-tos-border bg-tos-elevated/60 px-3 py-2 text-[12px] text-tos-dim">
          Search 5984, VAH, CPI…
        </div>

        <div className="flex gap-2">
          {(["All", "Notes", "Images", "Voice"] as const).map((t, i) => (
            <span
              key={t}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                i === 0
                  ? "border-tos-warm/35 bg-tos-warm-soft/25 text-tos-warm"
                  : "border-tos-border text-tos-dim"
              }`}
            >
              {t}
            </span>
          ))}
        </div>

        <section>
          <p className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
            Notes
          </p>
          <div className="mt-2 space-y-2.5">
            {v.notes.map((n, i) => (
              <GlassPanel key={i} className="p-3.5">
                <div className="flex gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-tos-warm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13px] font-medium text-tos-text">{n.title}</h3>
                      <Badge variant="neutral">{n.symbol}</Badge>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-tos-muted">{n.body}</p>
                    <span className="mt-2 inline-block rounded-md bg-white/5 px-2 py-0.5 text-[9px] text-tos-dim">
                      #{n.tag}
                    </span>
                  </div>
                </div>
              </GlassPanel>
            ))}
          </div>
        </section>

        <section className="flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
            Screenshots
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {v.screenshots.map((s, i) => (
              <GlassPanel key={i} className="overflow-hidden p-0">
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.07] to-black/40">
                  <ImageIcon className="h-7 w-7 text-tos-dim" />
                  <p className="px-2 text-center text-[9px] font-medium leading-tight text-tos-muted">
                    {s.label}
                  </p>
                </div>
                <div className="border-t border-tos-border px-2 py-1.5">
                  <span className="font-mono text-[10px] text-tos-warm">{s.symbol}</span>
                </div>
              </GlassPanel>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
