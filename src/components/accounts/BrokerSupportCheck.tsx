"use client";

import { CheckCircle2, CircleHelp, CircleX } from "lucide-react";
import {
  isExactKnownIdentity,
  lookupBrokerSupport,
  suggestKnownBrokers,
  type BrokerSupportKind,
  type BrokerSupportResult,
} from "@/lib/mt5/knownBrokers";

type Props = {
  value: string;
  onChange: (next: string) => void;
  id?: string;
};

const STATUS_STYLES: Record<
  BrokerSupportKind,
  { wrap: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  known: {
    wrap: "border-emerald-400/25 bg-emerald-400/[0.07]",
    icon: "text-emerald-300",
    Icon: CheckCircle2,
  },
  unknown: {
    wrap: "border-amber-400/25 bg-amber-400/[0.06]",
    icon: "text-amber-200",
    Icon: CircleHelp,
  },
  unsupported: {
    wrap: "border-rose-400/25 bg-rose-400/[0.07]",
    icon: "text-rose-300",
    Icon: CircleX,
  },
};

export function BrokerSupportCheck({ value, onChange, id = "wiz-server" }: Props) {
  const status = lookupBrokerSupport(value);
  const suggestions = suggestKnownBrokers(value, 6);
  const showChips = !value.trim();
  const showFiltered =
    value.trim().length > 0 &&
    suggestions.length > 0 &&
    status?.kind !== "unsupported" &&
    !isExactKnownIdentity(value);

  return (
    <div data-testid="broker-support-check" className="space-y-2">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-white/30" htmlFor={id}>
        Broker or server name
      </label>
      <input
        id={id}
        data-testid="broker-connect-server"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. ICMarketsSC-Live02"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="tos-neu-inset w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20"
      />

      {showChips && (
        <div
          data-testid="broker-support-popular"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {suggestions.map((broker) => (
            <button
              key={broker.id}
              type="button"
              data-testid={`broker-suggestion-${broker.id}`}
              onClick={() => onChange(broker.sampleServer ?? broker.name)}
              className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/70 active:bg-white/[0.08]"
            >
              {broker.name}
            </button>
          ))}
        </div>
      )}

      {showFiltered && !showChips && (
        <ul
          data-testid="broker-support-suggestions"
          className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]"
        >
          {suggestions.map((broker) => (
            <li key={broker.id} className="border-b border-white/[0.05] last:border-b-0">
              <button
                type="button"
                data-testid={`broker-suggestion-${broker.id}`}
                onClick={() => onChange(broker.sampleServer ?? broker.name)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left active:bg-white/[0.05]"
              >
                <span className="text-[12px] font-medium text-white/85">{broker.name}</span>
                <span className="max-w-[55%] truncate font-mono text-[10px] text-white/35">
                  {broker.sampleServer}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {status && <BrokerSupportStatus status={status} />}
    </div>
  );
}

export function BrokerSupportStatus({ status }: { status: BrokerSupportResult }) {
  const style = STATUS_STYLES[status.kind];
  const Icon = style.Icon;
  return (
    <div
      role="status"
      data-testid="broker-support-status"
      data-kind={status.kind}
      className={`rounded-xl border px-3 py-2.5 ${style.wrap}`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`} aria-hidden />
        <div className="min-w-0">
          <p data-testid="broker-support-title" className="text-[12px] font-semibold text-white">
            {status.title}
          </p>
          {status.match?.name && (
            <p data-testid="broker-support-match" className="mt-0.5 text-[10px] text-white/50">
              {status.match.name}
              {status.match.sampleServer ? ` · ${status.match.sampleServer}` : ""}
            </p>
          )}
          <p
            data-testid="broker-support-explanation"
            className="mt-1 text-[11px] leading-relaxed text-white/65"
          >
            {status.explanation}
          </p>
        </div>
      </div>
    </div>
  );
}
