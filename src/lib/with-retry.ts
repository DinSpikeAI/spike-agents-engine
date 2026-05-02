// src/lib/with-retry.ts
//
// Exponential-backoff retry utility for fallible async operations.
//
// Designed primarily for Anthropic API calls but generic enough for any
// async work where transient failures (network blips, 429s, 5xx) are
// distinguishable from terminal failures (400, 401, 422 — broken requests).
//
// USAGE:
//   const result = await withRetry(
//     () => anthropic.messages.create({...}),
//     {
//       onRetry: ({ attempt, nextDelayMs, error }) => {
//         console.warn(`[my-agent] LLM attempt ${attempt} failed`, error);
//       },
//     }
//   );
//
// DEFAULTS: 3 attempts total, with 1s / 2s / 4s exponential delays plus
// 0-100ms random jitter. Max total wait when all attempts fail: ~7s + jitter.
// Cost: zero overhead on the happy path (no retry needed = direct call).
//
// COST IMPLICATIONS for LLM retries: Anthropic bills only for *completed*
// responses. Network errors, 5xx server errors, and 429 rate limits return
// no usage data, so retrying does not double-charge. Successful 2nd-attempt
// calls cost the same as a successful 1st-attempt call.
//
// WHAT THIS DOES NOT DO:
//   - Persistent retry across process restarts. If the function is killed
//     mid-retry, all in-flight retries are lost. This is a per-call utility,
//     not a durable queue.
//   - Idempotency. The caller must ensure fn() is safe to call multiple
//     times. For LLM completions this is fine; for DB writes (especially
//     state-changing ones), wrap with caution or use a higher-level
//     idempotency key.

interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms; doubles each attempt. Default 1000 (→ 1s, 2s, 4s). */
  baseDelayMs?: number;
  /** Override the default retryability decision. Return true to retry. */
  isRetryable?: (err: unknown) => boolean;
  /** Called before each delay; useful for logging or telemetry. */
  onRetry?: (info: { attempt: number; nextDelayMs: number; error: unknown }) => void;
}

/**
 * Default decision for whether an error is worth retrying.
 *
 * Retryable:
 *   - Anthropic SDK error names: APIConnectionError, APIConnectionTimeoutError
 *   - HTTP status codes: 429 (rate limit), 500-504 (server errors), 529 (Anthropic overloaded)
 *
 * Non-retryable:
 *   - HTTP 400/401/403/404/422 (request is broken — retry won't help)
 *   - JSON parse errors, schema validation errors (deterministic failures)
 *   - Anything else not matching the above
 */
function defaultIsRetryable(err: unknown): boolean {
  // Anthropic SDK errors carry .name on Error subclasses
  if (err instanceof Error) {
    const name = err.name;
    if (
      name === "APIConnectionError" ||
      name === "APIConnectionTimeoutError"
    ) {
      return true;
    }
  }

  // Many HTTP-error-like objects expose .status or .statusCode
  const errObj = err as { status?: number; statusCode?: number };
  const status = errObj?.status ?? errObj?.statusCode;

  if (typeof status === "number") {
    // 429 = rate limit; 529 = Anthropic-specific "overloaded"; 500-504 = server errors
    return (
      status === 429 ||
      status === 529 ||
      (status >= 500 && status <= 504)
    );
  }

  // Unknown error shape → conservative: don't retry
  return false;
}

/** Sleep with jitter to avoid thundering-herd on shared rate limits. */
function sleepWithJitter(baseMs: number): Promise<void> {
  const jitterMs = Math.random() * 100; // up to +100ms randomness
  return new Promise((resolve) => setTimeout(resolve, baseMs + jitterMs));
}

/**
 * Execute fn() with exponential-backoff retry on transient failures.
 *
 * Returns whatever fn() returns on success. Throws the last error if all
 * attempts are exhausted, or throws immediately on a non-retryable error.
 *
 * The total wall-clock time bound is roughly:
 *   baseDelayMs * (2^maxAttempts - 1) + (maxAttempts × 100ms jitter)
 * For defaults (3 attempts, 1000ms base): ~7s max if all fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Out of attempts OR non-retryable → propagate immediately.
      if (attempt >= maxAttempts || !isRetryable(err)) {
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, ...
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);

      options.onRetry?.({ attempt, nextDelayMs: delayMs, error: err });

      await sleepWithJitter(delayMs);
    }
  }

  // Unreachable in practice (the loop either returns or throws), but
  // TypeScript needs an explicit fallthrough for type-narrowing.
  throw lastError;
}
