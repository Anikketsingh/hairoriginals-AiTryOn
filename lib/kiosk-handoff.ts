/**
 * lib/kiosk-handoff.ts
 *
 * Standee → phone handoff. A standee visit gets one random token; its QR
 * code opens /s/<token> on the visitor's phone, where they enter their
 * number and get their looks + offers. The token is the phone's only
 * credential, so it is long and random and expires:
 *   - unclaimed: CLAIM_WINDOW_MS after the QR was first shown
 *   - claimed:   the standee's downloadLinkTtlHours after the number arrived
 *
 * Server-only.
 */

import { randomBytes } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";
import { getAppBaseUrl } from "@/lib/app-url";
import { resolveKioskConfig } from "@/lib/kiosk-auth";

const CLAIM_WINDOW_MS = 2 * 60 * 60 * 1000;
const LOOK_URL_TTL_SECONDS = 60 * 60;
export const MAX_LOOKS_SMS = 3;

export type KioskLeadEvent =
  | "qr_shown"
  | "qr_scanned"
  | "number_submitted"
  | "photo_link_sent"
  | "home_trial_interest"
  | "whatsapp_clicked"
  | "call_clicked"
  | "store_clicked";

export interface Handoff {
  token: string;
  sessionId: string;
  kioskId: string | null;
  kioskName: string | null;
  downloadLinkTtlHours: number;
  leadId: string | null;
  phone: string | null;
  contactName: string | null;
  smsSentCount: number;
  scannedAt: string | null;
  claimedAt: string | null;
  expired: boolean;
}

export interface Look {
  id: string;
  url: string;
  styleName: string | null;
}

export function handoffUrl(token: string): string {
  return `${getAppBaseUrl()}/s/${token}`;
}

/** "+919876543210" → "+91 98•••••210" — enough for the visitor to recognise, never the full number. */
export function maskPhone(e164: string | null): string | null {
  if (!e164) return null;
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164.replace(/\d(?=\d{3})/g, "•");
  const nsn = parsed.nationalNumber;
  return `+${parsed.countryCallingCode} ${nsn.slice(0, 2)}${"•".repeat(Math.max(0, nsn.length - 5))}${nsn.slice(-3)}`;
}

/** One handoff per visit: reuse it if the QR is shown again. Returns { token, created }. */
export async function getOrCreateHandoff(
  sessionId: string,
  kioskId: string
): Promise<{ token: string; created: boolean } | null> {
  const { data: existing } = await supabaseAdmin
    .from("kiosk_handoffs")
    .select("token")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existing) return { token: existing.token as string, created: false };

  const token = randomBytes(16).toString("base64url");
  const { error } = await supabaseAdmin.from("kiosk_handoffs").insert({
    token,
    session_id: sessionId,
    kiosk_id: kioskId,
    expires_at: new Date(Date.now() + CLAIM_WINDOW_MS).toISOString(),
  });
  if (error) {
    // Lost a race with a concurrent create for the same visit — use theirs.
    const { data: raced } = await supabaseAdmin
      .from("kiosk_handoffs")
      .select("token")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (raced) return { token: raced.token as string, created: false };
    console.error("[kiosk-handoff] create error:", error.message);
    return null;
  }
  return { token, created: true };
}

export async function resolveHandoff(token: string): Promise<Handoff | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await supabaseAdmin
    .from("kiosk_handoffs")
    .select(
      "token, session_id, kiosk_id, lead_id, phone, contact_name, sms_sent_count, scanned_at, claimed_at, expires_at, kiosks(name, config)"
    )
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;

  const kiosk = data.kiosks as { name?: string; config?: unknown } | null;
  return {
    token: data.token as string,
    sessionId: data.session_id as string,
    kioskId: (data.kiosk_id as string | null) ?? null,
    kioskName: kiosk?.name ?? null,
    downloadLinkTtlHours: resolveKioskConfig(kiosk?.config).downloadLinkTtlHours,
    leadId: (data.lead_id as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    contactName: (data.contact_name as string | null) ?? null,
    smsSentCount: (data.sms_sent_count as number) ?? 0,
    scannedAt: (data.scanned_at as string | null) ?? null,
    claimedAt: (data.claimed_at as string | null) ?? null,
    expired: new Date(data.expires_at as string).getTime() < Date.now(),
  };
}

/** Completed looks from the visit, newest first, as short-lived signed URLs. */
export async function getSessionLooks(sessionId: string): Promise<Look[]> {
  const { data: gens } = await supabaseAdmin
    .from("generations")
    .select("id, result_image_path, created_at, products(name)")
    .eq("session_id", sessionId)
    .eq("status", "completed")
    .not("result_image_path", "is", null)
    .order("created_at", { ascending: false });
  if (!gens || gens.length === 0) return [];

  const { data: signed } = await supabaseAdmin.storage
    .from("results")
    .createSignedUrls(
      gens.map((g) => g.result_image_path as string),
      LOOK_URL_TTL_SECONDS
    );

  return gens
    .map((g, i) => ({
      id: g.id as string,
      url: toPublicStorageUrl(signed?.[i]?.signedUrl) ?? "",
      styleName: (g.products as { name?: string } | null)?.name ?? null,
    }))
    .filter((l) => l.url);
}

/** The single /d/<token> link that shows every look from the visit (sent by SMS / WhatsApp). */
export async function getOrCreateSessionDownload(handoff: Handoff): Promise<string | null> {
  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("result_downloads")
    .select("token")
    .eq("session_id", handoff.sessionId)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return `${getAppBaseUrl()}/d/${existing.token}`;

  const token = randomBytes(12).toString("base64url");
  const { error } = await supabaseAdmin.from("result_downloads").insert({
    token,
    session_id: handoff.sessionId,
    kiosk_id: handoff.kioskId,
    expires_at: new Date(Date.now() + handoff.downloadLinkTtlHours * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error("[kiosk-handoff] download link error:", error.message);
    return null;
  }
  return `${getAppBaseUrl()}/d/${token}`;
}

export async function markScanned(handoff: Handoff): Promise<void> {
  if (handoff.scannedAt) return;
  await supabaseAdmin
    .from("kiosk_handoffs")
    .update({ scanned_at: new Date().toISOString() })
    .eq("token", handoff.token)
    .is("scanned_at", null);
  await recordKioskLeadEvent({ handoff, event: "qr_scanned" });
}

/** Store the number on the handoff and extend its life to the download-link lifetime. */
export async function markClaimed(
  handoff: Handoff,
  params: { leadId: string; phone: string; name: string | null }
): Promise<void> {
  await supabaseAdmin
    .from("kiosk_handoffs")
    .update({
      lead_id: params.leadId,
      phone: params.phone,
      contact_name: params.name,
      claimed_at: handoff.claimedAt ?? new Date().toISOString(),
      expires_at: new Date(Date.now() + handoff.downloadLinkTtlHours * 60 * 60 * 1000).toISOString(),
    })
    .eq("token", handoff.token);
}

export async function recordKioskLeadEvent(params: {
  handoff: Pick<Handoff, "token" | "kioskId" | "leadId">;
  event: KioskLeadEvent;
  meta?: Record<string, unknown>;
  leadId?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("kiosk_lead_events").insert({
    lead_id: params.leadId ?? params.handoff.leadId,
    kiosk_id: params.handoff.kioskId,
    handoff_token: params.handoff.token,
    event: params.event,
    meta: params.meta ?? {},
  });
  if (error) console.error("[kiosk-handoff] event insert error:", error.message);
}
