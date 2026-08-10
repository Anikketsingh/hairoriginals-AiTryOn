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

const [slug, phone, otp = "000000"] = process.argv.slice(2);
if (!slug || !phone) {
  console.error("usage: node scripts/probe-send-sms.mjs <slug> <phone-digits> [otp]");
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
  console.log("\n  ⛔ blocked by the country allowlist (SMS_ALLOWED_COUNTRIES)");
} else if (res.status === 400) {
  console.log("\n  ⛔ rejected as invalid input — no provider was called, nothing billed");
} else if (res.status === 502) {
  console.log("\n  ❌ provider failed — check Edge Function logs for the gateway response");
}
process.exit(res.status === 200 ? 0 : 1);
