import "server-only";

export class Mt5ActionTimeoutError extends Error {
  constructor(readonly operation: string) {
    super(`${operation}_timeout`);
    this.name = "Mt5ActionTimeoutError";
  }
}

export async function withActionBudget<T>(
  operation: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Mt5ActionTimeoutError(operation)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
