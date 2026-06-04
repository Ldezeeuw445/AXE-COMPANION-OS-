"use client";

import dynamic from "next/dynamic";

/**
 * Loading skeleton matches the real BottomNav exactly:
 * fixed bottom-0, same gradient, same safe-area padding, same py-1.5 +
 * 6 icon-well-sized placeholders. This prevents any height jump on first load.
 */
function NavSkeleton() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "linear-gradient(180deg, #101016, #0a0a0e)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-hidden
    >
      {/* Top bevel line — same as real nav */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-[3px]">
            {/* Icon well placeholder */}
            <div
              className="h-10 w-10 rounded-xl"
              style={{
                boxShadow:
                  "inset 3px 3px 6px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(255,255,255,0.03)",
                background: "rgba(255,255,255,0.015)",
              }}
            />
            {/* Label placeholder */}
            <span className="h-[10px] w-6 rounded-sm bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </nav>
  );
}

const BottomNavNoSSR = dynamic(
  () => import("@/components/shell/BottomNav").then((m) => m.BottomNav),
  {
    ssr: false,
    loading: () => <NavSkeleton />,
  }
);

export function ClientBottomNav() {
  return <BottomNavNoSSR />;
}
