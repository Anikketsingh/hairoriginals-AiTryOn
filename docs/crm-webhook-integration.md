# HairOriginals AI Try-On → DC CRM (Digicuro) — Integration Note

**Audience:** HairOriginals AI Try-On app team (internal).
**Status:** v3 — conformed to Digicuro's real `vendor-lead` intake webhook.

This is our **internal** note for how the app pushes leads into the DC CRM. Digicuro is
**reconfiguring their vendor-lead connector to accept our payload** (rich, explicit shape — leads,
products, and images as first-class fields). The full contract we handed them is
[`crm-outbound-payload-spec.md`](./crm-outbound-payload-spec.md). The integration is **one-way**:

```
  HairOriginals app  ──── lead.created / lead.updated ────▶  DC CRM (Digicuro)
   (sender)                (Bearer-auth HTTPS POST)           (master; dedups on phone/email)
```

There is **no inbound path** — Digicuro's intake webhook does not push lead-status changes back to
us. The old two-way callback route (`/api/webhooks/crm`) and `CRM_INBOUND_SECRET` have been removed.
Restoring two-way is an open item with Digicuro (see §6).

---

## 1. Endpoint (the target)

- **URL:** `POST` the endpoint Digicuro provides for our format → `CRM_WEBHOOK_URL`.
- **Content-Type:** `application/json`
- **Auth:** `Authorization: Bearer <token>` (issued by Digicuro) → `CRM_WEBHOOK_TOKEN`.
- **Header:** `X-Event-Type: lead.created | lead.updated` (also in the body as `event`).
- **Dedup:** Digicuro dedups on `phone`/`email` (and can use our stable `appLeadId`), so re-posting
  the same person does not create duplicates.

---

## 2. What we send — payload

Built in `lib/webhooks/crm-payload.ts` (`toCrmLeadBody`). Full spec + JSON samples:
[`crm-outbound-payload-spec.md`](./crm-outbound-payload-spec.md). Per Digicuro's final spec, a few
fields are read at the **top level**; everything app-specific is nested under **`metadata`** (stored
verbatim; images render on the lead from there).

| Location | Field | Source |
|---|---|---|
| top | `event` | `lead.created` / `lead.updated` |
| top | `source` | constant `"HairOriginals AI Try-On"` |
| top | `name` / `phone` / `email` | `users` (via `resolveContact`); phone/email are the dedup keys |
| top | `note` | short summary e.g. `"3 try-on(s), latest: Silk Base Topper"` |
| `metadata` | `appLeadId` | our `leads.id` (stable reconciliation key; Digicuro also dedups on it) |
| `metadata` | `userId` / `sessionId` / `occurredAt` / `source` (internal enum) | our ids + timestamp + funnel source |
| `metadata` | `generationsCount` / `products[]` | engagement + styles tried |
| `metadata` | `generatedLookUrl` / `originalPhotoUrl` / `looks[]` | image URLs (render on the lead) |

### Images
Sent inside `metadata` as **stable, non-expiring proxy URLs** — `getLeadMediaUrls()` in
`lib/leads.ts` builds `https://<app>/api/crm-media/<generation-id>/<result|source>`. That route
(`app/api/crm-media/[id]/[kind]/route.ts`) 302-redirects to a freshly-signed 5-min Supabase URL on
each request, so the URL we hand Digicuro never dies (their signed links would expire in ~30 days and
they don't re-host). Buckets stay private; the (UUID) generation id is the access capability. The
proxy origin comes from `APP_BASE_URL`.

---

## 3. When we send

Dispatched from `lib/leads.ts` via `dispatchIntegrationEvent(…, "crm")`:

| Our event | Fires when | Notes |
|---|---|---|
| `lead.created` | phone-OTP registration (`ensureLeadForSession`, source `registration`) | has phone |
| `lead.updated` | a guest lead links to a signed-in account | now has phone |
| `lead.updated` | each completed try-on (`refreshLeadActivity`) | refreshes activity/media |

Only `lead.created` / `lead.updated` are delivered (`DELIVERABLE_EVENT_TYPES` in
`lib/webhooks/delivery.ts`). A pre-signup **guest** event (no phone/email) is **terminally skipped**
(`markSkipped`) — Digicuro requires a dedup key, and the customer's later `lead.updated` (with phone)
creates the lead.

---

## 4. Delivery, retries & reconciliation

- **Immediate delivery** at dispatch time via Next.js `after()` (`lib/event-bus.ts`) → ~1–3s latency.
- **Durable backstop:** the `integration_events` outbox + `sweepDueEvents()`, drained by
  `GET /api/cron/dispatch-events` (Bearer `CRON_SECRET`). On Vercel Hobby, Vercel Cron only runs
  once/day, so a **GitHub Actions workflow** (`.github/workflows/crm-retry-sweeper.yml`) hits the
  sweeper every 5 min for near-real-time retries.
- **Backoff:** 30s → 1h, up to 8 attempts, then dead-letter (`status='dead'`). **4xx** responses
  (bad payload/auth/paused — except 429) dead-letter immediately (retrying won't help).
- **Reconciliation:** on a `201`, `captureCrmLeadId()` stores Digicuro's `lead_id` on
  `leads.crm_lead_id`. Our `leadId` is also always in `metadata.appLeadId`.

---

## 5. Configuration (env)

| Env var | Meaning |
|---|---|
| `CRM_WEBHOOK_URL` | `https://api-dccrm.digicuro.app/v1/crm/webhooks/vendor-lead` |
| `CRM_WEBHOOK_TOKEN` | Bearer token (`vlk_…`) from Digicuro |
| `CRON_SECRET` | guards the sweeper; also set as a GitHub Actions repo secret |

If `CRM_WEBHOOK_URL` or `CRM_WEBHOOK_TOKEN` is unset, delivery is a safe no-op (events stay pending).
Set these in Vercel (Production) and redeploy.

---

## 6. Resolved with Digicuro (2026-07-21) + follow-up

1. **Two-way status sync — NO.** Digicuro will not POST lead status changes outbound; lifecycle data
   stays in their CRM. The alternative they offer is a **read-only CRM login** for the staff who need
   to see status. Our inbound route stays removed. (Decide whether to request the read-only logins.)
2. **Images — visible, and now permanent.** URLs inside `metadata` render on the lead. Digicuro does
   not copy them into their storage, so we send **stable proxy URLs** (`/api/crm-media/…`, see §2)
   that never expire instead of raw signed URLs — **built.** No further action needed unless Digicuro
   wants a different media format.

---

## 7. Smoke test

- Point `CRM_WEBHOOK_URL` at a request bin (e.g. webhook.site) with any `CRM_WEBHOOK_TOKEN`.
- Sign in on the app → confirm a POST with `event:"lead.created"`, top-level `source`/`name`/`phone`/
  `email`/`note`, and a `metadata` object carrying `appLeadId` + `generatedLookUrl`/`originalPhotoUrl`/
  `looks[]`; headers `Authorization: Bearer …` and `X-Event-Type: lead.created`.
- Complete a try-on → confirm a `lead.updated` POST with a refreshed `metadata.generationsCount`.
- Return `201 {lead_id}` from the bin → confirm `leads.crm_lead_id` is stored.
- Trigger a guest (no phone/email) event → confirm it is skipped (no POST, no retry loop).
