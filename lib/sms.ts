/**
 * lib/sms.ts
 *
 * Server-side transactional SMS (not OTP). Today the only one is the
 * standee "your looks are ready" link (sendLooksLinkSms).
 *
 * Routing mirrors the OTP hook in supabase/functions/send-sms:
 *   +91       → Nimbus (TRAI DLT). Indian carriers byte-compare the message
 *               against a REGISTERED template, so this needs its own DLT
 *               template, separate from the OTP one:
 *                 NIMBUS_LOOKS_TEMPLATE_ID  — the DLT template id
 *                 NIMBUS_LOOKS_TEMPLATE     — its exact text, with {name}
 *                                             and {link} where the DLT
 *                                             template has {#var#}
 *   elsewhere → Twilio Messaging Service (free-form body).
 *
 * Shared credentials: NIMBUS_USER_ID, NIMBUS_PASSWORD, NIMBUS_SENDER_ID,
 * NIMBUS_ENTITY_ID, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * TWILIO_MESSAGING_SERVICE_SID. These are the same values as the Supabase
 * function secrets, but must ALSO be set in this app's env (Vercel / .env).
 *
 * Server-only.
 */

const NIMBUS_URL = "https://nimbusit.biz/api/SmsApi/SendSingleApi";
const TWILIO_LOOKS_TEMPLATE = "Hi {name}, your HairOriginals try-on looks are ready. View & download: {link}";

export type SmsResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "invalid_number" | "provider_error"; message: string };

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** True when an SMS to this number could be attempted with the current env. */
export function isLooksSmsConfigured(e164: string): boolean {
  if (e164.startsWith("+91")) {
    return ["NIMBUS_USER_ID", "NIMBUS_PASSWORD", "NIMBUS_SENDER_ID", "NIMBUS_ENTITY_ID", "NIMBUS_LOOKS_TEMPLATE_ID", "NIMBUS_LOOKS_TEMPLATE"].every(
      (k) => env(k)
    );
  }
  return ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID"].every((k) => env(k));
}

/** Text the visitor the link to all their looks from a standee visit. */
export async function sendLooksLinkSms(e164: string, vars: { name: string; link: string }): Promise<SmsResult> {
  if (!isLooksSmsConfigured(e164)) {
    return { ok: false, reason: "not_configured", message: "SMS isn't set up for this number yet." };
  }
  return e164.startsWith("+91") ? sendViaNimbus(e164, vars) : sendViaTwilio(e164, vars);
}

async function sendViaNimbus(e164: string, vars: { name: string; link: string }): Promise<SmsResult> {
  const nsn = e164.replace(/^\+91/, "").replace(/\D/g, "");
  if (nsn.length !== 10) return { ok: false, reason: "invalid_number", message: "Invalid Indian mobile number." };

  // DLT variables are capped (30 chars each on most operators) — trim the
  // name rather than have the carrier reject the whole message.
  const message = fill(env("NIMBUS_LOOKS_TEMPLATE")!, { name: vars.name.slice(0, 30), link: vars.link });

  // encodeURIComponent so spaces go as %20, not + (the DLT match is byte-exact).
  const query = (
    [
      ["UserID", env("NIMBUS_USER_ID")!],
      ["Password", env("NIMBUS_PASSWORD")!],
      ["SenderID", env("NIMBUS_SENDER_ID")!],
      ["Phno", nsn],
      ["Msg", message],
      ["EntityID", env("NIMBUS_ENTITY_ID")!],
      ["TemplateID", env("NIMBUS_LOOKS_TEMPLATE_ID")!],
    ] as [string, string][]
  )
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  try {
    const res = await fetch(`${NIMBUS_URL}?${query}`, { method: "GET" });
    const body = (await res.json().catch(() => ({}))) as { Status?: string; Response?: { Message?: string } };
    if (body.Status !== "OK") {
      console.error("[sms] nimbus non-OK:", JSON.stringify(body));
      return { ok: false, reason: "provider_error", message: body.Response?.Message ?? "SMS failed." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[sms] nimbus request failed:", err);
    return { ok: false, reason: "provider_error", message: "SMS provider unreachable." };
  }
}

async function sendViaTwilio(e164: string, vars: { name: string; link: string }): Promise<SmsResult> {
  const sid = env("TWILIO_ACCOUNT_SID")!;
  const token = env("TWILIO_AUTH_TOKEN")!;
  const form = new URLSearchParams({
    To: e164,
    MessagingServiceSid: env("TWILIO_MESSAGING_SERVICE_SID")!,
    Body: fill(TWILIO_LOOKS_TEMPLATE, vars),
  });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (res.ok) return { ok: true };
    const err = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    console.error(`[sms] twilio rejected: http=${res.status} code=${err.code ?? "?"} ${err.message ?? ""}`);
    return { ok: false, reason: "provider_error", message: "SMS failed." };
  } catch (err) {
    console.error("[sms] twilio request failed:", err);
    return { ok: false, reason: "provider_error", message: "SMS provider unreachable." };
  }
}
