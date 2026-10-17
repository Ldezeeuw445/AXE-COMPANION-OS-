/**
 * LLM failure classification + an in-process health registry.
 *
 * Why this exists: on 2026-10-10 the OpenAI account ran out of credits and
 * every model-backed feature in the app went quiet — auto-journaling returned
 * `{ ok: true, journaled: 0 }`, intel correlation returned `ok: false` into a
 * log nobody reads, and the learning loop simply stopped growing. Nothing in
 * the product said so. The code was fine; the failure was invisible.
 *
 * So: every model call that matters classifies its error here, and the result
 * is both recorded (Supabase `axe_engine_runs`) and kept in memory so
 * `/api/debug/cron-health` can answer "why is AXE quiet?" in one request.
 *
 * This module is deliberately dependency-free so it can be exercised directly
 * with `node --experimental-strip-types`.
 */

export type LlmFailureReason =
  | "no_credits"
  | "rate_limited"
  | "auth_failed"
  | "model_unavailable"
  | "unreachable"
  | "bad_response"
  | "not_configured"
  | "unknown";

export type LlmFailure = {
  reason: LlmFailureReason;
  /** Short, human-readable, redacted. Safe to render in an ops panel. */
  message: string;
  /** Retrying the identical call later could succeed with no human involved. */
  retryable: boolean;
  /** Only a human can clear this (billing, a new key, a config change). */
  needsOperator: boolean;
};

/* ── Redaction ────────────────────────────────────────────────────
   Provider errors echo request context back. Never let a key reach a
   log line, an ops panel, or a chat message.
   ───────────────────────────────────────────────────────────────── */

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_\-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._\-]{8,}/gi,
  /\b[A-Za-z0-9_\-]{0,8}(api[_-]?key"?\s*[:=]\s*"?)[A-Za-z0-9._\-]{8,}/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (match) => {
      const keep = match.match(/api[_-]?key"?\s*[:=]\s*"?/i);
      return keep ? `${keep[0]}[redacted]` : "[redacted]";
    });
  }
  return out;
}

/* ── Classification ──────────────────────────────────────────────── */

