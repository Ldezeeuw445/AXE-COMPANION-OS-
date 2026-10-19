/** Shared 410/404 detection so tests can cover cleanup without importing web-push. */

export function expiredSubscriptionEndpoints(
  results: PromiseSettledResult<unknown>[],
  subs: Array<{ endpoint: string }>,
): string[] {
  const expired: string[] = [];
  results.forEach((result, index) => {
    if (result.status !== "rejected") return;
    const err = result.reason as { statusCode?: number };
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      expired.push(subs[index].endpoint);
    }
  });
  return expired;
}
