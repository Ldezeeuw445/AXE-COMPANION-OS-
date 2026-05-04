import type { ReactNode } from "react";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
};

export function ScreenHeader({
  title,
  subtitle,
  left,
  right,
}: ScreenHeaderProps) {
  return (
    <header className="relative flex shrink-0 items-start justify-between gap-3 px-1 pb-4 pt-1">
      <div className="flex min-w-0 items-start gap-3">
        {left ? <div className="pt-0.5">{left}</div> : null}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold uppercase tracking-[0.12em] text-cyan-400">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 max-w-full whitespace-normal break-words text-[11px] leading-snug text-tos-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {right ? <div className="shrink-0 pt-0.5">{right}</div> : null}

      {/* Accent separator line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(46,196,182,0.35) 30%, rgba(46,196,182,0.35) 70%, transparent 100%)",
        }}
      />
    </header>
  );
}
