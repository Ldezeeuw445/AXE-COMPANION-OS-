"use client";

import { useCallback, useState } from "react";
import {
  PUSH_CATEGORIES,
  PUSH_CATEGORY_HINTS,
  PUSH_CATEGORY_LABELS,
  type PushCategory,
} from "@/lib/push/categories";
import { isValidClock, type PushNotificationPrefs } from "@/lib/push/prefs";

export function PushNotificationPrefsPanel({ initial }: { initial: PushNotificationPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback(async (next: PushNotificationPrefs) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/preferences/push-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(next),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }, []);

  const toggleCategory = (category: PushCategory) => {
    const next = {
      ...prefs,
      categories: { ...prefs.categories, [category]: !prefs.categories[category] },
    };
    setPrefs(next);
    void persist(next);
  };

  const updateQuiet = (patch: Partial<PushNotificationPrefs["quietHours"]>) => {
    const quietHours = { ...prefs.quietHours, ...patch };
    if (patch.start && !isValidClock(patch.start)) return;
    if (patch.end && !isValidClock(patch.end)) return;
    const next = { ...prefs, quietHours };
    setPrefs(next);
    void persist(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
        Categories · opt in
      </p>
      <ul className="space-y-2">
        {PUSH_CATEGORIES.map((category) => (
          <li key={category} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-tos-text">{PUSH_CATEGORY_LABELS[category]}</p>
              <p className="mt-0.5 text-[10px] text-tos-muted">{PUSH_CATEGORY_HINTS[category]}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.categories[category]}
              onClick={() => toggleCategory(category)}
              className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                prefs.categories[category]
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 text-tos-dim"
              }`}
            >
              {prefs.categories[category] ? "On" : "Off"}
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-white/[0.06] pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-tos-text">Quiet hours</p>
            <p className="mt-0.5 text-[10px] text-tos-muted">
              No lock-screen pushes in this window. Deep links still work when you open the app.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.quietHours.enabled}
            onClick={() => updateQuiet({ enabled: !prefs.quietHours.enabled })}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              prefs.quietHours.enabled
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-white/10 text-tos-dim"
            }`}
          >
            {prefs.quietHours.enabled ? "On" : "Off"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-tos-muted">
          <label className="flex items-center gap-1">
            From
            <input
              type="time"
              value={prefs.quietHours.start}
              onChange={(e) => updateQuiet({ start: e.target.value })}
              className="rounded border border-white/10 bg-transparent px-1.5 py-1 text-tos-text"
            />
          </label>
          <label className="flex items-center gap-1">
            to
            <input
              type="time"
              value={prefs.quietHours.end}
              onChange={(e) => updateQuiet({ end: e.target.value })}
              className="rounded border border-white/10 bg-transparent px-1.5 py-1 text-tos-text"
            />
          </label>
          <span className="text-[10px] text-tos-dim">{prefs.quietHours.timezone}</span>
        </div>
      </div>

      <p className="text-[10px] text-tos-dim">
        {saving ? "Saving…" : saved ? "Saved." : error ? error : "\u00a0"}
      </p>
    </div>
  );
}
