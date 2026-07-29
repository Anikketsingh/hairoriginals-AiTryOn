# Per-Product Hair Customization (Colour & Length)

## Context

Today the try-on flow is `home → photo → style → result`. A "hairstyle" *is* a `products` row; its `image_url` is sent to Gemini as the reference image and a prompt is resolved from `products.prompt_override → prompt_templates` ([lib/generation-queue.ts:213-229](lib/generation-queue.ts#L213-L229)).

We want customers to optionally refine a chosen hairstyle with **Hair Colour** and **Hair Length** — but only for products an admin has explicitly opted in, with option lists that differ per product and are editable without a deploy. Products without the feature must behave **byte-identically** to today: no extra screen, no extra network call, no change to the generated prompt.

The design must also absorb future attributes (Hair Density, Texture, Volume, Parting Style) without new migrations or new code paths.

**Approach:** a generic `attribute → option → product` model, a shared option library that products attach to, a conditional `customize` step, and a prompt that is **composed** (base + customization block) rather than replaced.

---

## Architecture at a glance

```
STYLE STEP (unchanged)                  Server
  tap a style card ──────────────────►  GET /api/products/[id]/customization
     (prefetch, inside the existing        (only if product.customization_enabled)
      selection spinner)

  tap "Try this on"
     │
     ├─ no options resolved ──────────►  POST /api/generate     ← today's path, untouched
     │
     └─ options resolved
            ▼
     CUSTOMIZE STEP (new, #customize)
       Hair Colour  ● ● ● ●
       Hair Length  [Short][Med][Long]
       "Try this on" ────────────────►  POST /api/generate
                                          + customizationOptionIds[]
                                              │
                                              ▼
                                        background job re-resolves ids from DB,
                                        drops anything not attached/active,
                                        composes base prompt + customization block,
                                        snapshots the result to generations.customizations
```

**Two invariants that make backward compatibility provable:**
1. `products.customization_enabled` defaults to `false` → on deploy, every existing product resolves to zero options → the customize step never mounts and `/api/generate` receives no new field.
2. `composeCustomizedPrompt(base, [])` returns `base` **unchanged** (same reference, no trailing whitespace) → the prompt sent to Gemini for existing products is identical to today's.

---

## 1. Database

One new migration: `supabase/migrations/20260729000001_product_customization.sql`. Follow the exact conventions of [20260714000001_product_shop_url.sql](supabase/migrations/20260714000001_product_shop_url.sql) — header comment block, guarded `DO $$ ... information_schema.columns ... $$`, `ENABLE ROW LEVEL SECURITY` on every new table (no policies — all access is service-role), `CREATE INDEX IF NOT EXISTS`, trailing `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`.

```sql
-- The attribute itself: "Hair Colour", "Hair Length", and anything added later.
CREATE TABLE IF NOT EXISTS customization_attributes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT UNIQUE NOT NULL,          -- 'hair_colour', 'hair_length'
  label         TEXT NOT NULL,                 -- 'Hair Colour'
  description   TEXT,
  ui_type       TEXT NOT NULL DEFAULT 'chip'
                  CHECK (ui_type IN ('swatch', 'chip', 'thumbnail')),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The shared option library. prompt_fragment is the only thing the AI sees.
CREATE TABLE IF NOT EXISTS customization_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id    UUID NOT NULL REFERENCES customization_attributes(id) ON DELETE CASCADE,
  value           TEXT NOT NULL,               -- 'jet_black'
  label           TEXT NOT NULL,               -- 'Jet Black'
  swatch_hex      TEXT,                        -- for ui_type = 'swatch'
  image_url       TEXT,                        -- for ui_type = 'thumbnail'
  prompt_fragment TEXT NOT NULL,               -- injected verbatim into the prompt
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customization_options_unique_value UNIQUE (attribute_id, value)
);

-- Which options each product offers. Absence of rows = feature inert.
CREATE TABLE IF NOT EXISTS product_customization_options (
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_id     UUID NOT NULL REFERENCES customization_options(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_customization_options_attribute
  ON customization_options(attribute_id);
CREATE INDEX IF NOT EXISTS idx_product_customization_options_product
  ON product_customization_options(product_id);
```

Two guarded column adds:

| Table | Column | Type | Why |
|---|---|---|---|
| `products` | `customization_enabled` | `BOOLEAN NOT NULL DEFAULT false` | the per-product master switch |
| `generations` | `customizations` | `JSONB` | **snapshot** of what was applied |

`generations.customizations` stores a resolved snapshot, not foreign keys, so later admin edits or deletions never rewrite history:

```json
[{ "attribute_key": "hair_colour", "attribute_label": "Hair Colour",
   "option_id": "…", "option_label": "Jet Black",
   "prompt_fragment": "Render the hair in a deep jet black…" }]
```

Also add `updated_at` triggers using the existing `update_updated_at_column()` function, matching [20260629000005_phase3_products.sql](supabase/migrations/20260629000005_phase3_products.sql).

**Seed** the two attributes (`hair_colour` as `ui_type='swatch'`, `hair_length` as `chip`) plus a starter option set, all with `ON CONFLICT DO NOTHING`. Seed **no** `product_customization_options` rows — every existing product stays inert.

> ⚠️ Per project memory, `supabase db push` writes to the **live** database. Apply this migration deliberately; it is additive and non-destructive (new tables + two defaulted columns), so it is safe to run against production ahead of the code deploy.

---

## 2. AI generation pipeline

New module **`lib/customization.ts`** — the only place prompt composition lives.

```ts
export interface ResolvedCustomization {
  attribute_key: string;
  attribute_label: string;
  option_id: string;
  option_label: string;
  prompt_fragment: string;
}

/** Returns `base` untouched when there is nothing to apply — this is what
 *  guarantees an unchanged prompt for every non-customized generation. */
export function composeCustomizedPrompt(
  base: string,
  selections: ResolvedCustomization[]
): string {
  if (selections.length === 0) return base;
  const lines = selections.map((s) => `- ${s.attribute_label}: ${s.prompt_fragment}`);
  return `${base}\n\nCUSTOMER CUSTOMIZATIONS — these take priority over the reference image where they conflict:\n${lines.join("\n")}`;
}
```

**The precedence sentence is load-bearing.** The base prompt ([lib/prompt.ts:23-29](lib/prompt.ts#L23-L29)) instructs the model that the hairstyle *"must accurately match: color … length"* — i.e. match Image 2. A colour or length override directly contradicts that, so the block must explicitly win. Without that sentence the model will usually ignore the customization.

Also add `resolveProductCustomizations(productId, optionIds)` here — one query, joined through the junction so an option that is not attached to *this* product, or whose attribute is inactive, cannot be applied:

```ts
supabaseAdmin
  .from("product_customization_options")
  .select("option:customization_options!inner(id, label, prompt_fragment, is_active, attribute:customization_attributes!inner(key, label, is_active))")
  .eq("product_id", productId)
  .in("option_id", optionIds);
```
Then filter to `is_active` on both levels, and keep at most one option per `attribute_key` (last-write-wins guards against a client sending two colours).

**Changes in [lib/generation-queue.ts](lib/generation-queue.ts):**
- `ProcessJobParams` gains `customizationOptionIds?: string[]`.
- Extend the existing product lookup select at [line 217](lib/generation-queue.ts#L217) to also pull `customization_enabled` — no extra round trip.
- After `customPrompt` is resolved at [line 227-229](lib/generation-queue.ts#L227-L229), resolve customizations (only when `product.customization_enabled`, the global kill switch is on, and ids were supplied), then:
  ```ts
  const basePrompt = customPrompt ?? HAIR_TRYON_PROMPT;
  const finalPrompt = composeCustomizedPrompt(basePrompt, resolved);
  ```
  Note the small semantic shift: today `undefined` is passed to `generateTryOn`, which falls back to `HAIR_TRYON_PROMPT` internally ([lib/gemini.ts:33](lib/gemini.ts#L33)). Resolving the fallback one level earlier keeps composition in one place; behaviour is unchanged.
- On success, write `customizations: resolved.length ? resolved : null` **and** `prompt_used: finalPrompt` into the completed-row update at [lines 271-281](lib/generation-queue.ts#L271-L281). `prompt_used` has existed since phase 0 but is never populated — without it there is no way to audit whether a customization actually reached Gemini. This is a one-line addition and closes that gap.
- Include `customizations` in the `generate_completed` analytics props so the attribute/option mix is measurable.

Resolution failure is **non-fatal**: log and generate without customization rather than failing a paid job.

`lib/gemini.ts` needs **no changes**.

---

## 3. API changes

### Public

| Route | Change |
|---|---|
| [app/api/products/route.ts:20](app/api/products/route.ts#L20) | add `customization_enabled` to the explicit `.select()` allowlist — the column is invisible to the customer app otherwise |
| `app/api/products/[id]/customization/route.ts` | **new** `GET` |
| [app/api/generate/route.ts](app/api/generate/route.ts) | accept optional `customizationOptionIds` form field |

**`GET /api/products/[id]/customization`** returns options grouped by attribute, ordered by `display_order`:

```json
{ "attributes": [
  { "key": "hair_colour", "label": "Hair Colour", "ui_type": "swatch",
    "options": [{ "id": "…", "label": "Jet Black", "swatch_hex": "#0A0A0A", "image_url": null }] }
]}
```

Rules:
- Returns `{ "attributes": [] }` — never a 404 — when the product is unknown, disabled, or has no options. The client treats empty as "not supported", so every failure mode collapses to today's flow.
- **`prompt_fragment` must never be in the response.** It is internal prompt engineering; leaking it exposes the prompt to anyone with devtools.
- Run `image_url` through `toPublicStorageUrl()` ([lib/supabase/public-url.ts](lib/supabase/public-url.ts)), as every other public route does.
- Attributes with zero active options are omitted entirely.
- Set `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. Option sets change on admin edits, not per request. This is the one endpoint where the repo's no-caching norm is worth breaking, and 60s bounds staleness.

**`POST /api/generate`** — `customizationOptionIds` arrives as a JSON string in the multipart body. Validate shape only (this route stays fast; DB resolution belongs in the job, mirroring how `prompt_override` is handled):
- absent / empty / unparseable → treat as `[]`, never a 400 (fail-open to the existing flow)
- must be an array of ≤ 8 UUID strings, otherwise 400
- ignored entirely when `productId` is null (custom style uploads)
- passed through `enqueueGenerationJob` — **no new column needed** on the pending row; only the resolved snapshot is persisted, by the job.

### Admin

New routes, each following the canonical shape (`requireAdmin(["super_admin", "content_manager"])` → `instanceof NextResponse` guard → module-level zod schema → `parseJsonBody` → `supabaseAdmin` → `console.error("[/api/…] Error:", err)` → generic 500):

- `app/api/admin/customization/attributes/route.ts` — `GET`, `POST`
- `app/api/admin/customization/attributes/[id]/route.ts` — `PUT`, `DELETE`
- `app/api/admin/customization/options/route.ts` — `GET` (optional `?attribute_id=`), `POST`
- `app/api/admin/customization/options/[id]/route.ts` — `PUT`, `DELETE`

Remember `ctx.params` is a `Promise` in Next 16: `const { id } = await ctx.params;`.

Product attachment extends the **existing** product routes rather than adding another:
- Add `customization_enabled: z.boolean().optional()` and `customization_option_ids: z.array(z.string().uuid()).optional()` to **both** `createProductBodySchema` ([app/api/admin/products/route.ts:15-45](app/api/admin/products/route.ts#L15-L45)) and `updateProductBodySchema` ([app/api/admin/products/[id]/route.ts:16-44](app/api/admin/products/[id]/route.ts#L16-L44)) — they are duplicated schemas and both must be edited.
- Junction write is **replace-all, but only when the key is present**:
  ```ts
  if (body.customization_option_ids !== undefined) {
    await supabaseAdmin.from("product_customization_options").delete().eq("product_id", id);
    if (body.customization_option_ids.length > 0) { /* bulk insert with display_order = index */ }
  }
  ```
  The `!== undefined` guard matters: the existing `PUT` writes every field unconditionally and would otherwise wipe attachments on any partial update. **Do not** replicate the `ai_assets` bug, where `PUT` silently drops the array because it is missing from the update schema.
- Include `customization_enabled` in the `product_versions` snapshot automatically (it snapshots the returned row, so this is free).

---

## 4. Admin panel

**New page `app/(admin)/admin/customization/page.tsx`** — the shared option library.

Left column: attributes list (add / rename / reorder / activate). Right column: options for the selected attribute, each row `label`, `value`, colour swatch input, `prompt_fragment` textarea, `display_order`, active toggle. Match the existing admin visual language exactly — `"use client"`, `useState`/`useEffect`/`useCallback` + raw `fetch`, `bg-white/[0.03] border border-white/8 rounded-2xl` panels, amber/orange/rose gradient CTA, `lucide-react` icons, `alert()`/`confirm()` feedback. The admin pages deliberately do **not** use `components/ui/*`.

Show a live preview of the composed block next to the fragment editor, so an admin can see what the AI will actually receive.

**Sidebar** — add to `NAV_ITEMS` in [components/admin/AdminSidebar.tsx:9-18](components/admin/AdminSidebar.tsx#L9-L18) with `roles: ["super_admin", "content_manager"]` (same as Products), icon `Palette` or `SlidersHorizontal`.

**Product editor** — add a `customization` tab to the tab array at [app/(admin)/admin/products/editor/page.tsx:353-359](app/(admin)/admin/products/editor/page.tsx#L353-L359), labelled "Customization":
- A master toggle bound to `customization_enabled`.
- Below it, one checkbox group per attribute listing every active option in the library (fetched from `/api/admin/customization/options`), with swatch previews.
- Hydrate in `loadInitialData` from the product `GET` (extend its select to include the junction), add both fields to the `handleSave` payload.
- Inline warning when the toggle is on but zero options are ticked: *"Customization is on but no options are selected — customers will not see the customization screen."* This is the most likely admin mistake and the UI should name it.

**Global kill switch** — add `customization_enabled` to the `SettingKey` union at [lib/settings.ts:29-43](lib/settings.ts#L29-L43), a typed getter `isCustomizationEnabled()` defaulting to `true`, a seed row in the migration, and a toggle on the settings page. It exists to disable the feature fleet-wide without a deploy, exactly like `agent_gate_enabled`.

---

## 5. Customer frontend

**New component `components/flow/CustomizeStep.tsx`.** Reuses `Button`, `StickyActionBar`, `Skeleton`, `Badge`, `cn` from `components/ui/`, and mirrors `StyleStep`'s layout (`mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pt-20 pb-32 animate-fade-in`). Renders a thumbnail of the chosen style, then one section per attribute — circular swatches for `ui_type: 'swatch'`, the existing `Chip` treatment for `'chip'` — and a sticky "Try this on" CTA. Selected state reuses `StyleStep`'s `border-brand ring-2 ring-brand/30` pattern.

**Changes to [app/(customer)/page.tsx](app/(customer)/page.tsx):**

| Location | Change |
|---|---|
| [L17-18](app/(customer)/page.tsx#L17-L18) | `Step` union gains `"customize"`; `STEP_TO_HASH` gains `customize: "#customize"` |
| [L50-60](app/(customer)/page.tsx#L50-L60) | `popstate` maps `#customize` → `customize`, **guarded**: fall back to `style` when no product is selected, otherwise a deep link lands on an empty screen |
| new state | `customizationAttributes` (fetched on style select) and `customizationSelections: Record<string, string>` (attribute key → option id) |
| [L197-200](app/(customer)/page.tsx#L197-L200) `handleStyleSelect` | after selecting, if `product.customization_enabled` prefetch `/api/products/{id}/customization`; store attributes and preselect each attribute's first option. Errors → empty array (fail-open) |
| new `handleStyleContinue` | passed to `StyleStep` as `onTryOn`: `attributes.length > 0 ? setStep("customize") : handleGenerate()` |
| [L144-195](app/(customer)/page.tsx#L144-L195) `handleGenerate` | append `customizationOptionIds` when non-empty; add `customizationSelections` to the `useCallback` deps — **required** so the post-OTP re-run at [L226](app/(customer)/page.tsx#L226) sends the selections rather than a stale empty object |
| [L202-206](app/(customer)/page.tsx#L202-L206) `handleCancelGenerate` | return to the screen the customer came from (`customize` if attributes exist, else `style`) |
| [L208-221](app/(customer)/page.tsx#L208-L221) | `handleTryAnother` and `handleStartOver` must clear both new state fields — otherwise a previous style's colour bleeds into the next |
| [L229-231](app/(customer)/page.tsx#L229-L231) `back()` | `customize → style` |
| [L233](app/(customer)/page.tsx#L233) `stepNumber` | `customize` reports **2**, the same as `style` |

On the stepper: `FLOW_STEPS` in [TopBar.tsx:18](components/flow/TopBar.tsx#L18) is a hardcoded 3-label array. Reporting `customize` as position 2 treats it as a sub-screen of "Style", leaving `TopBar` and `Stepper` completely untouched and the indicator pixel-identical for non-customizable products. Threading a variable-length label array through would be visible churn on the shared chrome for no user benefit.

**Prefetching on style select, not on continue,** means the extra request rides inside the spinner `selectProduct` already shows while downloading the product image ([StyleStep.tsx:68-82](components/flow/StyleStep.tsx#L68-L82)) — so "Try this on" stays instant and the style grid's interaction is unchanged.

`components/flow/StyleStep.tsx` needs **no changes** — it already calls `onTryOn` and the branching happens in the parent.

**`lib/types.ts`** — add `customization_enabled?: boolean` to `Product`, plus `CustomizationAttribute` / `CustomizationOption` interfaces (public shape, without `prompt_fragment`).

Optionally show the applied customizations as small badges on `ResultStep` — cheap, and makes it obvious the selection took effect.

---

## 6. Feature flag strategy & backward compatibility

Enablement is the AND of three independent conditions, each of which fails closed:

1. `settings.customization_enabled` — global kill switch, checked server-side in the job.
2. `products.customization_enabled` — per product, `DEFAULT false`.
3. At least one active attached option, with an active attribute.

Condition 3 is what makes the feature genuinely safe: a half-configured product (flag on, nothing attached) produces an empty attributes array and the customer silently follows today's exact path. Every error path — network failure, unknown product, malformed response, disabled attribute — resolves to the same empty array, so **there is no state in which a non-configured product can render the new screen**.

For existing products, after this change: `/api/products` returns one extra boolean, the customize step never mounts, `/api/generate` receives no new field, and `composeCustomizedPrompt` returns the base prompt unchanged. The only observable difference is that `generations.prompt_used` is now populated.

---

## 7. Validation

**Client** — nothing blocking. Options are preselected, so "Try this on" is always tappable and there is no dead-end.

**Server, `/api/generate`** — shape only: array of ≤ 8 UUIDs; anything unparseable becomes `[]` rather than a 400.

**Server, background job** — the real gate. Option ids are re-resolved through the junction, so an id that isn't attached to *this* product, or is inactive, or belongs to an inactive attribute, is silently dropped. Duplicate attributes are collapsed to one. The client can never inject prompt text — it sends ids, and the fragment is read from the database.

**Server, admin routes** — zod per convention: `key` matching `/^[a-z][a-z0-9_]*$/`, `swatch_hex` matching `/^#[0-9a-fA-F]{6}$/`, `prompt_fragment` `.min(1).max(500)`. The 500-char cap is deliberate: fragments are concatenated into the prompt and an unbounded field lets one bad edit blow up every generation for that product. Deleting an attribute that has options requires an explicit `?cascade=true`, so the destructive case is opt-in.

---

## 8. Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | Flag on, zero options attached | empty array → existing flow; admin editor warns |
| 2 | Attribute deactivated while attached to live products | filtered server-side in both the public read and the job |
| 3 | Option deactivated or deleted between load and generate | job drops it, generation still succeeds |
| 4 | Custom "upload your own style photo" (no `productId`) | customization ignored end to end |
| 5 | Deep link to `#customize` with no product | `popstate` guard redirects to `style` |
| 6 | Back from customize → style | selection preserved; re-entering keeps the previous choices |
| 7 | "Try another style" from result | selections and attributes cleared |
| 8 | Login gate (402) fires from customize | `FunnelGate` opens; post-OTP re-run resends selections (see deps note in §5) |
| 9 | Cancel during generation | returns to `customize`, not `style` |
| 10 | Options fetch fails | fail-open — generate without customization |
| 11 | Global kill switch off, product flag on | treated as disabled |
| 12 | Client sends two colours | last wins, one per attribute |
| 13 | Client sends an option from another product | dropped by the junction join |
| 14 | Product deleted | junction cascades; `generations.customizations` snapshots survive |
| 15 | Admin edits a fragment after generations exist | history is unaffected — snapshots are copies |
| 16 | Duplicate attribute key | `UNIQUE` constraint rejects it |

---

## 9. Performance

- **Disabled products: zero added cost.** No request, no query, no payload growth beyond one boolean per product.
- **Enabled products:** one `GET` on style tap, in parallel with the product-image download that already happens — no added perceived latency. Cached 60s at the CDN.
- **Background job:** one extra query, only when option ids are present. The product/prompt lookup is extended in place rather than duplicated.
- **Prompt size:** +2 short lines. Negligible against two inline images.
- **No new generation latency**, so the existing timeout budget (client ~90s vs. `maxDuration = 60` on Hobby) is unaffected. That budget is already tight ([app/api/generate/route.ts:13-20](app/api/generate/route.ts#L13-L20)) but this change does not make it worse.

---

## 10. Future scalability

Adding **Hair Density** later is entirely an admin-panel operation: create the attribute, add its options with fragments, tick them on the relevant products. No migration, no API change, no frontend change — `CustomizeStep` renders whatever attributes the endpoint returns, and `composeCustomizedPrompt` folds in whatever fragments come back.

The extension points that exist without being built now:
- `ui_type` already allows `'thumbnail'`; adding a `'slider'` or `'multi'` renderer is one branch in `CustomizeStep`.
- `customization_options.image_url` is in place for options that need a visual reference.
- If an attribute ever needs to contribute a **reference image** to Gemini rather than prompt text, the option row already has somewhere to hang it and `generateTryOn` accepts additional `inlineData` parts.
- Making an attribute mandatory later is one `is_required` column on the junction plus one client guard — deliberately deferred, since "optional with a preselected default" has no dead-end states.

---

## 11. Files touched

**New (9):**
`supabase/migrations/20260729000001_product_customization.sql` · `lib/customization.ts` · `app/api/products/[id]/customization/route.ts` · `app/api/admin/customization/attributes/route.ts` · `.../attributes/[id]/route.ts` · `app/api/admin/customization/options/route.ts` · `.../options/[id]/route.ts` · `app/(admin)/admin/customization/page.tsx` · `components/flow/CustomizeStep.tsx`

**Modified (8):**
[lib/types.ts](lib/types.ts) · [lib/settings.ts](lib/settings.ts) · [lib/generation-queue.ts](lib/generation-queue.ts) · [app/api/generate/route.ts](app/api/generate/route.ts) · [app/api/products/route.ts](app/api/products/route.ts) · [app/api/admin/products/route.ts](app/api/admin/products/route.ts) + [app/api/admin/products/[id]/route.ts](app/api/admin/products/[id]/route.ts) · [app/(admin)/admin/products/editor/page.tsx](app/(admin)/admin/products/editor/page.tsx) · [app/(customer)/page.tsx](app/(customer)/page.tsx) · [components/admin/AdminSidebar.tsx](components/admin/AdminSidebar.tsx)

**Deliberately untouched:** `lib/gemini.ts`, `lib/prompt.ts`, `components/flow/StyleStep.tsx`, `components/flow/TopBar.tsx`, `components/ui/Stepper.tsx`.

---

## 12. Verification

The repo has no test suite; verification is lint + build + manual walkthrough (`npm run lint`, `npm run build`).

**Regression — a product with the feature off (do this first):**
1. Run the full flow on an existing product. Confirm: no `#customize` hash, no request to `/api/products/*/customization`, stepper reads 1-2-3, result renders.
2. In Supabase, check the new generation row: `customizations IS NULL`, and `prompt_used` equals exactly what `resolvePromptTemplate` returns for that category — no appended block, no trailing newline.

**Happy path — a product with the feature on:**
3. Admin → Customization: confirm the seeded Hair Colour / Hair Length options, edit a fragment, save.
4. Admin → Products → editor → Customization tab: enable, tick 3 colours + 2 lengths, save. Reload and confirm the ticks persisted (this is where the `ai_assets` PUT bug would reproduce if copied).
5. Customer flow: pick that style → customize screen appears with the first option of each attribute preselected → change the colour → generate.
6. Verify `generations.customizations` holds the two-entry snapshot and `prompt_used` ends with the customization block, precedence sentence included.
7. Compare output against the same style with a different colour — the images should visibly differ. If they don't, the precedence sentence in §2 is the thing to tune.

**Edge cases worth exercising by hand:**
8. Enable the flag on a product but attach no options → confirm the admin warning, and that the customer flow skips the customize screen.
9. Deactivate an option mid-session (customer already on the customize screen) → generation still succeeds, snapshot omits it.
10. Load `/#customize` directly in a fresh tab → lands on the style screen, no blank render.
11. As a guest with credits exhausted, trigger the login gate from the customize screen → complete OTP → confirm the generation carries the selections (guards the `useCallback` deps regression).
12. Flip `settings.customization_enabled` to false → customize screen still renders but the prompt is uncustomized within 60s (settings cache TTL).
