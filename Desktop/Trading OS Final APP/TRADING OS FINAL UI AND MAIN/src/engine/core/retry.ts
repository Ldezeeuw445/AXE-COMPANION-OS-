export interface RetryOptions {
  maxAttempts: number; // including the first attempt
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio?: number; // 0-1
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<{ value: T; attempts: number }> {
  const jitter = opts.jitterRatio ?? 0.2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const value = await fn(attempt);
      return { value, attempts: attempt };
    } catch (e) {
      lastError = e;
      if (attempt >= opts.maxAttempts) break;
      const exp = opts.baseDelayMs * Math.pow(2, attempt - 1);
      const capped = Math.min(opts.maxDelayMs, exp);
      const j = capped * jitter * (Math.random() * 2 - 1); // +/- jitter
      await sleep(Math.max(0, Math.floor(capped + j)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

