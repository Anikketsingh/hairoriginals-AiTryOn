#!/usr/bin/env node
/**
 * scripts/probe-send-sms.mjs
 *
 * Sends a correctly-signed Send SMS hook request straight to a deployed edge
 * function, bypassing Supabase Auth entirely.
 *
 * Why this exists: the send_sms hook can only be exercised through a real
 * signInWithOtp() call, which means repointing the production hook — you cannot
 * validate a new function without first cutting over every user to it. That is
 * how a broken build reached production once already.
 *
 * This probes the deployed function directly while the hook still points at the
 * old one, so routing, allowlisting, and real SMS delivery can all be confirmed
 * before any user is affected.
 *
 * Reads SEND_SMS_HOOK_SECRET from .env / .env.local. Never prints it.
 *
 * Usage:
 *   node scripts/probe-send-sms.mjs <slug> <phone> [otp]
 *
 *   # routing only — invalid number, cannot deliver, costs nothing
 *   node scripts/probe-send-sms.mjs send-sms 919
 *
 *   # REAL delivery test — sends an actual SMS to your own phone
 *   node scripts/probe-send-sms.mjs send-sms 919876543210 123456
 *
 * Pass the phone as bare digits with country code (919876543210), which is the
 * form Supabase actually hands the hook.
 */

import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const PROJECT_REF = "kvlwtouwwhxmqijohnjb";

function loadSecret() {
  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;
    const match = readFileSync(file, "utf8").match(/^SEND_SMS_HOOK_SECRET=(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "").replace(/^v1,whsec_/, "");
  }
  throw new Error("SEND_SMS_HOOK_SECRET not found in .env or .env.local");
}

const args = process.argv.slice(2);
const confirmedSend = args.includes("--send");
const [slug, phone, otp = "000000"] = args.filter((a) => a !== "--send");
if (!slug || !phone) {
  console.error("usage: node scripts/probe-send-sms.mjs <slug> <phone-digits> [otp] [--send]");
  process.exit(2);
}

/**
 * Refuse deliverable numbers unless --send is passed.
 *
 * Without this guard it is far too easy to loop this script over a list of
 * countries "just to check routing" and bill a real SMS for each one — to
 * numbers that may belong to actual people. Routing and allowlist behaviour can
 * be verified with a short number, which is rejected before any provider call.
 */
if (phone.replace(/\D/g, "").length >= 10 && !confirmedSend) {
  console.error(`refusing to probe ${phone}: that length is deliverable and would bill a real SMS.

  To check ROUTING or the ALLOWLIST without sending, use a short number —
  it is rejected before any provider is called:
      node scripts/probe-send-sms.mjs ${slug} ${phone.replace(/\\D/g, "").slice(0, 4)}

  To genuinely send to a handset you control, opt in explicitly:
      node scripts/probe-send-sms.mjs ${slug} ${phone} ${otp} --send`);
  process.exit(2);
}

const key = Buffer.from(loadSecret(), "base64");
const url = `https://${PROJECT_REF}.supabase.co/functions/v1/${slug}`;
const body = JSON.stringify({ user: { phone }, sms: { otp } });
const id = `probe_${Date.now()}`;
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;

const digits = phone.replace(/\D/g, "");
const couldDeliver = digits.length >= 10;
console.log(`→ ${url}`);
console.log(`  phone=${phone}  otp=${otp}`);
if (couldDeliver) {
  console.log("  ⚠️  this number looks deliverable — a REAL SMS may be sent and billed");
}

const started = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": signature,
  },
  body,
});
const text = await res.text();
const ms = Date.now() - started;

console.log(`\n← HTTP ${res.status}  (${ms}ms)`);
console.log(`  ${text}`);

// The hook must answer well inside Supabase's 5-second timeout, or Auth reports
// a failure regardless of whether the SMS actually went out.
if (ms > 4000) console.log(`\n  ⚠️  ${ms}ms is close to the 5s hook timeout`);

if (res.status === 200) {
  console.log("\n  ✅ delivered — check the handset");
} else if (res.status === 403) {
  console.log("\n  ⛔ blocked by the country allowlist, before any provider call — nothing billed");
} else if (res.status === 400) {
  // 400 covers BOTH a pre-provider rejection (unresolvable country, bad NSN
  // length) AND a provider call that failed permanently (invalid destination,
  // account misconfiguration). The status alone cannot tell them apart, so
  // don't claim nothing was called — that mislead cost real debugging time.
  console.log("\n  ⛔ permanent failure — retrying will not help");
  console.log("     Either rejected before the provider (bad number/country),");
  console.log("     or the provider refused it. Check Edge Function logs:");
  console.log("     a 'TWILIO ACCOUNT MISCONFIGURED' line means the account itself");
  console.log("     is blocked (e.g. Trust Hub KYC not approved), not this number.");
} else if (res.status === 502) {
  console.log("\n  ❌ provider failed, retryable — check Edge Function logs for the gateway response");
}
process.exit(res.status === 200 ? 0 : 1);
