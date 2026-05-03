import Image from "next/image";

type BrandMarkProps = {
  size?: number;
  className?: string;
  /** Defaults to the AXE companion mark served from `public/`. */
  src?: string;
};

export function BrandMark({
  size = 28,
  className = "",
  src = "/axe-logo-companion.png",
}: BrandMarkProps) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Image
        src={src}
        alt=""
        width={Math.max(1, Math.floor(size * 0.78))}
        height={Math.max(1, Math.floor(size * 0.78))}
        className="h-auto w-auto"
        priority
        unoptimized
      />
    </div>
  );
}

