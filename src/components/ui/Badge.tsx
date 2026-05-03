type BadgeProps = {
  children: React.ReactNode;
  variant?:
    | "neutral"
    | "warm"
    | "long"
    | "short"
    | "risk"
    | "news"
    | "price";
};

const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
  neutral:
    "border-white/10 bg-white/[0.05] text-tos-muted",
  warm:
    "border-tos-warm/30 bg-tos-warm-soft/50 font-medium text-tos-warm",
  long: "border-tos-long/30 bg-tos-long/12 text-tos-long",
  short: "border-tos-short/35 bg-tos-short/12 text-tos-short",
  risk: "border-tos-risk/30 bg-tos-risk/12 text-tos-risk",
  news: "border-tos-news/35 bg-tos-news/12 text-tos-news",
  price: "border-tos-price/35 bg-tos-price/12 text-tos-price",
};

export function Badge({ children, variant = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
