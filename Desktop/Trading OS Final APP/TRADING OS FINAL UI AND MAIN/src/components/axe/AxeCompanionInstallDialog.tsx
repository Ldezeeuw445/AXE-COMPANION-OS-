import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Shows a QR to open the Next.js Companion app (chat shell) when
 * `VITE_AXE_COMPANION_URL` is set. Trigger from "Get AXE Companion" — not inline on the page.
 */
export function AxeCompanionInstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const url = import.meta.env.VITE_AXE_COMPANION_URL?.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-white/10 bg-[#0d0d10] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Get AXE Companion on your phone</DialogTitle>
          <DialogDescription className="text-white/55">
            Scan with your phone camera. Use the same Supabase account as this site after you open the link — one memory
            and journal spine; Trading OS is our upcoming premium terminal on the same stack.
          </DialogDescription>
        </DialogHeader>
        {url ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`}
                alt="QR code to open AXE Companion"
                width={220}
                height={220}
                className="rounded-lg"
              />
            </div>
            <p className="max-w-full break-all text-center text-[11px] font-mono text-white/45">{url}</p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-white/60">
            Set{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">VITE_AXE_COMPANION_URL</code> in{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">.env.axe</code> to your public Companion URL
            (the Next.js app, usually ending in <code className="rounded bg-white/10 px-1">/chat</code>). Rebuild or
            restart dev. On your LAN, you can use{' '}
            <code className="rounded bg-white/10 px-1 text-xs">http://&lt;your-ip&gt;:5001/chat</code> for testing.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
