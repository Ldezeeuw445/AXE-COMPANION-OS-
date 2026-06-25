import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { dismissToast, subscribeToToasts, type ToastInput } from '@/hooks/use-toast';

type ToastItem = ToastInput & { id: string; createdAt: number };

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToToasts((next) => setItems(next as ToastItem[]));
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex w-[min(420px,calc(100vw-32px))] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto tos-card rounded-xl px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {t.title ? <div className="text-[12px] font-semibold text-white/85">{t.title}</div> : null}
              {t.description ? <div className="mt-0.5 text-[11px] text-white/45">{t.description}</div> : null}
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-white/35 hover:text-white/70"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

