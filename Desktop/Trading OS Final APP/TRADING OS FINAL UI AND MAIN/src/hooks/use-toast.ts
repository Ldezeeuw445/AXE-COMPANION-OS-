export type ToastInput = {
  title?: string;
  description?: string;
  durationMs?: number;
};

type ToastItem = ToastInput & {
  id: string;
  createdAt: number;
};

const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];

function emit() {
  for (const cb of listeners) cb(items);
}

export function subscribeToToasts(cb: (items: ToastItem[]) => void) {
  listeners.add(cb);
  cb(items);
  return () => {
    listeners.delete(cb);
  };
}

export function dismissToast(id: string) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function toast(input: ToastInput) {
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const t: ToastItem = { id, createdAt: Date.now(), ...input };
  items = [t, ...items].slice(0, 5);
  emit();

  const duration = Math.max(800, input.durationMs ?? 3200);
  window.setTimeout(() => dismissToast(id), duration);
}


