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

Top-level: `event`, `source`, `name?`, `phone?`, `email?`, `note?`, plus the marketing-attribution
fields in §4a. **All app-specific detail goes inside `metadata`** (Digicuro stores it verbatim on the
touchpoint; images render from there).

```json
{
  "event": "lead.created",
  "source": "HairOriginals AI Try-On",
  "name": "Aishwarya Sharma",
  "phone": "+919876543210",
  "email": "aish@example.com",
  "note": "3 try-on(s), latest: Silk Base Topper",

  "campaign": "HairOriginals AI Try-On",
  "utm_source": "HO-HT-Female-Kolkata-WLP-static",
  "utm_medium": "Facebook_Mobile_Feed",
  "utm_campaign": "HO-HT-Female-Kolkata-WLP-static",
  "landing_url": "https://aitryon.hairoriginals.com/?utm_source=…",
  "referrer": "https://l.facebook.com/",
  "utm_content": "HO-HT-Female-Kolkata-WLP-static",
  "utm_term": "120248613941970339",
  "campaign_id": "120248613941980339",
  "ad_id": "120256558077390339",
  "meta_click_id": "IwcGRvZgNleHRuA2FlbQEw…",
  "fbclid": "IwcGRvZgNleHRuA2FlbQEw…",

  "metadata": {
    "marketing": {
      "utm_source": "HO-HT-Female-Kolkata-WLP-static",
      "utm_medium": "Facebook_Mobile_Feed",
      "utm_campaign": "HO-HT-Female-Kolkata-WLP-static",
      "utm_content": "HO-HT-Female-Kolkata-WLP-static",
      "utm_term": "120248613941970339",
      "campaign_id": "120248613941980339",
      "ad_id": "120256558077390339",
      "fbclid": "IwcGRvZgNleHRuA2FlbQEw…"
    },
    "landing": {
      "url": "https://aitryon.hairoriginals.com/?utm_source=…",
      "path": "/",
      "referrer": "https://l.facebook.com/",
      "landedAt": "2026-08-14T10:12:04.000Z"
    },
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

## 4a. Marketing attribution (added 2026-08-14)

**First-touch**: the campaign that first brought the visitor to the app, captured off the landing
URL's query string on their very first page view and held in a 90-day first-party cookie
(`ho_attr`) until a lead exists. See `lib/attribution.ts`. One exception to "first": if the stored
touch carries no campaign data (direct/organic) and the visitor later clicks an ad, the ad wins —
otherwise anyone who once browsed organically would be credited "direct" forever.

### `campaign` is the CRM's categorisation key — not the ad's campaign name

Digicuro categorises a lead on the top-level **`campaign`** field. Established by A/B probe on
2026-08-14: leads 38310 and 38311 were byte-identical except that `campaign` and `utm_campaign` were
swapped; **38310**, which carried `"HairOriginals AI Try-On"` in `campaign`, came through tagged
`HairOriginals AI Try-On`, while 38311 did not. `source`, `utm_source` and `utm_campaign` were each
ruled out by the same method (leads 38294, 38296–38309) — every one of them defaulted to
"Vendors (Other)".

So `campaign` is pinned to the constant, and it is set on the body itself rather than inside
`applyAttribution` — a direct or organic visitor has no marketing params at all, and must still be
categorised correctly. **The ad's real campaign name is not lost**: it is in `utm_campaign` (and
`metadata.marketing.utm_campaign`), and the specific ad remains identified by `campaign_id` / `ad_id`.

This supersedes the request in `docs/digicuro-followup-requests.md` §1 — no CRM-side change is needed.

Two rules govern how these serialize:

1. **Absent values are omitted, never sent as `null`.** We keep no copy of the attribution, so it
   arrives on a request cookie — and `lead.updated` fires on every completed try-on, sometimes from a
   request where the cookie is gone. A `null` would blank the campaign Digicuro already stored
   against the lead; an omitted key leaves it untouched.
2. **`metadata.marketing` always mirrors the full set** (ungated). Digicuro stores `metadata`
   verbatim, so the data survives even if a top-level key name turns out to be wrong.

| Field | Source param | Status |
|---|---|---|
| `utm_source` / `utm_medium` / `utm_campaign` | same-named query params | documented in their vendor spec |
| `campaign` | **constant `"HairOriginals AI Try-On"`** — see below | documented |
| `landing_url` | full landing URL incl. query, hash stripped | documented |
| `referrer` | `document.referrer` at landing | documented |
| `utm_content` / `utm_term` | same-named query params | **inferred** — rendered by their UI, absent from their field table |
| `campaign_id` / `ad_id` | `{{campaign.id}}` / `{{ad.id}}` from the Meta URL template | **inferred** |
| `meta_click_id` + `fbclid` | `fbclid` — sent under both names, whichever they read | **inferred** |

**Probed against the live endpoint, 2026-08-14** (lead 38292): unknown top-level keys are accepted
and silently ignored — even a deliberately nonsense key returns `201`. So the inferred six cannot
dead-letter a lead, but a `201` is equally *no proof they were stored*. Whether they populate the
CRM's Marketing Parameters panel has to be confirmed by eye in the CRM UI; see
`docs/digicuro-followup-requests.md` §3.

They stay behind `CRM_SEND_EXTENDED_MARKETING` (default on) as cheap insurance should Digicuro
tighten validation later — a non-429 4xx is terminal in `lib/webhooks/delivery.ts`, so set the flag
to `false` in Vercel to drop them without a redeploy.

`metadata.marketing` additionally carries `adset_id`, `gclid`, `ttclid`, and `msclkid` when present,
so the same pipeline covers Google/TikTok/Bing without a code change. `metadata.landing` carries
`url`, `path`, `referrer` (e.g. `https://l.facebook.com/`, absent on a direct hit) and `landedAt`.

Not sent: `lead_type` (their example value `home_trial` implies a validated enum — we'd be guessing)
and `city` / `pin_code` (we don't collect either; only country, via the Vercel geo header).

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
| marketing fields | see §4a — omitted entirely when the visitor has no attribution |
| `metadata` | object, stored verbatim (below) |

**`metadata` (stored as-is; images display from here):** `appLeadId` (our `leads.id` — stable
reconciliation key), `userId`, `sessionId`, `occurredAt`, `source` (internal enum: `registration` /
`guest_tryon` / `agent_gate` / …), `generationsCount`, `products[]` `{id,name,price}`,
`generatedLookUrl`, `originalPhotoUrl`, `looks[]` `{resultUrl, originalPhotoUrl, productName, createdAt}`,
`marketing` + `landing` (§4a).

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
