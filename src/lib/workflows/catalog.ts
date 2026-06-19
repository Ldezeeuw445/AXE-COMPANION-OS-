import { chatHrefWithPrefill } from "@/lib/chat/chatPrefill";
import {
  WORKFLOW_CATEGORY_DEFS,
  WORKFLOW_DEFINITIONS,
  type WorkflowDefinition,
} from "@/lib/workflows/definitions";
import { resolveWorkflowStatus, type WorkflowRuntime } from "@/lib/workflows/status";

export type ResolvedWorkflowAction = {
  id: string;
  title: string;
  description: string;
  iconKey: WorkflowDefinition["iconKey"];
  href: string;
  chatPrompt: string | null;
  status: ReturnType<typeof resolveWorkflowStatus>;
  categoryId: string;
};

export type ResolvedWorkflowCategory = {
  id: string;
  title: string;
  subtitle: string;
  actions: ResolvedWorkflowAction[];
};

function resolveAction(def: WorkflowDefinition, runtime: WorkflowRuntime): ResolvedWorkflowAction {
  const chatPrompt = def.chatPrompt ?? null;
  const href = def.href ?? (chatPrompt ? chatHrefWithPrefill(chatPrompt) : "/actions");
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    iconKey: def.iconKey,
    href,
    chatPrompt,
    status: resolveWorkflowStatus(def.statusGate, runtime),
    categoryId: def.categoryId,
  };
}

export function buildWorkflowCatalog(runtime: WorkflowRuntime): ResolvedWorkflowCategory[] {
  const resolved = WORKFLOW_DEFINITIONS.map((def) => resolveAction(def, runtime));
  return WORKFLOW_CATEGORY_DEFS.map((cat) => ({
    id: cat.id,
    title: cat.title,
    subtitle: cat.subtitle,
    actions: resolved.filter((a) => a.categoryId === cat.id),
  })).filter((cat) => cat.actions.length > 0);
}

export function resolveFavoriteActions(
  favoriteIds: string[],
  runtime: WorkflowRuntime,
): ResolvedWorkflowAction[] {
  const byId = new Map(WORKFLOW_DEFINITIONS.map((d) => [d.id, d]));
  return favoriteIds
    .map((id) => byId.get(id))
    .filter((d): d is WorkflowDefinition => Boolean(d))
    .map((def) => resolveAction(def, runtime));
}
