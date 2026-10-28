"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, ExternalLink } from "lucide-react";
import { ChartThemeSelector } from "@/components/settings/ChartThemeSelector";
import { SquawkStationPicker } from "@/components/settings/SquawkStationPicker";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/utils";
import { readSquawkStationIds } from "@/lib/squawk/prefs";
import {
  describeSetupGaps,
  type SetupFacts,
} from "@/lib/onboarding/setupState";

const TIMEFRAMES = [
  { id: "m15", label: "15m" },
  { id: "m30", label: "30m" },
  { id: "h1", label: "1H" },
  { id: "h4", label: "4H" },
  { id: "d1", label: "Daily" },
] as const;

type Step = "welcome" | "pairs" | "terminal" | "risk" | "connect" | "done";

export function SmartOnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState("h1");
  const [squawkIds, setSquawkIds] = useState<string[]>([]);
  const [defaultRisk, setDefaultRisk] = useState(1);
  const [maxRisk, setMaxRisk] = useState(5);
  /**
   * What the account still lacks. Null until the first fetch answers, so the
   * last step never flashes "all set" at someone who has nothing connected.
   */
  const [setup, setSetup] = useState<SetupFacts | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/onboarding", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        suggestedSymbols?: string[];
        setup?: SetupFacts;
        prefs?: { squawkStationIds?: string[]; timeframe?: string; defaultRiskPercent?: number; maxAccountRiskPercent?: number };
      };
      if (json.setup) setSetup(json.setup);
      const list = json.suggestedSymbols ?? [];
      setSuggested(list);
      setSymbols(list.slice(0, 4));
      setSquawkIds(json.prefs?.squawkStationIds ?? []);
      setTimeframe(json.prefs?.timeframe ?? "h1");
      setDefaultRisk(json.prefs?.defaultRiskPercent ?? 1);
      setMaxRisk(json.prefs?.maxAccountRiskPercent ?? 5);
    })();
  }, []);

  const toggleSymbol = (sym: string) => {
    setSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : prev.length < 12 ? [...prev, sym] : prev,
    );
  };

  const finish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const themeRes = await fetch("/api/preferences/chart-theme", { credentials: "include" });
      const themeJson = themeRes.ok ? ((await themeRes.json()) as { theme?: string }) : {};
      const stationIds = readSquawkStationIds() ?? squawkIds;
      const res = await fetch("/api/onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          chartTheme: themeJson.theme ?? "midnight",
          timeframe,
          squawkStationIds: stationIds,
          defaultRiskPercent: defaultRisk,
          maxAccountRiskPercent: maxRisk,
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "Could not save onboarding");
      }
      router.replace("/chart");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [symbols, timeframe, squawkIds, defaultRisk, maxRisk, router]);

  /**
   * Nothing is claimed until the facts are in.
   *
   * `setup` stays null while the fetch is in flight or if it failed, and the
   * step renders a "checking" line for that case rather than falling through
   * to the empty-gaps branch — telling someone with no broker connected that
   * they are all set is the one answer that must never appear here.
   */
  const gaps = setup ? describeSetupGaps(setup) : [];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pb-8">
      <div className="space-y-1">
        <p className="axe-label text-cyan-400/90">Smart onboarding</p>
        <h1 className="text-xl font-semibold tracking-tight text-tos-text">Set up your terminal</h1>
        <p className="axe-body text-tos-muted">
          Choose pairs, timeframe, chart theme, squawk channels, and risk defaults — always editable in Settings.
        </p>
      </div>

      {step === "welcome" ? (
        <GlassPanel className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-tos-text">
            AXE Companion learns your style over time. This wizard seeds your watchlist and terminal so you enter with context on day one.
          </p>
          <button
            type="button"
            onClick={() => setStep("pairs")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500/20 py-3 text-sm font-semibold text-cyan-200"
          >
            Get started <ChevronRight className="h-4 w-4" />
          </button>
        </GlassPanel>
      ) : null}

      {step === "pairs" ? (
        <GlassPanel className="space-y-4 p-5">
          <p className="text-sm font-medium text-tos-text">Your pairs</p>
          <div className="flex flex-wrap gap-2">
            {suggested.map((sym) => {
              const on = symbols.includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggleSymbol(sym)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    on
                      ? "border-tos-gold/50 bg-tos-gold/10 text-tos-gold"
                      : "border-white/10 text-tos-muted hover:border-white/20",
                  )}
                >
                  {sym}
                </button>
              );
            })}
          </div>
          <StepNav onBack={() => setStep("welcome")} onNext={() => setStep("terminal")} nextDisabled={symbols.length === 0} />
        </GlassPanel>
      ) : null}

      {step === "terminal" ? (
        <GlassPanel className="space-y-5 p-5">
          <div>
            <p className="mb-2 text-sm font-medium text-tos-text">Default timeframe</p>
            <div className="flex flex-wrap gap-2">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => setTimeframe(tf.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                    timeframe === tf.id
                      ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                      : "border-white/10 text-tos-muted",
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-tos-text">Chart theme</p>
            <ChartThemeSelector />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-tos-text">Squawk channels</p>
            <SquawkStationPicker initialIds={squawkIds} />
          </div>
          <StepNav onBack={() => setStep("pairs")} onNext={() => setStep("risk")} />
        </GlassPanel>
      ) : null}

      {step === "risk" ? (
        <GlassPanel className="space-y-5 p-5">
          <div>
            <p className="text-sm font-medium text-tos-text">Risk per trade</p>
            <p className="axe-body mt-1">Default sizing guardrail — shown live on chart.</p>
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.25}
              value={defaultRisk}
              onChange={(e) => setDefaultRisk(Number(e.target.value))}
              className="mt-3 w-full"
            />
            <p className="mt-1 text-sm text-cyan-300">{defaultRisk.toFixed(2)}% per trade</p>
          </div>
          <div>
            <p className="text-sm font-medium text-tos-text">Max open-book risk</p>
            <p className="axe-body mt-1">Funded-account style cap — if all SLs hit.</p>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={maxRisk}
              onChange={(e) => setMaxRisk(Number(e.target.value))}
              className="mt-3 w-full"
            />
            <p className="mt-1 text-sm text-amber-300">{maxRisk.toFixed(1)}% max exposure</p>
          </div>
          <StepNav
            onBack={() => setStep("terminal")}
            onNext={() => setStep("connect")}
            nextLabel="Next"
          />
        </GlassPanel>
      ) : null}

      {step === "connect" ? (
        <GlassPanel className="space-y-5 p-5">
          {setup === null ? (
            <div>
              <p className="text-sm font-medium text-tos-text">Checking your account…</p>
              <p className="axe-body mt-1">
                One moment — reading which plan you are on and whether a broker is connected.
              </p>
            </div>
          ) : gaps.length === 0 ? (
            <div>
              <p className="text-sm font-medium text-tos-text">You are set up</p>
              <p className="axe-body mt-1">
                An account is connected and your plan is active. Your preferences are saved when you
                enter the terminal.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-tos-text">Two more things, both optional</p>
                <p className="axe-body mt-1">
                  You can enter the terminal right now and do these later from Settings — but this
                  is what is still missing, and what it means.
                </p>
              </div>

              {gaps.map((gap) => (
                <div
                  key={gap.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"
                >
                  <p className="text-[13px] font-semibold text-tos-text">{gap.title}</p>
                  <p className="axe-body mt-1.5 leading-relaxed">{gap.consequence}</p>
                  <a
                    href={gap.href}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-cyan-300/[0.06] px-3.5 py-1.5 text-xs font-semibold text-cyan-100/90 transition hover:border-cyan-300/45"
                  >
                    {gap.cta}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </div>
              ))}
            </>
          )}

          <StepNav
            onBack={() => setStep("risk")}
            onNext={() => void finish()}
            nextLabel={saving ? "Saving…" : "Enter terminal"}
            nextDisabled={saving}
          />
          {error ? <p className="text-sm text-tos-risk">{error}</p> : null}
        </GlassPanel>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void fetch("/api/onboarding", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbols: suggested.slice(0, 4), timeframe: "h1" }),
          }).finally(() => router.replace("/chart"));
        }}
        className="text-center text-[11px] text-tos-dim underline-offset-2 hover:text-tos-muted hover:underline"
      >
        Skip for now
      </button>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <button type="button" onClick={onBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-tos-muted">
        Back
      </button>
      <button
        type="button"
        disabled={nextDisabled}
        onClick={onNext}
        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-cyan-500/20 py-2.5 text-sm font-semibold text-cyan-200 disabled:opacity-50"
      >
        {nextLabel} {nextLabel === "Continue" ? <ChevronRight className="h-4 w-4" /> : <Check className="h-4 w-4" />}
      </button>
    </div>
  );
}
