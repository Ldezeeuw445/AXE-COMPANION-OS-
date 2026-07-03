'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';

import {
  CHART_THEME_KEYS,
  type ChartThemeKey,
} from '@/components/chart/chartTheme';
import { cn } from '@/lib/utils';

/** View-transition scope for chart-only midnight ↔ paper animation. */
export const CHART_THEME_VIEW_TRANSITION = 'axe-chart-theme';

export type ChartThemeDirection = 'btt' | 'ttb' | 'ltr' | 'rtl';

type ChartThemeVisual = 'dark' | 'light';

function chartThemeVisual(key: ChartThemeKey): ChartThemeVisual {
  return key === 'paper' ? 'light' : 'dark';
}

function getClipKeyframes(direction: ChartThemeDirection): [string, string] {
  switch (direction) {
    case 'ltr':
      return ['inset(0 100% 0 0)', 'inset(0 0 0 0)'];
    case 'rtl':
      return ['inset(0 0 0 100%)', 'inset(0 0 0 0)'];
    case 'ttb':
      return ['inset(0 0 100% 0)', 'inset(0 0 0 0)'];
    case 'btt':
      return ['inset(100% 0 0 0)', 'inset(0 0 0 0)'];
    default:
      return ['inset(0 100% 0 0)', 'inset(0 0 0 0)'];
  }
}

function getNextChartTheme(current: ChartThemeKey, modes: ChartThemeKey[]): ChartThemeKey {
  const i = modes.indexOf(current);
  if (i === -1) return modes[0];
  return modes[(i + 1) % modes.length];
}

function getIcon(key: ChartThemeKey, iconClass: string) {
  return key === 'paper' ? <Sun className={iconClass} /> : <Moon className={iconClass} />;
}

const chartThemeButtonVariants = cva(
  "flex shrink-0 items-center justify-center border shadow-sm transition-[box-shadow,_color,_background-color,_border-color] outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "border-white/12 bg-white/[0.06] text-white/80 hover:border-white/20 hover:bg-white/[0.10]",
        ghost:
          "border-transparent bg-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.06]",
        outline:
          "border-white/14 bg-black/35 text-white/82 backdrop-blur-md hover:border-white/22 hover:bg-black/45",
        toolbar:
          "rounded-md border-white/[0.10] bg-black/78 text-white/85 shadow-[0_4px_14px_rgba(0,0,0,0.4)] backdrop-blur hover:border-white/20",
      },
      size: {
        default: "size-9 rounded-lg [&_svg:not([class*='size-'])]:size-4",
        sm: "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        lg: "size-10 rounded-lg [&_svg:not([class*='size-'])]:size-[1.125rem]",
        toolbar: "h-8 w-8 [&_svg:not([class*='size-'])]:size-3.5",
      },
      tone: {
        dark: "border-white/12 bg-black/45 text-white/82 hover:border-white/20 hover:bg-black/55",
        light: "border-black/12 bg-white/75 text-black/72 hover:border-black/18 hover:bg-white/90",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
      tone: "dark",
    },
  },
);

type ChartThemeTogglerButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof chartThemeButtonVariants> & {
    themeKey: ChartThemeKey;
    modes?: ChartThemeKey[];
    direction?: ChartThemeDirection;
    onThemeChange: (key: ChartThemeKey) => void;
  };

function ChartThemeTogglerButton({
  themeKey,
  modes = CHART_THEME_KEYS,
  direction = 'ttb',
  onThemeChange,
  variant = 'outline',
  size = 'default',
  tone,
  className,
  onClick,
  ...props
}: ChartThemeTogglerButtonProps) {
  const themeKeyRef = React.useRef(themeKey);
  const resolvedTone = tone ?? (chartThemeVisual(themeKey) === 'dark' ? 'dark' : 'light');
  const iconClass = size === 'toolbar' || size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  React.useEffect(() => {
    themeKeyRef.current = themeKey;
  }, [themeKey]);

  const runTransitionAnimation = React.useCallback(
    (fromClip: string, toClip: string) => {
      if (typeof document.startViewTransition !== 'function') return;
      void document.documentElement
        .animate(
          { clipPath: [fromClip, toClip] },
          {
            duration: 700,
            easing: 'ease-in-out',
            pseudoElement: `::view-transition-new(${CHART_THEME_VIEW_TRANSITION})`,
          },
        )
        .finished.catch(() => {});
    },
    [],
  );

  return (
    <button
      type="button"
      data-slot="chart-theme-toggler-button"
      className={cn(chartThemeButtonVariants({ variant, size, tone: resolvedTone, className }))}
      aria-label={`Chart theme: ${themeKey === 'paper' ? 'Paper' : 'Midnight'}. Tap to switch.`}
      title={themeKey === 'paper' ? 'Paper chart' : 'Midnight chart'}
      onClick={(e) => {
        onClick?.(e);
        const next = getNextChartTheme(themeKeyRef.current, modes);
        if (next === themeKeyRef.current) return;

        const [fromClip, toClip] = getClipKeyframes(direction);
        themeKeyRef.current = next;
        onThemeChange(next);

        try {
          if (typeof document.startViewTransition === 'function') {
            void document.startViewTransition(() => {}).finished.finally(() => {
              runTransitionAnimation(fromClip, toClip);
            });
          } else {
            runTransitionAnimation(fromClip, toClip);
          }
        } catch {
          /* theme already applied */
        }
      }}
      {...props}
    >
      {getIcon(themeKey, iconClass)}
    </button>
  );
}

export { ChartThemeTogglerButton, type ChartThemeTogglerButtonProps };
