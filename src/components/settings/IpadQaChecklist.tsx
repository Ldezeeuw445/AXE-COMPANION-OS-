"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

const QA_ITEMS = [
  { id: "chart-portrait", label: "Chart portrait: controls readable, no overlap" },
  { id: "chart-landscape", label: "Chart landscape: immersive mode clean + no cutoffs" },
  { id: "sltp-drag", label: "SL/TP drag works with tap → handle on tablet touch" },
  { id: "pending-sheet", label: "Pending order sheet/buttons are easy to tap" },
  { id: "drawers", label: "Orderbook/news drawers open/close without layout jumps" },
  { id: "modals", label: "Trade modals fit iPad and remain legible" },
  { id: "keyboard", label: "Price inputs with keyboard do not break layout" },
  { id: "live-ws", label: "WS remains stable for at least 5 minutes" },
] as const;

const STORAGE_KEY = "axe.ipad.qa.checklist.v1";

export function IpadQaChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setChecked(parsed);
    } catch {
      // ignore invalid local cache
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    } catch {
      // best effort
    }
  }, [checked]);

  const completed = useMemo(
    () => QA_ITEMS.filter((item) => checked[item.id]).length,
    [checked],
  );

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0c0d0e]/90 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
            iPad QA checklist
          </h2>
          <p className="mt-1 text-xs text-tos-muted">
            Mark each test on a real iPad/tablet before launch day.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setChecked({})}
          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/70 hover:bg-white/[0.08]"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </header>

      <p className="mt-2 text-[11px] text-white/80">
        Progress: <span className="font-semibold">{completed}/{QA_ITEMS.length}</span>
      </p>

      <ul className="mt-3 space-y-2">
        {QA_ITEMS.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={Boolean(checked[item.id])}
                onChange={(e) =>
                  setChecked((prev) => ({
                    ...prev,
                    [item.id]: e.target.checked,
                  }))
                }
                className="rounded border-white/20"
              />
              <span className="text-[12px] text-white/90">{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

