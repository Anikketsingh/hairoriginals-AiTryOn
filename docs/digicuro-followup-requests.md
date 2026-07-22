# HairOriginals AI Try-On → DC CRM — Follow-up Requests

**To:** Ishan, Digicuro CRM team
**From:** HairOriginals AI Try-On app team
**Date:** 22 July 2026
**Re:** Two CRM-side changes now that leads are flowing

Hi Ishan,

The integration is live and leads are landing on the HairOriginals tenant — thank you. Two things we'd
like your team to action on the CRM side. Neither needs a change to what we send (details below).

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

Happy to hop on a quick call if either is easier to scope live. Thanks!

— HairOriginals AI Try-On team
