/**
 * lib/webhooks/crm-payload.ts
 *
 * Maps our internal lead event payload (produced in lib/leads.ts) to the body
 * we POST to the DC CRM (Digicuro) vendor-lead endpoint. Per Digicuro's final
 * spec (see docs/crm-outbound-payload-spec.md), they read a small set of
 * top-level fields (phone/email/name/source/lead_type/note), a set of marketing
 * fields they surface as the lead's "Marketing Parameters" panel, and store the
 * whole `metadata` object verbatim on the lead's touchpoint — that's where all
 * the app-specific detail (ids, products, images) lives, and images render on
 * the lead from there. `phone`/`email` are the dedup keys.
 *
 * Server-only (pure — no I/O).
 */

import { PARAM_KEYS, type Attribution } from "@/lib/attribution";

/** Sent as the touchpoint's source attribution (their `source` field). */
const CRM_SOURCE = "HairOriginals AI Try-On";
/** Their `note` free-text cap. */
const NOTE_MAX = 2000;

/**
 * Digicuro's vendor spec documents utm_source / utm_medium / utm_campaign /
 * campaign / landing_url / referrer, but their CRM UI renders five more
 * (Content, Term, Campaign ID, Ad ID, Meta click ID) that appear in no field
 * table — so the key names below are inferred. See
 * docs/digicuro-followup-requests.md §3.
 *
 * Probed against their live endpoint on 2026-08-14: unknown top-level keys are
 * accepted and silently ignored (even a nonsense key returns 201), so sending
 * these costs nothing and cannot dead-letter a lead. The flip side is that a
 * 201 is no proof they were *stored* — hence `metadata.marketing`, which their
 * spec guarantees is kept verbatim, carries the same values unconditionally.
 *
 * The switch stays as cheap insurance in case they tighten validation later:
 * set CRM_SEND_EXTENDED_MARKETING=false in Vercel to drop these six without a
 * redeploy.
 */
function sendExtendedMarketing(): boolean {
  return process.env.CRM_SEND_EXTENDED_MARKETING !== "false";
}

interface LookSummary {
  resultUrl: string | null;
  originalPhotoUrl: string | null;
  productName: string | null;
  createdAt: string;
}

interface ProductSummary {
  id: string;
  name: string;
  price: number | null;
}

/** The Digicuro vendor-lead body. Only `phone`/`email` are dedup keys. */
export interface CrmLeadBody {
  event: string; // lead.created | lead.updated (also sent as X-Event-Type)
  source: string; // "HairOriginals AI Try-On"
  name?: string;
  phone?: string;
  email?: string;
  note?: string;

  // ── marketing attribution (documented by Digicuro) ──
  campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  landing_url?: string;
  referrer?: string;

  // ── marketing attribution (inferred; see sendExtendedMarketing) ──
  utm_content?: string;
  utm_term?: string;
  campaign_id?: string;
  ad_id?: string;
  meta_click_id?: string;
  fbclid?: string;

  /** Stored verbatim on the lead; images render from here. */
  metadata: {
    appLeadId: string | null;
    userId: string | null;
    sessionId: string | null;
    occurredAt: string;
    source: string | null; // our internal enum: registration | guest_tryon | ...
    generationsCount: number | null;
    products: ProductSummary[];
    generatedLookUrl: string | null;
    originalPhotoUrl: string | null;
    looks: LookSummary[];
    /** Full attribution, un-gated — the safety net if the top-level keys miss. */
    marketing?: Record<string, string>;
    landing?: { url?: string; path?: string; referrer?: string; landedAt?: string };
  };
}

/** Does this payload carry at least one dedup key (phone/email) Digicuro needs? */
export function hasContact(payload: Record<string, unknown>): boolean {
  return Boolean(payload.phone) || Boolean(payload.email);
}

/** Short human summary for the lead timeline, e.g. "3 try-on(s), latest: Silk Base Topper". */
function buildNote(payload: Record<string, unknown>): string {
  const count = (payload.generationsCount as number | undefined) ?? 0;
  const looks = (payload.looks as LookSummary[] | undefined) ?? [];
  const products = (payload.products as ProductSummary[] | undefined) ?? [];
  const latest = looks[0]?.productName ?? products[0]?.name ?? null;
  const note = `${count} try-on(s)${latest ? `, latest: ${latest}` : ""}`;
  return note.slice(0, NOTE_MAX);
}

