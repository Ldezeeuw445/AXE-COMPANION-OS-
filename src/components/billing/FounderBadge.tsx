import { Badge } from "@/components/ui/Badge";

type Props = {
  label: string;
  founderBadge?: boolean;
};

/** Permanent Founder marker — shown in Settings and (later) profile/chat. */
export function FounderBadge({ label, founderBadge = false }: Props) {
  if (!founderBadge) return null;
  return (
    <Badge variant="warm">
      <span aria-hidden>◆</span>
      Founder
    </Badge>
  );
}

export function PlanStatusLine({ label, founderBadge = false }: Props) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-tos-text">{label}</span>
      <FounderBadge label={label} founderBadge={founderBadge} />
    </div>
  );
}
