# HairOriginals AI Try-On ⇄ DC CRM — Webhook Integration Guide

**Audience:** DC CRM integration team (the "Design Script" `vendor_lead` connector).
**Owner:** HairOriginals AI Try-On app team.
**Status:** v1.

This document is the contract for connecting the HairOriginals AI Try-On app to the DC CRM. It is
**two-way** and the **CRM is the master**:

- **Outbound (app → CRM):** we push `lead.created` and `lead.updated` events as the customer signs
  in and creates looks. You ingest them into the `vendor_lead` connector as leads / lead activity.
- **Inbound (CRM → app):** you call our callback whenever a lead changes on your side (agent
  assigned, contacted, qualified, converted, lost). We mirror the status so our in-app agent view
  stays consistent with yours.

```
                       lead.created / lead.updated (signed POST)
  HairOriginals app  ───────────────────────────────────────────▶  DC CRM  (vendor_lead: Design Script)
   (sender)                                                          (master)
        ▲                                                                │
        │              lead status callback (signed POST)               │
        └───────────────────────────────────────────────────────────────┘
                POST /api/webhooks/crm
```

---

## 1. Credentials to exchange

For your `vendor_lead` / "Design Script" connector you already generate `api_key` and
`webhook_secret`. We need the following exchanged **out of band** (never in git/logs):

| Direction | We need from you | You need from us |
|---|---|---|
| Outbound (app → CRM) | **Inbound URL** of your connector, **`api_key`**, **`webhook_secret`** | — |
| Inbound (CRM → app) | — | **Callback URL** (`https://<app-host>/api/webhooks/crm`), **`api_key`**, **`inbound_secret`** |

On our side these map to environment variables:

| Env var | Meaning |
|---|---|
| `CRM_WEBHOOK_URL` | Your connector's inbound URL (we POST here) |
| `CRM_WEBHOOK_API_KEY` | `api_key` you issued — we send it as `X-Api-Key`; also the key you must send us on callbacks |
| `CRM_WEBHOOK_SECRET` | `webhook_secret` — we HMAC-sign outbound bodies with it |
| `CRM_INBOUND_SECRET` | Secret **you** HMAC-sign inbound callbacks with (we issue this to you) |
| `CRON_SECRET` | Internal — guards our retry sweeper (not your concern) |

---

## 2. Outbound: events we send you

### 2.1 Transport & headers

- `POST` to `CRM_WEBHOOK_URL`, `Content-Type: application/json`.
- Headers on every request:

| Header | Value |
|---|---|
| `X-Api-Key` | the `api_key` you issued |
| `X-Signature` | `sha256=<hex>` — HMAC-SHA256 of the **raw request body** using `webhook_secret` |
| `X-Idempotency-Key` | stable unique id for this event (see idempotency) |
| `X-Event-Type` | `lead.created` or `lead.updated` |

### 2.2 Body envelope

```json
{
  "id": "5f3c…",                 // = X-Idempotency-Key
  "type": "lead.created",
  "createdAt": "2026-07-08T10:12:04.000Z",
  "data": { /* event-specific payload, see below */ }
}
```

### 2.3 Signature verification (do this before trusting the body)

Compute the HMAC over the **exact raw bytes** you received (do not re-serialize the JSON first):

```js
// Node.js example
import { createHmac, timingSafeEqual } from "crypto";

function verify(rawBody, headerSig, secret) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(headerSig || "");
  return a.length === b.length && timingSafeEqual(a, b);
}
// reject if X-Api-Key !== your api_key OR verify(...) is false  → 401
```

### 2.4 Event: `lead.created`

Fired when a customer **signs in** (phone OTP) — this is the moment to create/route a lead.

```json
{
  "id": "…", "type": "lead.created", "createdAt": "…",
  "data": {
    "leadId": "6b1e…",              // OUR lead id — echo it back on callbacks
    "userId": "a2c…",               // our user id (may be null pre-link)
    "sessionId": "d9f…",            // our device-session id
    "phone": "+9198…",              // E.164; null if not shared
    "source": "registration",       // registration | agent_gate | talk_to_expert | manual
    "funnelStage": 2,
    "generationsCount": 3,
    "products": [                    // catalog styles they have tried so far
      { "id": "p1", "name": "Silk Base Topper", "price": 4999 }
    ],
    "occurredAt": "2026-07-08T10:12:04.000Z"
  }
}
```

### 2.5 Event: `lead.updated`

Fired as the customer keeps engaging (each completed try-on). Use it to keep the lead's activity /
"products interested in" fresh, and to drive nudges (e.g. your `ho_abandoned_cart` template).

