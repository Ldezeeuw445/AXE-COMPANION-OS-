"use client";

import { useCallback, useState } from "react";
import { SQUAWK_STATIONS } from "@/lib/squawk/streams";
import { tierLabel } from "@/lib/squawk/rotation";
import { normalizeSquawkStationIds, writeSquawkStationIds } from "@/lib/squawk/prefs";

export function SquawkStationPicker({ initialIds }: { initialIds: string[] }) {
  const [selected, setSelected] = useState<string[]>(() => normalizeSquawkStationIds(initialIds));
  const [saving, setSaving] = useState(false);

  const persist = useCallback(async (next: string[]) => {
    const normalized = normalizeSquawkStationIds(next);
    setSelected(normalized);
    writeSquawkStationIds(normalized);
    setSaving(true);
    try {
      await fetch("/api/preferences/squawk-stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationIds: normalized }),
        credentials: "include",
      });
    } catch {
      /* local cache still updated */
    } finally {
      setSaving(false);
    }
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const has = selected.includes(id);
      if (has && selected.length <= 1) return;
      const next = has ? selected.filter((s) => s !== id) : [...selected, id];
      void persist(next);
    },
    [persist, selected],
  );

  return (
    <div className="flex flex-col gap-2">
      {SQUAWK_STATIONS.map((station) => {
        const on = selected.includes(station.id);
        return (
          <button
            key={station.id}
            type="button"
            onClick={() => toggle(station.id)}
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
              on
                ? "border-cyan-400/40 bg-cyan-400/[0.08]"
                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
            }`}
            aria-pressed={on}
          >
            <div className="min-w-0">
              <p className={`text-xs font-semibold ${on ? "text-cyan-100" : "text-white/80"}`}>
                {station.name}
              </p>
              <p className="text-[10px] text-white/40">
                {station.tag}
                <span className="text-white/25"> · {tierLabel(station.tier)}</span>
              </p>
            </div>
            <span
              className={`ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${
                on ? "border-cyan-400/50 bg-cyan-400/20 text-cyan-200" : "border-white/15 text-transparent"
              }`}
              aria-hidden
            >
              ✓
            </span>
          </button>
        );
      })}
      <p className="text-[10px] text-tos-dim">
        {saving
          ? "Saving…"
          : "10 channels · Core (always-on), Session (US/EU hours), Context (macro). Pick which rotate on chart squawk."}
      </p>
    </div>
  );
}
