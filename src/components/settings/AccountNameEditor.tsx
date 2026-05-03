"use client";

import { useState, useTransition } from "react";
import { saveAccountName } from "@/app/(app)/settings/actions";

type Props = {
  initialValue: string;
};

export function AccountNameEditor({ initialValue }: Props) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveAccountName(value.trim());
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. FTMO Challenge #1, Prop Firm Live, Personal MT5"
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-tos-text placeholder:text-tos-dim focus:border-tos-accent-cyan/40 focus:outline-none"
        maxLength={80}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !value.trim()}
          className="rounded-lg bg-tos-accent-cyan/10 px-4 py-1.5 text-xs font-medium text-tos-accent-cyan transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <span className="text-xs text-tos-long">Saved — AXE will reference this account</span>
        ) : null}
        {error ? (
          <span className="text-xs text-tos-risk">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
