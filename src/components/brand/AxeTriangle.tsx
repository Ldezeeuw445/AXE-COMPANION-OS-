/**
 * AXE Triangle — the signature icon for AXE Intelligent Agent / Intel.
 * Cyan outlined triangle with translucent fill. Used in drawer, Intel page FAB, etc.
 */

export function AxeTriangle({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M16 6L28 26H4L16 6Z"
        fill="rgba(0,212,245,0.25)"
        stroke="#00d4f5"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
