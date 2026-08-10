// supabase/functions/send-sms/providers/types.ts
//
// Shared contract every SMS provider implements.

/**
 * Outcome of a single provider send.
 *
 * `retryable` distinguishes "this provider failed, another might work"
 * (transport error, gateway 5xx, throttling) from "this will fail everywhere"
 * (malformed number). Only retryable failures trigger the India → Twilio
 * fallback; retrying an invalid number just spends money to fail twice.
 */
export type SendResult =
  | { ok: true }
  | { ok: false; retryable: boolean; message: string };

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return Deno.env.get(name) ?? fallback;
}
