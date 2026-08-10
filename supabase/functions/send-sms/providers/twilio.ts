// supabase/functions/send-sms/providers/twilio.ts
//
// Twilio Programmable Messaging — all non-India markets.
//
// Deliberately NOT Twilio Verify. Supabase Auth already generates, stores,
// expires, and verifies the OTP for free; Verify would duplicate all of that
// for an extra $0.05 per successful verification — roughly 4x the total US
// cost per signup ($0.062 vs $0.017). We only need delivery.
//
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//          TWILIO_MESSAGING_SERVICE_SID, TWILIO_OTP_TEMPLATE (optional)

import { requireEnv, optionalEnv, type SendResult } from "./types.ts";

const DEFAULT_TEMPLATE = "Your HairOriginals code is {otp}. Do not share it.";

/**
 * A GSM-7 SMS holds 160 characters in one segment. At 161 it splits and every
 * per-message price doubles — which at UAE/Germany rates (~$0.11/segment) is
 * the difference between a $246/mo bill and a $492/mo one.
 */
const GSM7_SINGLE_SEGMENT_LIMIT = 160;

/**
 * Twilio error codes that will fail identically on any retry, so the caller
 * should surface them rather than burning a fallback send.
 *   21211 — invalid 'To' number
 *   21408 — no permission to send to this region (Geo Permissions)
 *   21606 — 'From' not a valid, SMS-capable sender
 *   21610 — recipient has unsubscribed
 *   21614 — 'To' is not a mobile number
 *   20003 — permission denied (see CONFIG_ERROR_CODES)
 */
const PERMANENT_ERROR_CODES = new Set([21211, 21408, 21606, 21610, 21614, 20003]);

/**
 * Account-level misconfiguration: nothing about the request is wrong, and no
 * number will ever work until an operator fixes the Twilio account itself.
 *
 *   20003 — permission denied. Twilio reuses this for BOTH bad credentials and
 *           an unapproved Trust Hub compliance profile ("Primary compliance
 *           profile is not approved… complete the KYC process"). The latter
 *           blocks every send on a brand-new account regardless of credentials,
 *           sender pool, or Geo Permissions, so it must be distinguishable in
 *           logs from an ordinary delivery failure.
 *   21703 — Messaging Service not found or not authorized for this account
 *   21704 — Messaging Service sender pool is empty
 */
const CONFIG_ERROR_CODES = new Set([20003, 21703, 21704]);

interface TwilioError {
  code?: number;
  message?: string;
  status?: number;
}

/** True when Twilio is configured well enough to attempt a send. */
export function isTwilioConfigured(): boolean {
  return Boolean(
    Deno.env.get("TWILIO_ACCOUNT_SID") &&
      Deno.env.get("TWILIO_AUTH_TOKEN") &&
      Deno.env.get("TWILIO_MESSAGING_SERVICE_SID"),
  );
}

export async function sendViaTwilio(e164: string, otp: string): Promise<SendResult> {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = requireEnv("TWILIO_MESSAGING_SERVICE_SID");

  const template = optionalEnv("TWILIO_OTP_TEMPLATE", DEFAULT_TEMPLATE);
  const body = template.replace(/\{otp\}/g, otp);

  if (body.length > GSM7_SINGLE_SEGMENT_LIMIT) {
    console.warn(
      `[send-sms] twilio body is ${body.length} chars — over the ${GSM7_SINGLE_SEGMENT_LIMIT}-char single-segment limit, so this send bills as 2+ segments`,
    );
  }

  // Send the number exactly as Supabase gave it. Twilio requires full E.164 —
  // this is the path where the old `.slice(-10)` truncation corrupted every
  // international number.
  //
  // MessagingServiceSid, not From: the service holds a sender pool and Twilio
  // picks the compliant sender per destination (alphanumeric ID for UK/DE/SG,
  // a 10DLC long code for US/CA). A single From number is illegal or
  // undeliverable in most of our target markets.
  const form = new URLSearchParams({
    To: e164,
    MessagingServiceSid: messagingServiceSid,
    Body: body,
  });

  let res: Response;
  try {
    res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      },
    );
  } catch (err) {
    console.error("[send-sms] twilio request failed:", err);
    return { ok: false, retryable: true, message: "SMS provider request failed" };
  }

  if (res.ok) return { ok: true };

  let error: TwilioError = {};
  try {
    error = (await res.json()) as TwilioError;
  } catch {
    // Non-JSON error body — fall through with the HTTP status alone.
  }

  const permanent = error.code !== undefined && PERMANENT_ERROR_CODES.has(error.code);
  const misconfigured = error.code !== undefined && CONFIG_ERROR_CODES.has(error.code);

  if (misconfigured) {
    // Shout, because this affects every send until someone fixes the account —
    // it is not a per-message failure and no amount of retrying will clear it.
    console.error(
      `[send-sms] TWILIO ACCOUNT MISCONFIGURED (code=${error.code}) — ALL sends will fail until fixed: ${error.message ?? "(none)"}`,
    );
  } else {
    console.error(
      `[send-sms] twilio rejected send: http=${res.status} code=${error.code ?? "?"} permanent=${permanent} msg=${error.message ?? "(none)"}`,
    );
  }

  return {
    ok: false,
    // 5xx and 429 are transient; a known-permanent code never is.
    retryable: !permanent && (res.status >= 500 || res.status === 429),
    message: userFacingMessage(error.code),
  };
}

/**
 * Twilio's raw messages leak internal detail ("The 'To' number +44... is not a
 * valid phone number"), so map the codes a real user can actually hit onto
 * copy that tells them what to do.
 */
function userFacingMessage(code: number | undefined): string {
  switch (code) {
    case 21211:
    case 21614:
      return "That doesn't look like a valid mobile number. Please check and try again.";
    case 21408:
      return "We can't send codes to that country yet.";
    case 21610:
      return "This number has opted out of messages from us.";
    case 20003:
    case 21703:
    case 21704:
      // Never tell someone to "try again in a moment" for an account-level
      // fault — retrying cannot possibly help, and inviting it just burns
      // their time and our rate limits.
      return "We're unable to send codes right now. Please try again later.";
    default:
      return "We couldn't send your code. Please try again in a moment.";
  }
}
