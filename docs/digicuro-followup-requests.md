# HairOriginals AI Try-On → DC CRM — Follow-up Requests

**To:** Ishan, Digicuro CRM team
**From:** HairOriginals AI Try-On app team
**Date:** 22 July 2026 (§3 added 14 August 2026)
**Re:** CRM-side changes now that leads are flowing

Hi Ishan,

The integration is live and leads are landing on the HairOriginals tenant — thank you. Three things
we'd like your team to action on the CRM side. The first two need no change to what we send; the
third is a confirmation request about fields we've just started sending (details below).

---

## 1. Show the source as "HairOriginals AI Try-On" (not "Vendor / Other")

**What we see now:** leads from our app are categorized as **Vendor (Other) / Partner** in the CRM.

**What we want:** they should show under a distinct source **"HairOriginals AI Try-On"**, so your
agents can immediately tell these leads come from the AI Try-On funnel.

**What we already send:** every payload carries this at the top level, exactly as your spec asked:

```json
{
  "event": "lead.created",
  "source": "HairOriginals AI Try-On",
  ...
}
```

**Our ask:** please create/configure an **"AI Try-On" source type (or channel)** in the CRM and map
our leads to it — either by mapping our vendor connector, or by keying on the `source` value
`"HairOriginals AI Try-On"` we already send. If you'd rather we send a specific value or a different
field to trigger the right category, tell us the exact field + value and we'll adjust our payload.

---

## 2. Show the try-on images in a dedicated section on the lead

**Good news — the expiry problem is fixed on our side.** Earlier our image links were signed URLs
that expired in ~30 days. We've replaced them with **stable, non-expiring URLs**: each one points at
our app (`https://aitryon.hairoriginals.com/api/crm-media/<id>/result`) and transparently redirects to
a fresh image on every request. **They will not go dead** — you can rely on them long-term and do
**not** need to re-host the images. They are direct-loadable image URLs (they work in a plain
`<img src="…">`).

**What we want:** a dedicated section on the lead — e.g. **"AI Try-On Looks"** — that displays these
images so your agents can see what the customer generated.

**Where the URLs are in the payload:** inside the `metadata` object:

| Field | What it is |
|---|---|
| `metadata.generatedLookUrl` | the customer's latest AI-generated look (main image to show) |
| `metadata.originalPhotoUrl` | the customer's original photo for that look (before/after pair) |
| `metadata.looks[]` | up to 5 recent looks for a gallery — each has `resultUrl`, `originalPhotoUrl`, `productName`, `createdAt` |

Example (abridged):

```json
"metadata": {
  "generatedLookUrl": "https://aitryon.hairoriginals.com/api/crm-media/7a1c9d20.../result",
  "originalPhotoUrl": "https://aitryon.hairoriginals.com/api/crm-media/7a1c9d20.../source",
  "looks": [
    {
      "resultUrl": "https://aitryon.hairoriginals.com/api/crm-media/7a1c9d20.../result",
      "originalPhotoUrl": "https://aitryon.hairoriginals.com/api/crm-media/7a1c9d20.../source",
      "productName": "Silk Base Topper",
      "createdAt": "2026-07-22T10:11:40.000Z"
    }
  ]
}
```

**Our ask:** please add UI on the lead/touchpoint to render these — at minimum
`metadata.generatedLookUrl`, ideally the `metadata.looks[]` gallery with the before/after
(original → result) pair per look.

---

---

## 3. Confirm the field names behind the "Marketing Parameters" panel

**Added 14 August 2026.** We've started sending marketing attribution on every lead — which campaign
and ad brought the customer to the try-on app, and the URL they landed on.

**Confirmed from the request body you shared**, and now populated:

```json
{
  "campaign":     "HO-HT-Female-Kolkata-WLP-static",
  "utm_source":   "HO-HT-Female-Kolkata-WLP-static",
  "utm_medium":   "Facebook_Mobile_Feed",
  "utm_campaign": "HO-HT-Female-Kolkata-WLP-static",
  "landing_url":  "https://aitryon.hairoriginals.com/?utm_source=…",
  "referrer":     "https://l.facebook.com/"
}
```

**Our ask — one question.** The Marketing Parameters panel we were shown also displays **Content**,
**Term**, **Campaign ID**, **Ad ID** and **Meta click ID**, but those five aren't in the field table
in your vendor spec, so we've had to guess their key names:

| Panel row | Key we're sending | Example value |
|---|---|---|
| Content | `utm_content` | `HO-HT-Female-Kolkata-WLP-static` |
| Term | `utm_term` | `120248613941970339` |
| Campaign ID | `campaign_id` | `120248613941980339` |
| Ad ID | `ad_id` | `120256558077390339` |
| Meta click ID | `meta_click_id` **and** `fbclid` (both, until you confirm which) | `IwcGRvZgNleHRuA2FlbQEw…` |

We sent a test lead with all of these on **14 Aug 2026** — it came back
`201 {"lead_id": 38292, "deduplicated": false}`. But we also sent a deliberately nonsense key in a
separate call and got `201` for that too, so we know unknown fields are accepted and ignored rather
than rejected. **A `201` therefore doesn't tell us whether these five actually landed.**

**Could someone open lead 38292 and tell us whether the Marketing Parameters panel is populated —
and specifically whether Content, Term, Campaign ID, Ad ID and Meta click ID show values?** If any
are blank, send us the key names you read and we'll switch immediately.

(Please delete leads **38292** and **38293** once checked — both are integration tests, not real
customers.)

As a safety net, all of these values are **also** inside `metadata` — at `metadata.marketing`
(the full set, including `gclid` / `ttclid` / `msclkid` for non-Meta channels) and `metadata.landing`
(`url`, `path`, `referrer`, `landedAt`). Since you store `metadata` verbatim, the data reaches you
either way — but the panel is where your agents will actually look, hence the ask.

**Attribution model:** first-touch. The campaign that first brought the customer to the app is what
we report, even if they return later via a different ad.

---

Happy to hop on a quick call if any of these is easier to scope live. Thanks!

— HairOriginals AI Try-On team
