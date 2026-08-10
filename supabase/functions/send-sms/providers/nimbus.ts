// supabase/functions/send-sms/providers/nimbus.ts
//
// Nimbus SMS — India only.
//
// Nimbus is an Indian domestic gateway operating on TRAI DLT-registered
// templates. It cannot deliver outside India, and the DLT regime has no
// analogue elsewhere, so this provider is hard-scoped to +91 by the router.
//
// It stays the India route because it is roughly 35-50x cheaper than Twilio
// for Indian delivery (~₹0.20 vs ~₹7.30 per SMS) and already holds the
// registered entity/template.
//
// Secrets: NIMBUS_USER_ID, NIMBUS_PASSWORD, NIMBUS_SENDER_ID,
//          NIMBUS_ENTITY_ID, NIMBUS_TEMPLATE_ID, NIMBUS_OTP_TEMPLATE

import { requireEnv, type SendResult } from "./types.ts";

// HTTPS, not HTTP: credentials and the OTP travel in the query string, so
// plaintext transport exposed all of them to any on-path observer.
const NIMBUS_URL = "https://nimbusit.biz/api/SmsApi/SendSingleApi";

const INDIA_NSN_LENGTH = 10;

interface NimbusResponse {
  Status?: "OK" | "WARNING" | "ERROR";
  Response?: { Message?: string };
}

export async function sendViaNimbus(e164: string, otp: string): Promise<SendResult> {
  // Nimbus wants the bare 10-digit national number. Derive it by stripping the
  // +91 prefix specifically — NOT by `.slice(-10)`, which silently truncated
  // the country code off any non-India number and misrouted it here.
  const nsn = e164.replace(/^\+91/, "").replace(/\D/g, "");
  if (nsn.length !== INDIA_NSN_LENGTH) {
    return { ok: false, retryable: false, message: "Please enter a valid 10-digit mobile number." };
  }

  const template = requireEnv("NIMBUS_OTP_TEMPLATE");
  const message = template.replace(/\{otp\}/g, otp);

  // Build the query manually with encodeURIComponent so spaces encode as %20
  // (not +) — the carrier byte-compares this against the DLT-registered
  // template and rejects with TEMPLATE_ERROR on any mismatch.
  const query = ([
    ["UserID", requireEnv("NIMBUS_USER_ID")],
    ["Password", requireEnv("NIMBUS_PASSWORD")],
    ["SenderID", requireEnv("NIMBUS_SENDER_ID")],
    ["Phno", nsn],
    ["Msg", message],
    ["EntityID", requireEnv("NIMBUS_ENTITY_ID")],
    ["TemplateID", requireEnv("NIMBUS_TEMPLATE_ID")],
  ] as [string, string][])
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  let body: NimbusResponse;
  try {
    const res = await fetch(`${NIMBUS_URL}?${query}`, { method: "GET" });
    body = (await res.json()) as NimbusResponse;
  } catch (err) {
    console.error("[send-sms] nimbus request failed:", err);
    // Transport failure — worth retrying through the fallback provider.
    return { ok: false, retryable: true, message: "SMS provider request failed" };
  }

  if (body.Status !== "OK") {
    console.error("[send-sms] nimbus returned non-OK:", JSON.stringify(body));
    return {
      ok: false,
      retryable: true,
      message: body.Response?.Message ?? "Failed to send OTP",
    };
  }

  return { ok: true };
}
