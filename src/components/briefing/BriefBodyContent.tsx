"use client";

import { useState } from "react";
import { renderMarkdownInline } from "@/components/ui/MarkdownLite";
import {
  emphasizeTradingPairs,
  eventsFromHighlights,
  isItalicBriefSection,
  newsCardsFromHighlights,
  pairHighlights,
  parseBriefSections,
  sectionDisplayLabel,
  type BriefEventChip,
  type BriefHighlight,
  type BriefNewsCard,
} from "@/lib/briefing/briefBodyFormat";
import { cn } from "@/lib/utils";

type BriefBodyContentProps = {
  body: string;
  highlights?: BriefHighlight[];
  compact?: boolean;
};

function RichBriefLine({
  text,
  pairs,
  className,
}: {
  text: string;
  pairs: string[];
  className: string;
}) {
  return (
    <p className={className}>{renderMarkdownInline(emphasizeTradingPairs(text, pairs))}</p>
  );
}

function EventChip({ event, compact }: { event: BriefEventChip; compact?: boolean }) {
  const impactColor =
    event.impact === "high"
      ? "border-amber-400/25 bg-amber-500/10 text-amber-200/90"
      : "border-white/10 bg-white/[0.04] text-white/75";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-2.5 py-2",
        impactColor,
        compact ? "text-[11px]" : "text-[12px]",
      )}
    >
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-white/50">
        {event.time}
      </span>
      <div className="min-w-0">
        <p className="font-medium leading-snug text-white/90">{event.title}</p>
        {event.currency ? (
          <p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/40">{event.currency}</p>
        ) : null}
      </div>
    </div>
  );
}

function NewsCardBlock({ card, compact }: { card: BriefNewsCard; compact?: boolean }) {
  const [imageOk, setImageOk] = useState(true);
  if (!card.imageUrl || !imageOk) return null;

  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
      <div className={`relative w-full overflow-hidden ${compact ? "h-32" : "h-36"} bg-black/50`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageOk(false)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        {card.breaking ? (
          <span className="absolute left-2.5 top-2.5 rounded-full border border-rose-300/25 bg-rose-500/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-rose-200/90">
            Breaking
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className={`font-semibold leading-snug text-white ${compact ? "text-[12px]" : "text-[13px]"}`}>
            {card.title}
          </p>
          {card.summary ? (
            <p className={`mt-1 line-clamp-2 text-white/70 ${compact ? "text-[10px]" : "text-[11px]"}`}>
              {card.summary}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function BriefBodyContent({ body, highlights, compact }: BriefBodyContentProps) {
  const pairs = pairHighlights(highlights);
  const newsCards = newsCardsFromHighlights(highlights);
  const eventChips = eventsFromHighlights(highlights);
  const sections = parseBriefSections(body);
  const textSize = compact ? "text-[12px]" : "text-[13px]";

  if (sections.length === 0) {
    return (
      <div className="space-y-1.5">
        {body
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .slice(0, 4)
          .map((para, i) => (
            <RichBriefLine key={i} text={para} pairs={pairs} className={`leading-relaxed text-tos-text/85 ${textSize}`} />
          ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section, idx) => {
        const label =
          section.id === "news" && eventChips.length > 0
            ? "Today's agenda"
            : (section.label ?? sectionDisplayLabel(section.id));
        const showEvents =
          section.id === "news" && eventChips.length > 0;
        const showNewsCard =
          section.id === "news" && newsCards.length > 0;
        const italicLabel = section.italicLabel ?? isItalicBriefSection(section.id);

        return (
          <div key={`${section.id}-${idx}`}>
            {label ? (
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h4
                  className={cn(
                    italicLabel
                      ? "text-[12px] font-medium italic tracking-[0.02em] text-white/82"
                      : "text-[10px] font-bold uppercase tracking-[0.18em] text-white/88",
                  )}
                >
                  {label}
                </h4>
                {section.id === "news" && (section.breaking || newsCards.some((c) => c.breaking)) ? (
                  <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-200/80">
                    Breaking
                  </span>
                ) : null}
              </div>
            ) : null}

            {showEvents ? (
              <div className={`grid gap-1.5 ${section.paragraphs.length ? "mb-2" : ""}`}>
                {eventChips.map((ev) => (
                  <EventChip key={`${ev.time}-${ev.title}`} event={ev} compact={compact} />
                ))}
              </div>
            ) : null}

            <div className="space-y-1.5">
              {section.paragraphs.map((para, i) => (
                <RichBriefLine
                  key={i}
                  text={para}
                  pairs={pairs}
                  className={`leading-relaxed text-tos-text/85 ${textSize}`}
                />
              ))}
            </div>

            {showNewsCard ? (
              <div className={compact ? "mt-2" : "mt-2.5"}>
                <NewsCardBlock card={newsCards[0]!} compact={compact} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
