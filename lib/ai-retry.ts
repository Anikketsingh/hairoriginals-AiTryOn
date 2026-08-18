/**
 * lib/ai-retry.ts
 *
 * Timeout + transient-failure helpers shared by every Gemini call site
 * (lib/generation-queue.ts for image generation, lib/gemini-vision.ts for the
 * face-scan analysis).
 *
 * Extracted from lib/generation-queue.ts, where these lived as module-private
 * functions, once a second AI path needed exactly the same behaviour. Pure
 * functions — no SDK, no DB — so both callers can import them freely.
 */

/**
 * Heuristic match for transient failures worth retrying (timeouts, connection
 * resets, 5xx, rate limiting) vs. permanent ones (bad input, safety rejection)
 * that should fail immediately.
 */
const RETRYABLE_ERROR_PATTERN = /timeout|ECONNRESET|fetch failed|50[0-9]|429/i;

export function isRetryableAiError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return RETRYABLE_ERROR_PATTERN.test(message);
}

/**
 * Races a promise against a timer.
 *
 * The @google/genai SDK has no request timeout of its own — a hung connection
 * otherwise leaves the caller's promise pending forever, past any try/catch
 * and retry logic around it. This turns that hang into an immediate, retryable
 * error instead.
 *
 * Soft timeout: the underlying call isn't aborted, just ignored.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
