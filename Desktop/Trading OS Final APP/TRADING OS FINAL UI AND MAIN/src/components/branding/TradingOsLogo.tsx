import { cn } from '@/lib/utils';

export type TradingOsLogoProps = {
  variant: 'wordmark' | 'mark';
  className?: string;
  imgClassName?: string;
  decorative?: boolean;
};

export function TradingOsLogo({ variant, className, imgClassName, decorative }: TradingOsLogoProps) {
  const alt = decorative ? '' : 'Trading OS';
  const src = variant === 'mark' ? '/trading-os-mark.png' : '/trading-os-wordmark.png';

  return (
    <span className={cn('inline-flex items-center justify-center', className)} aria-hidden={decorative ? true : undefined}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        className={cn(
          variant === 'mark'
            ? 'block h-auto max-w-[min(100%,13rem)] object-contain object-center sm:max-w-[14rem]'
            : 'block h-8 w-auto object-contain object-left sm:h-9',
          imgClassName
        )}
        style={variant === 'wordmark' ? undefined : { mixBlendMode: 'screen' }}
      />
    </span>
  );
}

