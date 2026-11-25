/**
 * Runs a per-user cron batch inside a wall-clock budget.
 *
 * pg_cron calls the briefing routes through pg_net, which gives up after
 * 120 s. The batch used to loop over every trader in one request, so on busy
 * mornings the route was still working when pg_net logged "no_response"
 * (13 of 31 daily-briefing runs on 24/25 Nov 2026). Now no new item starts once
 * the budget is spent; the rest is reported as deferred and the next
 * 15-minute tick picks it up (a brief that already exists for today is
 * skipped cheaply, so finished users do not cost an LLM call again).
 */

export const BRIEFING_CRON_BUDGET_MS = 90_000;

export type BudgetedBatchResult = {
  processed: number;
  failed: number;
  /** Items not started because the budget ran out. */
  deferred: number;
};

export async function runBatchWithinBudget<T>(
  items: readonly T[],
  work: (item: T) => Promise<void>,
  opts: {
    budgetMs?: number;
    now?: () => number;
    retryDelayMs?: number;
    onError?: (item: T, error: unknown, attempt: 1 | 2) => void;
  } = {},
): Promise<BudgetedBatchResult> {
  const now = opts.now ?? (() => Date.now());
  const budgetMs = opts.budgetMs ?? BRIEFING_CRON_BUDGET_MS;
  const retryDelayMs = opts.retryDelayMs ?? 1500;
  const deadline = now() + budgetMs;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    if (now() >= deadline) {
      return { processed, failed, deferred: items.length - i };
    }
    const item = items[i]!;
    try {
      await work(item);
      processed++;
    } catch (error) {
      opts.onError?.(item, error, 1);
      // Retry only if there is still time for it; otherwise leave it for the next tick.
      if (now() + retryDelayMs >= deadline) {
        return { processed, failed, deferred: items.length - i };
      }
      try {
        if (retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
        await work(item);
        processed++;
      } catch (retryError) {
        opts.onError?.(item, retryError, 2);
        failed++;
      }
    }
  }
  return { processed, failed, deferred: 0 };
}
