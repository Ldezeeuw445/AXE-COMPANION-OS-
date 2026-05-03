import { Cpu } from 'lucide-react';

/**
 * Big Mac Index — embeds the standalone “Big Mac Index Explorer”
 * from `public/big-mac-index-explorer/` (d3 + world map + Economist data).
 */
export default function BigMacIndex() {
  const src = `${import.meta.env.BASE_URL}big-mac-index-explorer/index.html`;

  return (
    <div className="flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0a0a]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-3">
          <Cpu size={14} className="text-cyan-400" aria-hidden />
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">BIGMAC INDEX</span>
        </div>
      </div>
      <iframe
        title="Big Mac Index Explorer"
        src={src}
        className="min-h-0 w-full flex-1 border-0 bg-[#0a0a0a]"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}
