"use client";

import { renderMarkdownInline } from "@/components/ui/MarkdownLite";
import {
  emphasizeTradingPairs,
  isItalicBriefSection,
  newsCardsFromHighlights,
  pairHighlights,
  parseBriefSections,
  sectionDisplayLabel,
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

function NewsCardBlock({ card, compact }: { card: BriefNewsCard; compact?: boolean }) {
  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
      {card.imageUrl ? (
        <div className={`relative w-full overflow-hidden ${compact ? "h-28" : "h-32"} bg-black/40`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-90"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          {card.breaking ? (
            <span className="absolute left-2.5 top-2.5 rounded-full border border-rose-300/25 bg-rose-500/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-rose-200/90">
              Breaking news
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="p-3">
        {!card.imageUrl && card.breaking ? (
          <span className="mb-1.5 inline-flex rounded-full border border-rose-300/25 bg-rose-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-rose-200/85">
            Breaking news
          </span>
        ) : null}
        <p className={`font-semibold text-tos-text/95 ${compact ? "text-[12px] leading-snug" : "text-[13px]"}`}>
          {card.title}
        </p>
        {card.summary ? (
          <p className={`mt-1 text-tos-muted ${compact ? "text-[11px]" : "text-[12px]"} leading-relaxed`}>
            {card.summary}
          </p>
        ) : null}
        {card.source ? (
          <p className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-tos-dim">
            {card.source}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function BriefBodyContent({ body, highlights, compact }: BriefBodyContentProps) {
  const pairs = pairHighlights(highlights);
  const newsCards = newsCardsFromHighlights(highlights);
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
        const label = section.label ?? sectionDisplayLabel(section.id);
        const showNewsCards = section.id === "news" && newsCards.length > 0;
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
                    Breaking news
                  </span>
                ) : null}
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

            {showNewsCards ? (
              <div className={`grid gap-2 ${compact ? "mt-2" : "mt-2.5"} ${newsCards.length > 1 ? "sm:grid-cols-2" : ""}`}>
                {newsCards.map((card) => (
                  <NewsCardBlock key={card.title} card={card} compact={compact} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
