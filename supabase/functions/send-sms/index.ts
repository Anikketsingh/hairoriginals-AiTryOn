// supabase/functions/send-sms/index.ts
//
// Supabase Auth "Send SMS" hook — routes phone OTP delivery by country.
//
//   +91          → Nimbus (SMS_INDIA_PROVIDER, ~35-50x cheaper, holds the DLT
//                  registration), falling back to Twilio on failure
//   everything   → Twilio Programmable Messaging
//   else
//
// Supabase Auth still generates and verifies the OTP and issues the session.
// It only delegates *delivery*: on signInWithOtp() it POSTs { user, sms: { otp } }
// here, signed with the Standard Webhooks scheme.
//
// This function is the ONLY server-side code on the OTP send path —
// signInWithOtp() goes browser → Supabase directly and never touches a Next.js
// route, so no API middleware can gate it. The country allowlist here is
// therefore the last line of defense against SMS pumping fraud before money is
// spent. See routing.ts.
//
// Secrets: SEND_SMS_HOOK_SECRET, SMS_ALLOWED_COUNTRIES, SMS_INDIA_PROVIDER,
//          SMS_INDIA_FALLBACK, plus the per-provider secrets in providers/.

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import {
  normalizeE164,
  parseAllowlist,
  providerFor,
  resolveCountry,
  type Provider,
} from "./routing.ts";
import { sendViaNimbus } from "./providers/nimbus.ts";
import { isTwilioConfigured, sendViaTwilio } from "./providers/twilio.ts";
import type { SendResult } from "./providers/types.ts";

interface SendSmsPayload {
  user: { phone?: string };
  sms: { otp: string };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Error response in the shape Supabase Auth expects.
 *
 * `http_code` inside the body is required: per the Send SMS hook contract, if
 * it is absent Auth defaults the client-facing response to a bare 500 and the
 * message is lost. Omitting it is what turned a legible "unresolvable country"
 * into an opaque `POST /auth/v1/otp 500` during the cutover.
 */
function fail(message: string, status: number): Response {
  return json({ error: { http_code: status, message } }, status);
}

function send(provider: Provider, e164: string, otp: string): Promise<SendResult> {
  return provider === "nimbus" ? sendViaNimbus(e164, otp) : sendViaTwilio(e164, otp);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return fail("Method not allowed", 405);
  }

  // 1. Verify the Standard Webhooks signature. The secret is stored/env'd with
  //    the "v1,whsec_" prefix; the library expects the base64 part only.
  const rawSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!rawSecret) {
    console.error("[send-sms] SEND_SMS_HOOK_SECRET is not set");
    return fail("Hook is not configured", 500);
  }

  const rawBody = await request.text();
  let payload: SendSmsPayload;
  try {
    const wh = new Webhook(rawSecret.replace(/^v1,whsec_/, ""));
    payload = wh.verify(rawBody, {
      "webhook-id": request.headers.get("webhook-id") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
    }) as SendSmsPayload;
  } catch (err) {
    console.error("[send-sms] signature verification failed:", err);
    return fail("Invalid signature", 401);
  }

  // 2. Normalize to canonical E.164 before anything else touches the number.
  //    Supabase hands us bare digits ("919876543210"), not the "+91…" the
  //    client passed to signInWithOtp(); Twilio's `To` requires the `+`. Doing
  //    this once here is what keeps both providers correct.
  const e164 = normalizeE164(payload.user?.phone);
  const otp = payload.sms?.otp;
  if (!e164 || !otp) {
    return fail("Missing phone or otp in payload", 400);
  }

  // 3. Resolve the destination country. Unresolvable numbers are rejected —
  //    we never guess and send.
  const country = resolveCountry(e164);
  if (!country) {
    console.error(`[send-sms] unresolvable country for prefix ${e164.slice(0, 6)}`);
    return fail("That doesn't look like a valid mobile number.", 400);
  }

  // 4. Allowlist check — before any provider call, so a rejected country costs
  //    nothing. Mirrors Twilio Geo Permissions; both must be kept in sync.
  const allowlist = parseAllowlist(Deno.env.get("SMS_ALLOWED_COUNTRIES"));
  if (!allowlist.has(country)) {
    console.warn(`[send-sms] blocked non-allowlisted country: ${country}`);
    return fail("We can't send codes to that country yet.", 403);
  }

  // 4. Route.
  const indiaProvider: Provider =
    Deno.env.get("SMS_INDIA_PROVIDER") === "twilio" ? "twilio" : "nimbus";
  const primary = providerFor(country, indiaProvider);

  let result: SendResult;
  try {
    result = await send(primary, e164, otp);
  } catch (err) {
    console.error(`[send-sms] ${primary} threw:`, err);
    result = { ok: false, retryable: true, message: "SMS provider request failed" };
  }

  if (result.ok) {
    console.log(`[send-sms] delivered country=${country} provider=${primary}`);
    return json({}, 200);
  }

  // 5. India fallback. Nimbus failing would otherwise kill signups in the
  //    largest market outright, since a non-OK response just surfaces an error
  //    string and the funnel dies there. One retry through Twilio costs ~₹7 and
  //    saves the customer. Logged loudly so the Nimbus failure rate stays
  //    visible rather than being silently absorbed.
  const fallbackEligible =
    primary === "nimbus" &&
    result.retryable &&
    Deno.env.get("SMS_INDIA_FALLBACK") === "true" &&
    isTwilioConfigured();

  if (fallbackEligible) {
    console.warn(`[send-sms] nimbus failed (${result.message}) — falling back to twilio`);
    try {
      const fallback = await sendViaTwilio(e164, otp);
      if (fallback.ok) {
        console.log(`[send-sms] delivered country=${country} provider=twilio (fallback)`);
        return json({}, 200);
      }
      console.error(`[send-sms] twilio fallback also failed: ${fallback.message}`);
      result = fallback;
    } catch (err) {
      console.error("[send-sms] twilio fallback threw:", err);
    }
  }

  // Surface the failure so signInWithOtp() reports it to the UI.
  //
  // A non-retryable failure means the input is wrong (bad national-number
  // length, invalid destination) and will fail identically on every retry —
  // that is a 400, not a 502. Reporting it as 502 blamed the gateway for a
  // client error and told the user to "try again in a moment", which never
  // helps.
  return fail(result.message, result.retryable ? 502 : 400);
});
