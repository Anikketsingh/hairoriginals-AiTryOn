/**
 * lib/jobs/runner.ts
 *
 * Single place that schedules generation background work.
 *
 * Fixes the original fire-and-forget bug: app/api/generate/route.ts used to
 * call `processGenerationAsync(...).catch(...)` without extending the
 * request lifecycle at all, so on a frozen/recycled serverless instance the
 * job could be killed mid-flight before it ever wrote a result.
 *
 * `after()` (from next/server) schedules its callback to run once the
 * response has been sent, and extends the invocation's lifetime until that
 * callback settles. On a long-running Node/Docker process this is nearly
 * free — the process was never going to exit anyway. On a serverless
 * platform whose adapter wires up `waitUntil` (Vercel's does), `after()`
 * uses that to keep the function alive for exactly this kind of background
 * work. Same call site works unmodified on either host.
 */

import { after } from "next/server";
import { processGenerationAsync, type ProcessJobParams } from "@/lib/generation-queue";

export function enqueueGenerationJob(params: ProcessJobParams): void {
  after(async () => {
    // processGenerationAsync already catches every failure path internally
    // and writes a `failed` row rather than throwing, so this can't reject.
    await processGenerationAsync(params);
  });
}
