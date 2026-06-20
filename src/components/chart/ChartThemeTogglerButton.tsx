'use client';

import * as React from 'react';
import { flushSync } from 'react-dom';
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

function getIcon(key: ChartThemeKey) {
  return key === 'paper' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />;
}

const chartThemeButtonVariants = cva(
  "flex shrink-0 items-center justify-center rounded-lg border shadow-sm transition-[box-shadow,_color,_background-color,_border-color] outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-white/12 bg-white/[0.06] text-white/80 hover:border-white/20 hover:bg-white/[0.10]",
        ghost:
          "border-transparent bg-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.06]",
        outline:
          "border-white/14 bg-black/35 text-white/82 backdrop-blur-md hover:border-white/22 hover:bg-black/45",
      },
      size: {
        default: "size-9 [&_svg:not([class*='size-'])]:size-4",
        sm: "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "size-10 [&_svg:not([class*='size-'])]:size-[1.125rem]",
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
    onImmediateChange?: (key: ChartThemeKey) => void;
  };

function ChartThemeTogglerButton({
  themeKey,
  modes = CHART_THEME_KEYS,
  direction = 'ttb',
  onThemeChange,
  onImmediateChange,
  variant = 'outline',
  size = 'default',
  tone,
  className,
  onClick,
  ...props
}: ChartThemeTogglerButtonProps) {
  const [preview, setPreview] = React.useState<ChartThemeKey | null>(null);
  const [displayKey, setDisplayKey] = React.useState(themeKey);
  const resolvedTone = tone ?? (chartThemeVisual(themeKey) === 'dark' ? 'dark' : 'light');

  React.useEffect(() => {
    if (preview && themeKey === preview) {
      setPreview(null);
    }
    setDisplayKey(themeKey);
  }, [themeKey, preview]);

  const [fromClip, toClip] = getClipKeyframes(direction);

  const toggleTheme = React.useCallback(
    async (next: ChartThemeKey) => {
      if (next === themeKey) return;

      setDisplayKey(next);
      onImmediateChange?.(next);

      const applyTheme = () => {
        flushSync(() => {
          setPreview(next);
        });
        onThemeChange(next);
      };

      if (!document.startViewTransition) {
        applyTheme();
        return;
      }

      await document.startViewTransition(() => {
        applyTheme();
      }).ready;

      document.documentElement
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
    [fromClip, onImmediateChange, onThemeChange, themeKey, toClip],
  );

  const effectiveKey = preview ?? displayKey;

  return (
    <>
      <button
        type="button"
        data-slot="chart-theme-toggler-button"
        className={cn(chartThemeButtonVariants({ variant, size, tone: resolvedTone, className }))}
        aria-label={`Chart theme: ${effectiveKey === 'paper' ? 'Paper' : 'Midnight'}. Tap to switch.`}
        title={effectiveKey === 'paper' ? 'Paper chart' : 'Midnight chart'}
        onClick={(e) => {
          onClick?.(e);
          void toggleTheme(getNextChartTheme(themeKey, modes));
        }}
        {...props}
      >
        {getIcon(effectiveKey)}
      </button>
    </>
  );
}

export { ChartThemeTogglerButton, type ChartThemeTogglerButtonProps };