function errorText(err: unknown): string {
  if (err === null || err === undefined) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const causeText =
      cause instanceof Error ? ` ${cause.message}` : typeof cause === "string" ? ` ${cause}` : "";
    return `${err.message}${causeText}`;
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts = [o.message, o.error, o.code, o.type, o.status].filter(
      (v) => typeof v === "string" || typeof v === "number",
    );
    if (parts.length) return parts.join(" ");
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function statusOf(err: unknown): number | null {
  if (err && typeof err === "object") {
    const s = (err as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  const m = errorText(err).match(/\b(4\d\d|5\d\d)\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Turn whatever a provider threw into one of a handful of reasons a human can
 * act on. Order matters: a credits failure also carries HTTP 429, and reading
 * it as "rate limited" would make us retry forever against an empty wallet.
 */
export function classifyLlmFailure(err: unknown): LlmFailure {
  const raw = errorText(err);
  const text = raw.toLowerCase();
  const status = statusOf(err);
  const message = redactSecrets(raw).slice(0, 400) || "unknown error";

  if (
    text.includes("no credits remaining") ||
    text.includes("insufficient_quota") ||
    text.includes("insufficient quota") ||
    text.includes("exceeded your current quota") ||
    text.includes("billing_hard_limit") ||
    text.includes("credit balance is too low")
  ) {
    return {
      reason: "no_credits",
      message,
      retryable: false,
      needsOperator: true,
    };
  }

  if (status === 429 || text.includes("rate limit") || text.includes("too many requests")) {
    return { reason: "rate_limited", message, retryable: true, needsOperator: false };
  }

  if (
    status === 401 ||
    status === 403 ||
    text.includes("invalid_api_key") ||
    text.includes("incorrect api key") ||
    text.includes("unauthorized") ||
    text.includes("permission denied")
  ) {
    return { reason: "auth_failed", message, retryable: false, needsOperator: true };
  }

  if (text.includes("model_not_found") || text.includes("does not exist or you do not have access")) {
    return { reason: "model_unavailable", message, retryable: false, needsOperator: true };
  }

  if (
    text.includes("fetch failed") ||
    text.includes("econnrefused") ||
    text.includes("enotfound") ||
    text.includes("etimedout") ||
    text.includes("socket hang up") ||
    text.includes("network") ||
    text.includes("timeout") ||
    text.includes("aborted") ||
    (status !== null && status >= 500)
  ) {
    return { reason: "unreachable", message, retryable: true, needsOperator: false };
  }

  if (
    text.includes("json") ||
    text.includes("unexpected token") ||
    text.includes("no response") ||
    text.includes("empty response")
  ) {
    return { reason: "bad_response", message, retryable: true, needsOperator: false };
  }

  return { reason: "unknown", message, retryable: true, needsOperator: false };
}

/** One line a non-engineer can act on. Shown in the ops panel, not in chat. */
export function llmFailureAdvice(reason: LlmFailureReason): string {
  switch (reason) {
    case "no_credits":
      return "The model provider has no credits left. Top up the account — no code change will fix this.";
    case "rate_limited":
      return "Rate limited by the provider. It should clear on its own; if it does not, lower the call volume.";
    case "auth_failed":
      return "The API key is missing, wrong, or revoked. Set a valid key on the host.";
    case "model_unavailable":
      return "The configured model is not available to this account. Pick a model the account can use.";
    case "unreachable":
      return "Could not reach the model provider. Check the host's outbound network.";
    case "bad_response":
      return "The model answered in a shape we could not parse. Usually transient.";
    case "not_configured":
      return "No model provider is configured at all. Set OPENAI_API_KEY or OLLAMA_URL on the host.";
    default:
      return "Unclassified model failure — read the message.";
  }
}

/* ── In-process registry ──────────────────────────────────────────
   The VPS runs one long-lived Next server, so a module-level map is a
   truthful picture of "what has been failing since the last restart".
   It is a complement to the Supabase record, never a replacement.
   ───────────────────────────────────────────────────────────────── */

export type LlmHealthEntry = {
  source: string;
  lastFailure: LlmFailure | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  /** Failures since the last success. Resets to 0 on success. */
  consecutiveFailures: number;
  totalFailures: number;
};

const registry = new Map<string, LlmHealthEntry>();

function entryFor(source: string): LlmHealthEntry {
  let e = registry.get(source);
  if (!e) {
    e = {
      source,
      lastFailure: null,
      lastFailureAt: null,
      lastSuccessAt: null,
      consecutiveFailures: 0,
      totalFailures: 0,
    };
    registry.set(source, e);
  }
  return e;
}

export function noteLlmFailure(source: string, failure: LlmFailure): void {
  const e = entryFor(source);
  e.lastFailure = failure;
  e.lastFailureAt = new Date().toISOString();
  e.consecutiveFailures += 1;
  e.totalFailures += 1;
}

export function noteLlmSuccess(source: string): void {
  const e = entryFor(source);
  e.lastSuccessAt = new Date().toISOString();
  e.consecutiveFailures = 0;
}

export function llmHealthSnapshot(): LlmHealthEntry[] {
  return [...registry.values()].sort((a, b) => a.source.localeCompare(b.source));
}

/**
 * The one question the ops panel needs answered: is something broken that a
 * human has to fix? Returns null when nothing needs an operator.
 */
export function blockingLlmFailure(): { source: string; failure: LlmFailure; advice: string } | null {
  for (const e of llmHealthSnapshot()) {
    if (e.lastFailure?.needsOperator && e.consecutiveFailures > 0) {
      return {
        source: e.source,
        failure: e.lastFailure,
        advice: llmFailureAdvice(e.lastFailure.reason),
      };
    }
  }
  return null;
}

/** Test seam — only used by verification scripts. */
export function __resetLlmHealth(): void {
  registry.clear();
}
