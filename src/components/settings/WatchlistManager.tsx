"use client";

import { useState, useTransition } from "react";
import { addWatchlistItem, removeWatchlistItem } from "@/app/(app)/settings/actions";

type Item = {
  id: string;
  symbol: string;
  message: string | null;
};

type Props = {
  items: Item[];
};

export function WatchlistManager({ items: initialItems }: Props) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [symbol, setSymbol] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!symbol.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addWatchlistItem(symbol, note);
      if (result.error) {
        setError(result.error);
      } else {
        const newItem: Item = {
          id: crypto.randomUUID(),
          symbol: symbol.trim().toUpperCase(),
          message: note.trim() || null,
        };
        setItems((prev) => [...prev, newItem]);
        setSymbol("");
        setNote("");
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeWatchlistItem(id);
      if (!result.error) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <div>
                <span className="font-mono text-xs font-semibold text-tos-text">
                  {item.symbol}
                </span>
                {item.message && (
                  <span className="ml-2 text-[11px] text-tos-muted">{item.message}</span>
                )}
              </div>
              <button
                onClick={() => handleRemove(item.id)}
                disabled={isPending}
                className="text-[10px] text-tos-dim hover:text-tos-short disabled:opacity-40 transition-colors"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-tos-dim">No pairs added yet. Add them below.</p>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Symbol (e.g. XAUUSD)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-tos-text placeholder:text-tos-dim focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-tos-text placeholder:text-tos-dim focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={isPending || !symbol.trim()}
          className="self-start rounded-md bg-white/10 px-4 py-1.5 text-xs font-medium text-tos-text hover:bg-white/15 disabled:opacity-40 transition-colors"
        >
          {isPending ? "Adding…" : "Add pair"}
        </button>
        {error && <span className="text-xs text-tos-short">{error}</span>}
      </div>
    </div>
  );
}