/** A non-empty string, or undefined — so callers can skip absent values wholesale. */
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Merge the visitor's first-touch attribution into the outbound body.
 *
 * Absent values are omitted rather than sent as null, deliberately. We keep no
 * copy of the attribution ourselves (lib/attribution.ts), so it rides in on a
 * request cookie — and refreshLeadActivity fires a lead.updated on *every*
 * completed try-on, some from paths where the cookie may be gone. Sending null
 * there would blank out the campaign Digicuro already recorded against the
 * lead; omitting the key leaves their stored value alone.
 */
function applyAttribution(body: CrmLeadBody, attribution: Attribution | null | undefined): void {
  if (!attribution) return;

  const marketing: Record<string, string> = {};
  for (const key of PARAM_KEYS) {
    const value = str(attribution[key]);
    if (value) marketing[key] = value;
  }

  const landing = {
    url: str(attribution.landing_url),
    path: str(attribution.landing_path),
    referrer: str(attribution.referrer),
    landedAt: str(attribution.landed_at),
  };

  // Un-gated: Digicuro stores metadata verbatim, so this is where the data is
  // guaranteed to land regardless of which top-level keys they actually read.
  if (Object.keys(marketing).length > 0) body.metadata.marketing = marketing;
  if (Object.values(landing).some(Boolean)) body.metadata.landing = landing;

  // Confirmed by Digicuro's documented request body.
  if (marketing.utm_source) body.utm_source = marketing.utm_source;
  if (marketing.utm_medium) body.utm_medium = marketing.utm_medium;
  if (marketing.utm_campaign) {
    body.utm_campaign = marketing.utm_campaign;
    // Their `campaign` field is the human-readable campaign name, which for our
    // Meta URL template is the same value as utm_campaign.
    body.campaign = marketing.utm_campaign;
  }
  if (landing.url) body.landing_url = landing.url;
  if (landing.referrer) body.referrer = landing.referrer;

  if (!sendExtendedMarketing()) return;

  if (marketing.utm_content) body.utm_content = marketing.utm_content;
  if (marketing.utm_term) body.utm_term = marketing.utm_term;
  if (marketing.campaign_id) body.campaign_id = marketing.campaign_id;
  if (marketing.ad_id) body.ad_id = marketing.ad_id;
  // Sent under both names — their UI labels it "Meta click ID", but `fbclid` is
  // the canonical param. Whichever they read, the other is ignored.
  if (marketing.fbclid) {
    body.meta_click_id = marketing.fbclid;
    body.fbclid = marketing.fbclid;
  }
}

/** Transform our event payload + type into Digicuro's vendor-lead body. */
export function toCrmLeadBody(payload: Record<string, unknown>, eventType: string): CrmLeadBody {
  const name = (payload.name as string | null | undefined) ?? undefined;
  const phone = (payload.phone as string | null | undefined) ?? undefined;
  const email = (payload.email as string | null | undefined) ?? undefined;

  const body: CrmLeadBody = {
    event: eventType,
    source: CRM_SOURCE,
    note: buildNote(payload),
    metadata: {
      appLeadId: (payload.leadId as string | null | undefined) ?? null,
      userId: (payload.userId as string | null | undefined) ?? null,
      sessionId: (payload.sessionId as string | null | undefined) ?? null,
      occurredAt: (payload.occurredAt as string | undefined) ?? new Date().toISOString(),
      source: (payload.source as string | null | undefined) ?? null,
      generationsCount: (payload.generationsCount as number | null | undefined) ?? null,
      products: (payload.products as ProductSummary[] | undefined) ?? [],
      generatedLookUrl: (payload.generatedLookUrl as string | null | undefined) ?? null,
      originalPhotoUrl: (payload.originalPhotoUrl as string | null | undefined) ?? null,
      looks: (payload.looks as LookSummary[] | undefined) ?? [],
    },
  };
  if (name) body.name = name;
  if (phone) body.phone = phone;
  if (email) body.email = email;
  applyAttribution(body, payload.attribution as Attribution | null | undefined);
  return body;
}
