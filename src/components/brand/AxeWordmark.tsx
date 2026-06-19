type Props = {
  className?: string;
  size?: "xs" | "sm";
};

export function AxeWordmark({ className = "", size = "xs" }: Props) {
  const textSize = size === "sm" ? "text-[10px]" : "text-[9px]";
  return (
    <span
      className={`select-none font-extrabold uppercase tracking-[0.22em] ${textSize} ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, #C9F24B 0%, #3FE6CF 48%, #7A57FF 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
      aria-label="Trading OS"
    >
      TRADING OS
    </span>
  );
}