```json
{
  "id": "…", "type": "lead.updated", "createdAt": "…",
  "data": {
    "leadId": "6b1e…",
    "userId": "a2c…",
    "sessionId": "d9f…",
    "generationsCount": 5,
    "products": [ { "id": "p1", "name": "Silk Base Topper", "price": 4999 } ],
    "occurredAt": "2026-07-08T10:20:41.000Z"
  }
}
```

### 2.6 Field → DC CRM lead mapping (suggested)

| Our field | DC CRM lead field |
|---|---|
| `data.phone` | phone / primary contact |
| `data.leadId` | vendor reference id (store it; you'll echo it back) |
| `data.source` | lead source |
| `data.products[].name` | products of interest / interest tags |
| `data.generationsCount` | engagement score / activity count |
| `data.occurredAt` | activity timestamp |

### 2.7 Idempotency & retries

- **Idempotency:** `X-Idempotency-Key` (also `data`/envelope `id`) is stable per event. If you have
  already processed that key, return `200` and no-op. `lead.created` for a returning customer is not
  re-sent (we only create a lead once), but treat all events idempotently anyway.
- **Success:** respond `2xx` quickly (ideally < 5s). Any non-2xx (or timeout > 10s) is a failure.
- **Retry/backoff:** we retry with exponential backoff (30s, 60s, 120s, … capped at 1h) up to 8
  attempts, then the event is dead-lettered on our side. So transient `5xx` on your side are safe.
- **Optional — return your lead id:** if your `2xx` response body is JSON containing
  `crm_lead_id` (or `id` / `lead_id`), we store it against the lead so you can later reference it in
  callbacks.

---

## 3. Inbound: status callbacks you send us

Whenever a lead changes on your side, call us so our agent view mirrors it.

- **URL:** `POST https://<app-host>/api/webhooks/crm`
- **Headers:**
  - `Content-Type: application/json`
  - `X-Api-Key:` the `api_key` (same value as outbound)
  - `X-Signature:` `sha256=<hex>` HMAC-SHA256 of the raw body using **`CRM_INBOUND_SECRET`**
- **Body:**

```json
{
  "lead_id": "6b1e…",          // OUR leadId from the lead.created event (preferred)
  "crm_lead_id": "CRM-10432",  // your id (fallback if you didn't keep ours)
  "status": "contacted",       // new | contacted | qualified | converted | lost
  "assigned_agent": "agent_42",// optional, informational
  "notes": "Left voicemail",   // optional
  "occurred_at": "2026-07-08T11:02:00.000Z"  // used to drop out-of-order updates
}
```

- Provide **`lead_id`** (preferred) or **`crm_lead_id`**.
- `status` must be one of `new | contacted | qualified | converted | lost` (others are ignored).
- **Ordering:** we drop updates whose `occurred_at` is older than the lead's last update.
- **Responses:** `200 {ok:true,...}` on success (including benign no-ops like unknown lead — so you
  don't retry those); `401` invalid api key / signature; `400` malformed; `503` if not configured.
- Make callbacks **idempotent** and retry on `5xx`/timeout.

---

## 4. Setup checklist

1. **CRM team:** in the `vendor_lead` ("Design Script") connector, generate `api_key` +
   `webhook_secret` and share them plus the connector's **inbound URL** with the app team.
2. **App team:** set `CRM_WEBHOOK_URL`, `CRM_WEBHOOK_API_KEY`, `CRM_WEBHOOK_SECRET`; generate and
   share `CRM_INBOUND_SECRET` (and confirm the callback URL) with the CRM team; set `CRON_SECRET`.
3. **CRM team:** configure the status callback to `POST /api/webhooks/crm` signed with
   `CRM_INBOUND_SECRET` + `X-Api-Key`, echoing our `lead_id`.
4. **Both:** run the smoke test below.

### Smoke test
- Sign in on the try-on app → confirm a `lead.created` reaches the connector with a valid signature.
- Generate a try-on → confirm a `lead.updated` follows.
- From the CRM, move the lead to `contacted` → confirm our agent view shows `contacted`.
- Send a bad signature to `/api/webhooks/crm` → expect `401`.

---

## 5. Event catalog summary

| Event | Direction | Trigger |
|---|---|---|
| `lead.created` | app → CRM | customer signs in (auto-registered lead) |
| `lead.updated` | app → CRM | customer completes a try-on (activity refresh) |
| lead status callback | CRM → app | lead status/assignment changes in the CRM |

> Not currently pushed to the CRM: `generation.completed`, `credit.granted` (internal events). They
> can be added to the outbound stream on request.
