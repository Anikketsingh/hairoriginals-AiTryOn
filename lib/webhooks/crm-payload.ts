/**
 * lib/webhooks/crm-payload.ts
 *
 * Maps our internal lead event payload (produced in lib/leads.ts) to the body
 * we POST to the DC CRM (Digicuro) vendor-lead endpoint. Per Digicuro's final
 * spec (see docs/crm-outbound-payload-spec.md), they read a small set of
 * top-level fields (phone/email/name/source/lead_type/note) and store the whole
 * `metadata` object verbatim on the lead's touchpoint — that's where all the
 * app-specific detail (ids, products, images) lives, and images render on the
 * lead from there. `phone`/`email` are the dedup keys.
 *
 * Server-only (pure — no I/O).
 */

/** Sent as the touchpoint's source attribution (their `source` field). */
const CRM_SOURCE = "HairOriginals AI Try-On";
/** Their `note` free-text cap. */
const NOTE_MAX = 2000;

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
  return body;
}
