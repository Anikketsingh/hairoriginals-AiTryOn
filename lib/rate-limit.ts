/**
 * lib/rate-limit.ts
 *
 * Rate limiting for the unauthenticated-by-design endpoints that can otherwise
 * be hammered for free: POST /api/sessions (mints guest credits), POST
 * /api/generate (burns AI spend per call), and POST /api/suggest (burns AI
 * spend and isn't even credit-gated). Backed by Upstash Redis (REST-based —
 * works from any runtime regardless of deployment target).
 *
 * Failure behaviour, in order of preference:
 *
 *   1. Upstash configured        → distributed limiting, correct across all
 *                                  serverless instances. This is the only
 *                                  fully correct mode; provision it.
 *   2. Upstash absent            → in-memory fallback (below). Degraded but
 *                                  non-zero: it caps a naive single-source
 *                                  flood. It does NOT hold across instances or
 *                                  cold starts, so a distributed attacker gets
 *                                  roughly limit × instance-count.
 *   3. Upstash configured but    → controlled by RATE_LIMIT_FAIL_CLOSED. Open
 *      erroring at request time     by default so a Redis blip doesn't take the
 *                                  product down; set the flag to deny instead.
 *
 * This module previously returned `true` unconditionally when unconfigured,
 * which meant both endpoints had NO limiting whatsoever in production.
 *
 * NOTE: this cannot protect the OTP send path. signInWithOtp() goes browser →
 * Supabase directly and never reaches a Next.js route, so there is nothing
 * here to hook. That path is defended by Turnstile, the country allowlist in
 * supabase/functions/send-sms/routing.ts, and the Supabase dashboard limits.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const failClosed = process.env.RATE_LIMIT_FAIL_CLOSED === "true";

const SESSIONS_LIMIT = 10;
const GENERATE_LIMIT = 20;
// Tighter than generate: an AI Stylist scan costs real Gemini spend but, unlike
// generate, consumes no credit — so the rate limit is the only thing standing
// between a script and an unbounded bill.
const SUGGEST_LIMIT = 6;
const WINDOW_MS = 60_000;

let sessionsLimiter: Ratelimit | null = null;
let generateLimiter: Ratelimit | null = null;
let suggestLimiter: Ratelimit | null = null;

if (url && token) {
  const redis = new Redis({ url, token });
  sessionsLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(SESSIONS_LIMIT, "1 m"),
    prefix: "rl:sessions",
  });
  generateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(GENERATE_LIMIT, "1 m"),
    prefix: "rl:generate",
  });
  suggestLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(SUGGEST_LIMIT, "1 m"),
    prefix: "rl:suggest",
  });
} else {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set — " +
      "falling back to per-instance in-memory limiting. This does NOT hold " +
      "across serverless instances. Provision Upstash before relying on this.",
  );
}

/**
 * Per-instance sliding window, used only when Upstash is unconfigured.
 *
 * Bounded by eviction on every call so it can't grow without limit under a
 * high-cardinality key attack (a flood of distinct IPs), which would otherwise
 * turn this safeguard into a memory-exhaustion vector.
 */
const MAX_TRACKED_KEYS = 10_000;
const memoryHits = new Map<string, number[]>();

function checkInMemory(key: string, limit: number): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  if (memoryHits.size > MAX_TRACKED_KEYS) {
    for (const [k, times] of memoryHits) {
      const live = times.filter((t) => t > cutoff);
      if (live.length === 0) memoryHits.delete(k);
      else memoryHits.set(k, live);
    }
    // Still oversized after pruning: drop the oldest entries wholesale rather
    // than let the map grow unbounded.
    if (memoryHits.size > MAX_TRACKED_KEYS) {
      for (const k of [...memoryHits.keys()].slice(0, memoryHits.size - MAX_TRACKED_KEYS)) {
        memoryHits.delete(k);
      }
    }
  }

  const hits = (memoryHits.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    memoryHits.set(key, hits);
    return false;
  }
  hits.push(now);
  memoryHits.set(key, hits);
  return true;
}

async function check(
  limiter: Ratelimit | null,
  key: string,
  limit: number,
  label: string,
): Promise<boolean> {
  // Namespaced by label so the fallback mirrors the distinct Redis `prefix`
  // each limiter uses. Without this the limiters share one bucket per key —
  // and since sessions keys on IP while generate and suggest key on
  // `sessionId ?? IP`, they collide on every guest and the effective limit
  // becomes the smallest of the three.
  if (!limiter) return checkInMemory(`${label}:${key}`, limit);
  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch (err) {
    // Redis unreachable. Denying every request would turn a cache outage into
    // a full outage, so default to allowing unless explicitly told otherwise.
    console.error(`[rate-limit] ${label} check failed:`, err);
    return !failClosed;
  }
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Per-IP limit on session creation — 10/minute. */
export async function checkSessionRateLimit(ip: string): Promise<boolean> {
  return check(sessionsLimiter, ip, SESSIONS_LIMIT, "sessions");
}

/** Per-session (or per-IP, before a session exists) limit on generation — 20/minute. */
export async function checkGenerateRateLimit(key: string): Promise<boolean> {
  return check(generateLimiter, key, GENERATE_LIMIT, "generate");
}

/** Per-session (or per-IP) limit on AI Stylist face scans — 6/minute. */
export async function checkSuggestRateLimit(key: string): Promise<boolean> {
  return check(suggestLimiter, key, SUGGEST_LIMIT, "suggest");
}
