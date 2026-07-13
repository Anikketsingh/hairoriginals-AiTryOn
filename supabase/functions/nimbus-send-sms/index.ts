// supabase/functions/nimbus-send-sms/index.ts
//
// Supabase Auth "Send SMS" hook — delivers phone OTPs via Nimbus.
//
// Supabase Auth still generates and verifies the OTP and issues the session.
// It only delegates *delivery* to this hook: on signInWithOtp() it POSTs
// { user, sms: { otp } } here (signed with the Standard Webhooks scheme), and
// we forward the code to Nimbus's SendSms API.
//
// The client (components/FunnelGate.tsx) and post-verify flow
// (app/api/auth/complete) are unchanged — only the delivery layer moved from
// Twilio to Nimbus.
//
// Secrets (supabase secrets set / [edge_runtime.secrets] locally):
//   SEND_SMS_HOOK_SECRET  — the hook signing secret (v1,whsec_... base64)
//   NIMBUS_USER_ID, NIMBUS_PASSWORD
//   NIMBUS_SENDER_ID, NIMBUS_ENTITY_ID, NIMBUS_TEMPLATE_ID  — DLT-registered
//   NIMBUS_OTP_TEMPLATE   — DLT template text with an {otp} placeholder,
//                           e.g. "Your HairOriginals code is {otp}. Do not share it."

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const NIMBUS_URL = "http://nimbusit.biz/Api/smsapi/SendSms";

interface SendSmsPayload {
  user: { phone?: string };
  sms: { otp: string };
}

interface NimbusResponse {
  Status?: "OK" | "WARNING" | "ERROR";
  Response?: { Message?: string };
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: { message: "Method not allowed" } }, 405);
  }

  // 1. Verify the Standard Webhooks signature. The secret is stored/env'd with
  //    the "v1,whsec_" prefix; the library expects the base64 part only.
  const rawSecret = requireEnv("SEND_SMS_HOOK_SECRET");
  const base64Secret = rawSecret.replace(/^v1,whsec_/, "");

  const rawBody = await request.text();
  let payload: SendSmsPayload;
  try {
    const wh = new Webhook(base64Secret);
    payload = wh.verify(rawBody, {
      "webhook-id": request.headers.get("webhook-id") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
    }) as SendSmsPayload;
  } catch (err) {
    console.error("[nimbus-send-sms] signature verification failed:", err);
    return json({ error: { message: "Invalid signature" } }, 401);
  }

  const phone = payload.user?.phone?.replace(/\D/g, "");
  const otp = payload.sms?.otp;
  if (!phone || !otp) {
    return json({ error: { message: "Missing phone or otp in payload" } }, 400);
  }

  // 2. Build the message from the DLT-registered template.
  const template = requireEnv("NIMBUS_OTP_TEMPLATE");
  const message = template.replace(/\{otp\}/g, otp);

  // 3. Call Nimbus.
  let nimbus: NimbusResponse;
  try {
    const res = await fetch(NIMBUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        UserId: requireEnv("NIMBUS_USER_ID"),
        Password: requireEnv("NIMBUS_PASSWORD"),
        SenderID: requireEnv("NIMBUS_SENDER_ID"),
        Phno: phone,
        Msg: message,
        EntityID: requireEnv("NIMBUS_ENTITY_ID"),
        TemplateID: requireEnv("NIMBUS_TEMPLATE_ID"),
        FlashMsg: 0,
      }),
    });
    nimbus = (await res.json()) as NimbusResponse;
  } catch (err) {
    console.error("[nimbus-send-sms] Nimbus request failed:", err);
    return json({ error: { message: "SMS provider request failed" } }, 502);
  }

  // 4. Surface non-OK responses so signInWithOtp() reports failure to the UI.
  if (nimbus.Status !== "OK") {
    console.error("[nimbus-send-sms] Nimbus returned non-OK:", nimbus);
    return json(
      { error: { message: nimbus.Response?.Message ?? "Failed to send OTP" } },
      502,
    );
  }

  console.log("[nimbus-send-sms] OTP sent:", nimbus.Response?.Message);
  return json({}, 200);
});
