/**
 * lib/rate-limit.ts
 *
 * Rate limiting for the two unauthenticated-by-design endpoints that can
 * otherwise be hammered for free: POST /api/sessions (mints guest credits)
 * and POST /api/generate (burns AI spend per call). Backed by Upstash Redis
 * (REST-based — works from any runtime regardless of deployment target).
 *
 * Requires UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. If unset,
 * limiting fails OPEN (a warning is logged once) rather than blocking local
 * dev entirely — but that means there is currently NO rate limiting in any
 * environment without these set. Provision an Upstash database (a free tier
 * is enough to start) and set both vars before relying on this in production.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let sessionsLimiter: Ratelimit | null = null;
let generateLimiter: Ratelimit | null = null;

if (url && token) {
  const redis = new Redis({ url, token });
  sessionsLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "rl:sessions",
  });
  generateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "rl:generate",
  });
} else {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set — " +
      "rate limiting is disabled. Set both env vars before production."
  );
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Per-IP limit on session creation — 10/minute. Fails open if unconfigured. */
export async function checkSessionRateLimit(ip: string): Promise<boolean> {
  if (!sessionsLimiter) return true;
  const { success } = await sessionsLimiter.limit(ip);
  return success;
}

/** Per-session (or per-IP, before a session exists) limit on generation — 20/minute. */
export async function checkGenerateRateLimit(key: string): Promise<boolean> {
  if (!generateLimiter) return true;
  const { success } = await generateLimiter.limit(key);
  return success;
}
