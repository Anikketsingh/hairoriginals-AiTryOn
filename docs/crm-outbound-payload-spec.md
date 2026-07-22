# HairOriginals AI Try-On → DC CRM — Outbound Lead Payload (agreed)

**Between:** HairOriginals AI Try-On app ↔ DC CRM / Digicuro.
**Status:** agreed 2026-07-21 (Ishan, Digicuro). This records the exact payload we POST. One-way
(app → CRM lead intake).

---

## 1. Endpoint & auth

- **URL:** `POST https://api-dccrm.digicuro.app/v1/crm/webhooks/vendor-lead`
- **Content-Type:** `application/json`
- **Auth:** `Authorization: Bearer <token>` (issued by Digicuro; held in `CRM_WEBHOOK_TOKEN`, never
  committed). HMAC `X-Vendor-Signature` is available but not used.

## 2. Headers

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <token>` |
| `X-Event-Type` | `lead.created` / `lead.updated` (log hint; the body `event` field is authoritative) |

## 3. Events

| Event | When |
|---|---|
| `lead.created` | customer becomes a lead (phone-OTP sign-in) |
| `lead.updated` | each completed try-on; guest links to a signed-in account |

We only post once a **phone or email** exists (Digicuro's dedup keys). Digicuro dedups on
`phone` / `email` / `metadata.appLeadId`, so replays don't create duplicates.

## 4. Body

Top-level: `event`, `source`, `name?`, `phone?`, `email?`, `note?`. **All app-specific detail goes
inside `metadata`** (Digicuro stores it verbatim on the touchpoint; images render from there).

```json
{
  "event": "lead.created",
  "source": "HairOriginals AI Try-On",
  "name": "Aishwarya Sharma",
  "phone": "+919876543210",
  "email": "aish@example.com",
  "note": "3 try-on(s), latest: Silk Base Topper",
  "metadata": {
    "appLeadId": "6b1e2c9a-1f4d-4c7e-9b0a-77e1d3a2c8f5",
    "userId": "a2c9f0d1-8e3b-4a12-9c77-1b2d3e4f5a6b",
    "sessionId": "d9f3b7e0-2c14-4a8d-9f6e-0a1b2c3d4e5f",
    "occurredAt": "2026-07-21T10:12:04.000Z",
    "source": "registration",
    "generationsCount": 3,
    "products": [{ "id": "p1", "name": "Silk Base Topper", "price": 4999 }],
    "generatedLookUrl": "https://aitryon.hairoriginals.com/api/crm-media/<gen-id>/result",
    "originalPhotoUrl": "https://aitryon.hairoriginals.com/api/crm-media/<gen-id>/source",
    "looks": [
      {
        "resultUrl": "https://aitryon.hairoriginals.com/api/crm-media/<gen-id>/result",
        "originalPhotoUrl": "https://aitryon.hairoriginals.com/api/crm-media/<gen-id>/source",
        "productName": "Silk Base Topper",
        "createdAt": "2026-07-21T10:11:40.000Z"
      }
    ]
  }
}
```

`lead.updated` is identical in shape (refreshed `metadata.generationsCount` + latest media). Any
nullable field may be absent (e.g. a look before original-photo capture); a later `lead.updated`
fills it in.

## 5. Field reference

**Top level (Digicuro reads these):**

| Field | Notes |
|---|---|
| `event` | `lead.created` / `lead.updated` |
| `source` | always `"HairOriginals AI Try-On"` (touchpoint attribution) |
| `name` | optional; names the lead |
| `phone` | dedup key; E.164 |
| `email` | dedup key; at least one of phone/email is always present |
| `note` | short summary shown on the lead timeline (≤2000 chars) |
| `metadata` | object, stored verbatim (below) |

**`metadata` (stored as-is; images display from here):** `appLeadId` (our `leads.id` — stable
reconciliation key), `userId`, `sessionId`, `occurredAt`, `source` (internal enum: `registration` /
`guest_tryon` / `agent_gate` / …), `generationsCount`, `products[]` `{id,name,price}`,
`generatedLookUrl`, `originalPhotoUrl`, `looks[]` `{resultUrl, originalPhotoUrl, productName, createdAt}`.

## 6. Response

`201 { "ok": true, "lead_id": 27622, "deduplicated": false, "collisions": 0 }`. We store `lead_id`
against `appLeadId`. Errors: `401 {error:"auth"}`, `400 {error:"invalid_body"}`,
`400 {error:"phone_or_email_required"}` — we dead-letter 4xx immediately (no pointless retries).

## 7. Delivery, retries & idempotency (our behavior)

- ~1–3s latency (immediate `after()` delivery); durable retry sweeper every 5 min.
- Backoff 30s → 1h, 8 attempts, then dead-letter.
- Same lead is sent repeatedly (create + updates) — safe, Digicuro dedups.

## 8. Resolved / notes

- **Status sync back:** Digicuro will not push status changes to us (offered: read-only CRM logins).
- **Images:** rendered on the lead from `metadata`. The image URLs are **stable proxy links**
  (`/api/crm-media/…`) that we keep alive indefinitely — they redirect to fresh short-lived signed
  URLs on each fetch, so they won't expire (buckets stay private). Nothing to re-host on your side.
