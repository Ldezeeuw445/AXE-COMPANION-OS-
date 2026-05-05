type Props = {
  className?: string;
  size?: "xs" | "sm";
};

export function AxeWordmark({ className = "", size = "xs" }: Props) {
  const textSize = size === "sm" ? "text-[12px]" : "text-[11px]";
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
      aria-label="AXE"
    >
      AXE
    </span>
  );
}

