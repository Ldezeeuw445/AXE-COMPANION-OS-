import { WORKFLOW_IDS } from "@/lib/workflows/definitions";

export const MAX_FAVORITE_WORKFLOWS = 5;

export const DEFAULT_FAVORITE_WORKFLOW_IDS = [
  "risk-check",
  "next-news",
  "today",
  "price-alert",
  "xau-bias",
] as const;

export function normalizeFavoriteWorkflowIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [...DEFAULT_FAVORITE_WORKFLOW_IDS];
  const allowed = new Set(WORKFLOW_IDS);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || !allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_FAVORITE_WORKFLOWS) break;
  }
  if (out.length === 0) return [...DEFAULT_FAVORITE_WORKFLOW_IDS];
  return out;
}
