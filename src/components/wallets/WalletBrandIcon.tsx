"use client";

import Image from "next/image";
import type { WalletProviderMeta } from "@/lib/wallets/walletCatalog";
import { cn } from "@/lib/utils";

type WalletBrandIconProps = {
  meta: WalletProviderMeta;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE = {
  sm: { box: "h-8 w-8", img: 28 },
  md: { box: "h-11 w-11", img: 40 },
  lg: { box: "h-14 w-14", img: 52 },
} as const;

export function WalletBrandIcon({ meta, size = "md", className }: WalletBrandIconProps) {
  const dim = SIZE[size];

  if (!meta.logoSrc) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-[11px] font-bold uppercase text-white/50",
          dim.box,
          className,
        )}
        aria-hidden
      >
        {meta.name.slice(0, 2)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06] ring-1 ring-white/10",
        dim.box,
        className,
      )}
    >
      <Image
        src={meta.logoSrc}
        alt=""
        width={dim.img}
        height={dim.img}
        className={cn(
          "object-contain",
          meta.logoSrc.endsWith(".png") ? "h-[88%] w-[88%]" : "h-[72%] w-[72%]",
        )}
        aria-hidden
      />
    </div>
  );
}
