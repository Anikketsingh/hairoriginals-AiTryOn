/**
 * lib/debug-timing.ts
 *
 * ⚠️ TEMPORARY INSTRUMENTATION — DELETE BEFORE SHIPPING.
 *
 * Step-by-step timing for the AI Stylist flow while it's being tuned. To rip
 * it all out: delete this file and grep for `debug-timing` / `createTimer`
 * across the repo — every call site is a single import plus `t.mark(...)`
 * lines that can be removed without touching any logic.
 *
 * Isomorphic on purpose: server timings land in the `next dev` terminal,
 * client timings in the browser console, both with the same `[timing:label]`
 * prefix so they can be lined up by eye.
 */

export interface DebugTimer {
  /** Record the elapsed time since the previous mark (or since creation). */
  mark(step: string): void;
  /** Print `total=…ms stepA=…ms stepB=…ms` and stop. */
  log(extra?: string): void;
}

export function createTimer(label: string): DebugTimer {
  const startedAt = Date.now();
  let last = startedAt;
  const marks: string[] = [];

  return {
    mark(step: string) {
      const now = Date.now();
      marks.push(`${step}=${now - last}ms`);
      last = now;
    },
    log(extra?: string) {
      const total = Date.now() - startedAt;
      console.info(
        `[timing:${label}] TOTAL=${total}ms | ${marks.join("  ")}${extra ? ` | ${extra}` : ""}`
      );
    },
  };
}
