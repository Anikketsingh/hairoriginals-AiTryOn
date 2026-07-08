# HairOriginals AI Hair Try-On — Complete Engineering, Product & Business Audit

**Auditor role:** Head of Engineering & Product (architecture · code · UX · Shopify · CRM · AI · DevOps · growth)
**Original audit date:** 2026-07-07
**Last updated:** 2026-07-08 — Phase A (critical) and Phase B (reliability/hygiene) closed. See "Update Log" below.
**Method:** Full code inspection of `hair-tryon`. Every finding below is verified against source — file/line references included.
**Status of prior docs:** `current-state.md` / `PROJECT_AUDIT.md` describe the *original MVP* (upload-only, no DB) and are **stale**. `context.md` (V2 spec) and `UI_UX_AUDIT.md` (redesign log) reflect the *intended* target. This audit reflects the **actual current code**.

---

## 0. Update Log (2026-07-08)

Since the original audit, all five headline findings and the full Phase A/B roadmap (below) have been implemented and verified (`tsc --noEmit` clean, `eslint` clean vs. base, live smoke-tested against a running dev server). Summary of what shipped — details inline in each section, marked **✅ RESOLVED**:

1. **Admin auth + RBAC** — [proxy.ts](proxy.ts) (Next 16's renamed `middleware.ts`) gates `/admin*` and `/api/admin*` at the edge; [lib/admin-auth.ts](lib/admin-auth.ts) does the authoritative `requireAdmin(roles)` / `requireCostsAccess()` check against `admin_users.role` (super_admin / content_manager / sales_agent), called from every admin route; real email/password login at `/admin/login` plus a secret-gated [`/api/admin/bootstrap`](app/api/admin/bootstrap/route.ts) for the first super_admin.
2. **Durable generation** — [lib/jobs/runner.ts](lib/jobs/runner.ts) replaced the bare fire-and-forget call with `after()`, which extends the request lifecycle (via `waitUntil` on adapters that support it) past the response. Also added: one retry on transient Gemini errors and a 45s soft timeout ([lib/generation-queue.ts](lib/generation-queue.ts)), plus self-healing stale-job reconciliation in the status route (a job stuck >3 min auto-resolves to `failed`).
3. **Results out of Postgres** — new private `results` Storage bucket + `generations.result_image_path` column ([migration 20260707000001](supabase/migrations/20260707000001_result_storage.sql)); status/history routes now return short-lived signed URLs instead of base64; the full client flow (`page.tsx`, `ResultStep.tsx`, `BeforeAfterSlider.tsx`) was migrated to consume URLs.
4. **IDOR fixed** — [`/api/generate/status/[id]`](app/api/generate/status/[id]/route.ts) now requires `sessionToken` and checks `session_id`/`user_id` ownership before returning anything.
5. **Model/prompt config now live** — [lib/gemini.ts](lib/gemini.ts) validates the admin-configured model against an allowlist (`ALLOWED_GEMINI_MODELS`) instead of hardcoding it; [lib/generation-queue.ts](lib/generation-queue.ts) resolves and uses the `prompt_templates` library (category-matched → seeded "default" → hardcoded fallback), not just `prompt_override`.
6. **Analytics + CRM event bus wired** — `trackAnalyticsEvent()`/new `recordAnalyticsEvent()` ([lib/analytics.ts](lib/analytics.ts)) now fire at 12 real funnel transitions; `dispatchIntegrationEvent()` ([lib/event-bus.ts](lib/event-bus.ts)) now fires on `credit.granted`, `lead.created`, and `generation.completed`. Both were previously dead code with zero callers.
7. **Rate limiting + fail-fast env** — Upstash-backed limits on `/api/sessions` and `/api/generate` ([lib/rate-limit.ts](lib/rate-limit.ts)); `lib/supabase/server.ts` / `lib/supabase/env.ts` throw in production if env vars are missing instead of silently falling back to a local demo key.
8. **Request validation** — `zod` added; a shared [lib/validate.ts](lib/validate.ts) helper (`parseJsonBody`) now validates all 14 JSON-body routes (public + admin), returning a clean 400 with a field-level message instead of trusting `body?.field as T`.
9. **Small bug fixes** — `device_sessions.last_seen_at` → `last_seen` column mismatch fixed; the `.select(id, {count:"exact"}).length` inefficiency (fetched full rows to read a length) fixed in both lead-creation paths to use the returned `count` with `head: true`; `/api/leads`' `funnel_stage_at_creation` now computed via `getFunnelStage()` instead of guessed from login state; `next.config.ts`'s hardcoded personal LAN IP replaced with an opt-in `DEV_LAN_ORIGINS` env var.

**Still open** (unchanged from the original audit, see Roadmap): Phases C–H — UX/conversion ("Shop this look", trust signals, save-custom-looks), polling→Realtime, Shopify integration, deeper CRM automation (WhatsApp handoff, agent SLAs), AI cost/token capture + prompt A/B, and the broader business feature set (recommendations, referrals, multi-language). `lib/prompt.ts`'s hardcoded prompt is intentionally retained as the final fallback in `generateTryOn()` (below the DB template lookup), not dead code as originally characterized.

---

## 1. Executive Summary

The project is a **Next.js 16 + React 19 + Supabase (Postgres) + Google Gemini** virtual hair try-on with a working guest→login→agent funnel, a credits ledger, a product catalog, a customer flow (photo → style → generate → result), and an 8-page admin console. As of this update, the **V2 skeleton from `context.md` is fully wired for Phase A/B**: auth, durable execution, storage, IDOR, rate limiting, analytics, and the CRM event bus are all live. What remains is genuinely new product work (Phases C–H), not remediation.

### The five findings that mattered most — now resolved

| # | Original severity | Finding | Status |
|---|----------|---------|-----------------|
| 1 | 🔴 Critical | The entire `/admin` UI and every `/api/admin/*` route was completely unauthenticated. | ✅ **RESOLVED** — [proxy.ts](proxy.ts) + [lib/admin-auth.ts](lib/admin-auth.ts) RBAC on every route. See §9. |
| 2 | 🔴 Critical | Generation was "fire-and-forget" background work with no `after()`/`waitUntil()` and no worker. | ✅ **RESOLVED** — [lib/jobs/runner.ts](lib/jobs/runner.ts) uses `after()`; retry + timeout added. See §5, §10. |
| 3 | 🔴 Critical | Generated images + selfies were stored as base64 `TEXT` in Postgres; `/api/generate/status/[id]` had no ownership check (IDOR). | ✅ **RESOLVED** — Results moved to a private Storage bucket + signed URLs; ownership check added. See §6, §9. |
| 4 | 🟠 High | The admin-configurable Gemini model was ignored; prompt library unused. | ✅ **RESOLVED** — Model validated against an allowlist and applied; prompt library resolved category→default→fallback. See §10. |
| 5 | 🟠 High | Analytics and the integration/event bus were dead code — zero callers. | ✅ **RESOLVED** — 12 analytics events + 3 CRM event types now fire from real routes. See §16. |

**Bottom line:** The prototype is now secure and functionally reliable for the funnel it implements. The next investment should go into conversion/business features (Phase C+) rather than further remediation — see the updated Roadmap (§18).

---

## 2. System Architecture (as-built, updated)

```
                            BROWSER (mobile-first, React 19 client)
   app/(customer)/page.tsx  ── step machine: home → photo → style → result
     │  useSession()  → localStorage token + fingerprint
     │  supabaseClient (anon key) → Supabase Auth (phone OTP)
     ▼
   ┌──────────────────────── Next.js Route Handlers (service-role) ────────────────────────┐
   │  POST /api/sessions            rate-limited, zod-validated → device_session + credits  │
   │  POST /api/auth/complete       verify OTP token, link session→user, grant bonus         │
   │  POST /api/generate            gate → rate-limit → consume credit → insert(pending)     │
   │                                → enqueueGenerationJob()  via after() ✅ durable          │
   │  GET  /api/generate/status/id  poll job — sessionToken + ownership check ✅, signed URL  │
   │  POST /api/leads               CRM lead + dispatchIntegrationEvent('lead.created') ✅    │
   │  GET  /api/products,/categories,/customer/history,/customer/saved                        │
   │  /api/admin/*                  requireAdmin(roles) on every route ✅                     │
   │  proxy.ts                      edge-level session gate on /admin*, /api/admin* ✅        │
   └───────────────────────────────────────────────────────────────────────────────────────┘
     │                         │
     ▼                         ▼
   Supabase Postgres      Google Gemini (model from admin setting, allowlist-validated)
   (RLS on; route-level    via @google/genai, server-side key, retry + 45s timeout
    authz is the real
    boundary now)
   Supabase Storage — product images + results (signed URLs, private bucket) ✅

   integration_events table ← dispatchIntegrationEvent() ✅ live: credit.granted, lead.created,
                                generation.completed
   analytics_events   table ← trackAnalyticsEvent() / recordAnalyticsEvent() ✅ live: 12 events
```

**Sound decisions (unchanged):** Option-A data plane, the credits *ledger* model, `consume_one_credit` with `FOR UPDATE SKIP LOCKED`, products in the platform DB not Shopify.

**Architectural gaps that remain:**
- **No worker consuming `integration_events`.** Events are now produced (credit.granted, lead.created, generation.completed) but nothing drains the queue to an actual CRM/WhatsApp/Shopify integration yet — that's Phase F.
- **Result storage bucket has no lifecycle/retention policy** — signed URLs expire (10 min) but the underlying objects persist indefinitely; no cleanup job for abandoned/failed generations.
- **RLS is enabled but still not the real authorization boundary** — every route uses service-role; authz is enforced at the route-handler level (`requireAdmin`, ownership checks) rather than in Postgres policies. This is an accepted, defensible tradeoff now that route-level authz actually exists (it didn't before this update), but worth revisiting if a direct-DB access path is ever added.

---

## 3. Folder Structure Analysis

Organization remains good and matches Next.js App Router conventions. Additions since the original audit:

- `proxy.ts` (repo root) — Next 16's renamed middleware; admin edge gate.
- `lib/admin-auth.ts` — authoritative admin RBAC (`requireAdmin`, `requireCostsAccess`).
- `lib/jobs/runner.ts` — `after()`-based job scheduling.
- `lib/rate-limit.ts` — Upstash-backed rate limiting.
- `lib/validate.ts` — shared zod request-validation helper.
- `lib/supabase/{env,proxy,server-auth,admin-browser-client}.ts` — split out from the original `client.ts`/`server.ts` to support the admin auth session (browser + proxy + server variants) and fail-fast env resolution.
- `app/admin/login/` — admin login page (distinct from the customer-facing `app/(admin)/admin/` console it protects).
- `app/api/admin/bootstrap/` — one-time super_admin creation endpoint.
- `supabase/migrations/20260707000001_result_storage.sql`, `20260707000002_products_bucket.sql`.

**Nits (unchanged):** root still has process docs + stray `person.png`/`style.png`/`.next` artifacts; `lib/prompt.ts` is retained by design as the final prompt fallback (not legacy dead code — see Update Log).

---

## 4. Code Quality Report (updated)

**Critical — both resolved**
- ~~No admin auth~~ ✅ RESOLVED — see §9.
- ~~Fire-and-forget generation~~ ✅ RESOLVED — see §5, §10.

**High — both resolved**
- ~~Model setting ignored~~ ✅ RESOLVED — `lib/gemini.ts` now exports `ALLOWED_GEMINI_MODELS`/`isAllowedGeminiModel`; `generation-queue.ts` resolves and passes the validated model.
- ~~Column mismatch (`last_seen_at` vs `last_seen`)~~ ✅ RESOLVED — `generation-queue.ts` now calls `touchSession()` (the correct helper) instead of an inline update against the wrong column.
- ~~IDOR on status polling~~ ✅ RESOLVED — see §9.
- ~~Dead code: `event-bus.ts`/`analytics.ts` unused~~ ✅ RESOLVED — both now have real callers (§16). `lib/prompt.ts` reclassified: it's the intentional final fallback in `generateTryOn()`, not legacy.
- **`any` types & undocumented casts** — still present: [app/api/admin/upload/route.ts](app/api/admin/upload/route.ts), the `products(prompt_override)` triple-cast in [generation-queue.ts](lib/generation-queue.ts). Low priority, not blocking.

**Medium**
- ~~Inefficient counts (`.select(id,{count:"exact"}).length`)~~ ✅ RESOLVED — [app/api/leads/route.ts](app/api/leads/route.ts) and [app/api/generate/route.ts](app/api/generate/route.ts)`createLeadIfNeeded` now use `{count:"exact", head:true}` and read `count` directly.
- ~~`select("*")` pulls base64 into admin costs/logs~~ ✅ RESOLVED — [app/api/admin/costs/route.ts](app/api/admin/costs/route.ts) now selects explicit columns for `recentGenerations`.
- ~~Hardcoded dev leftovers (`allowedDevOrigins`)~~ ✅ RESOLVED — now driven by `DEV_LAN_ORIGINS` env var, empty by default.
- ~~Hardcoded Supabase demo keys as fallback~~ ✅ RESOLVED — fail-fast in production via `lib/supabase/server.ts`/`env.ts`.
- ~~No input schema validation~~ ✅ RESOLVED — zod applied to all 14 JSON-body routes via `lib/validate.ts`.
- `bodySizeLimit: "25mb"` under `experimental.serverActions` still doesn't govern the `/api/generate` **route handler** body (Server Actions setting, not applicable) — cosmetic/misleading config, not a functional bug since the route handler has no body-size cap of its own to misconfigure. Low priority.

**Low**
- Duplicated `createLeadIfNeeded` logic between `generate/route.ts` and `leads/route.ts` — unchanged, both now share the same count/dispatch/analytics pattern but are still two implementations.
- Pre-existing `react-hooks/set-state-in-effect` lint warning in `StyleStep.tsx`, and an unused `IconButton` import warning in `ResultStep.tsx` — both confirmed pre-existing (present on the base commit before this update), unrelated to the changes made.
- Cost is still a flat `₹5.00/generation` guess ([costs/route.ts](app/api/admin/costs/route.ts)), not derived from real Gemini pricing/tokens — Phase G.

---

## 5. Bug Report (behavioral, updated)

| Severity | Bug | Status |
|---|---|---|
| ~~🔴~~ | Generations never complete on serverless | ✅ RESOLVED — `after()`-based job runner |
| ~~🔴~~ | Any user reads any result image | ✅ RESOLVED — ownership check + signed URLs |
| ~~🟠~~ | `device_sessions.last_seen_at` write fails (wrong column) | ✅ RESOLVED |
| ~~🟠~~ | Admin model/prompt-library settings have no effect | ✅ RESOLVED |
| ~~🟠~~ | Funnel analytics dashboard is empty (no instrumentation) | ✅ RESOLVED — 12 events now fire; dashboard has data to query (dashboard UI itself still needs to be built/verified against real data — see §18 Phase H) |
| 🟡 | Gate can be swipe-dismissed | `Sheet onClose`/`onDismiss` in [FunnelGate](components/FunnelGate.tsx) | Unresolved — not a bypass (still no credits), just confusing. Low priority. |
| ~~🟡~~ | `/api/leads` sets `funnel_stage_at_creation` by login-state, not real stage | ✅ RESOLVED — now computed via `getFunnelStage()` |
| 🟡 | Guest quota resets on cleared storage/incognito | By design (`context.md` §2.4) — accepted soft gate, unchanged. |
| 🟡 | Only catalog products can be Saved | [ResultStep.tsx](components/flow/ResultStep.tsx) | Unresolved — Phase C. |
| 🟡 | Camera "face guidance" is cosmetic | [CameraCapture](components/CameraCapture.tsx) | Unresolved — no detector wired; Phase C/G. |
| 🟢 | No upload-photo quality gate on the API side | Unresolved — client-side validation is advisory only; server-side zod validates shape/type/size of the request but not image content/quality. |

---

## 6. Performance Report (updated)

- ~~**Base64-in-DB is the dominant problem.**~~ ✅ RESOLVED — results now live in Supabase Storage; status/history return signed URLs, not inline base64.
- **No caching/CDN for results** — still open; signed URLs are short-lived (10 min) by design (privacy over cacheability), which is a reasonable tradeoff but means no CDN caching of result images. Worth revisiting with a longer TTL + cache-control once traffic justifies it.
- **Polling every 1.5s for up to 90s** — still unresolved. Now that a real job/worker layer exists (`after()`), Supabase Realtime subscription or exponential backoff is a cleaner replacement — Phase D.
- **`settings` cache (60s in-memory)** — unchanged; per-instance, low hit rate on scaled deployments.
- **Analytics/history endpoints have no pagination** — unchanged; `analytics_events` now receiving real write volume (12 event types), so an admin dashboard reading it unpaginated will need this before traffic grows. Elevated from a latent issue to a near-term one.
- **Bundle** — added `zod`, `@upstash/ratelimit`, `@upstash/redis`, `@supabase/ssr` since the original audit; still lean, no obvious bloat.

---

## 7. UI/UX Review (customer app) — unchanged from original audit

The redesign in `UI_UX_AUDIT.md` shipped and remains a real improvement. Remaining gaps (Home trust signals, custom-look saving, generating-screen ETA/cancel, "Shop this look" on result) are unchanged — see Phase C in the Roadmap. One line item resolved: the admin console now has real authentication (no more "hardcoded Super Admin Active badge with no login").

---

## 8. Mobile Experience Review — unchanged from original audit

No mobile-specific work was in scope for this update. Recommendations (real-device testing, slow-network/camera-permission-denied handling) still stand.

---

## 9. Security Audit (updated)

| Severity | Issue | Status |
|---|---|---|
| ~~🔴~~ | Admin fully unauthenticated | ✅ **RESOLVED** — [proxy.ts](proxy.ts) edge gate (redirects to `/admin/login` or 401s `/api/admin/*` if no Supabase session) + [lib/admin-auth.ts](lib/admin-auth.ts)`requireAdmin(roles)` authoritative check against `admin_users.role` on every admin route; costs additionally gated by `requireCostsAccess()` (super_admin always, content_manager only if the `content_manager_can_see_costs` setting is on). |
| ~~🔴~~ | IDOR on generation results | ✅ **RESOLVED** — [status/[id]](app/api/generate/status/[id]/route.ts) requires `sessionToken`, resolves the session, and 403s unless `generation.session_id === session.id` or `generation.user_id === session.user_id`. |
| 🟠 | Unauthenticated file upload → public bucket | ✅ **PARTIALLY RESOLVED** — [admin/upload/route.ts](app/api/admin/upload/route.ts) is now behind `requireAdmin(["super_admin","content_manager"])` and uses a pre-created bucket (no more per-request `createBucket`); MIME/size validation was already present. Still open: no magic-byte sniffing. |
| 🟠 | Session token in URL path | Unresolved — `GET /api/sessions/[token]` and history queries still pass the token as a path/query param rather than a header/cookie. Not addressed in this pass. |
| ~~🟠~~ | No rate limiting anywhere | ✅ **RESOLVED** — Upstash sliding-window limits on `/api/sessions` (10/min/IP) and `/api/generate` (20/min/session-or-IP) via [lib/rate-limit.ts](lib/rate-limit.ts). Note: fails **open** (no limiting) if `UPSTASH_REDIS_REST_URL`/`TOKEN` are unset — confirm these are set in production. |
| 🟠 | No server-side upload content validation | Unresolved — zod now validates request *shape* (types, presence, enums) but not image *content* (magic bytes, dimensions, re-encoding to strip payloads). |
| ~~🟡~~ | No JSON schema validation | ✅ **RESOLVED** — zod applied to all 14 JSON-body routes via [lib/validate.ts](lib/validate.ts); ID-shaped fields (`productId`, `leadId`, `versionId`, etc.) validated as UUIDs. |
| 🟡 | Prompt injection via `prompt_override` | Partially addressed — this field is now behind `requireAdmin(["super_admin","content_manager"])` on the products routes (it wasn't gated by anything before), so the original concern ("restrict who can edit prompts once admin auth exists") is satisfied. |
| ~~🟡~~ | Hardcoded demo keys as fallback | ✅ **RESOLVED** — production throws on missing env instead of falling back. |

No secrets are committed (`.env*` gitignored). RLS remains enabled-but-inert by design; route-level authz is now the real boundary, which is sound now that it actually exists everywhere.

---

## 10. AI Pipeline Review (updated)

**Flow (updated):** `route → rate-limit → gate-check → consume credit → insert generation(pending) → after()-scheduled job → resolve prompt (override → category template → default template → hardcoded fallback) → resolve + allowlist-validate model → generateWithRetry (Gemini, 45s timeout, 1 retry on transient errors) → upload to Storage → mark completed + fire analytics/event-bus → poll returns signed URL`.

**Resolved:**
1. ~~No durable execution~~ ✅ — `after()`-based runner.
2. ~~Model & prompt library not honored~~ ✅ — allowlist-validated model, resolved prompt template chain.
3. ~~No retries / timeout budget~~ ✅ — one retry on transient errors (timeout/ECONNRESET/5xx/429 pattern match), 45s soft timeout, plus a 3-minute stale-job self-heal in the status route as a last-resort backstop.

**Still open:**
4. **No cost/token capture** — cost is still a flat estimate; real usage/latency per call isn't recorded beyond `duration_ms`. Phase G.
5. **No caching** of (person+product+prompt) → dedupe "generate again". Phase G.
6. **No server-side face/quality gate** — advisory client checks only. Phase G/C.
7. **No fallback model** — allowlist currently has exactly one entry (`gemini-3.1-flash-image`); a real fallback chain (e.g. try a second model on repeated failure) isn't implemented, just the validation groundwork for one.

---

## 11. Shopify Integration Blueprint — unchanged, still not started (Phase E)

## 12. CRM Integration Blueprint (updated)

The event-bus **producer** side is now live — `dispatchIntegrationEvent()` fires on `credit.granted`, `lead.created`, and `generation.completed`, each landing a `pending` row in `integration_events` with a structured payload (ids, source, amounts, timestamps). What's still missing is the **consumer**: no worker drains that table to an actual CRM (LeadSquared), WhatsApp, or Shopify. The architecture diagram from the original audit is now half-built:

```
Stage 3 gate / "Talk to expert" / result "Get recommendation"
      │  create/update leads row (internal mirror — audit trail)
      ▼  dispatchIntegrationEvent('lead.created', payload, 'crm')     ✅ WIRED
integration_events (pending)
      ▼  worker (Edge Function/cron) with retry + backoff + idempotency key   ❌ NOT BUILT — Phase F
CRM API (LeadSquared)  →  status delivered/failed + error_log
      ▼
WhatsApp/callback automation → agent assignment → follow-up → sale
```

Remaining gaps unchanged from original: `products_tried`/`selfie_refs` still default `[]` (lead payload isn't fully populated), no retry/idempotency/DLQ on delivery (there's nothing consuming yet to need it), no WhatsApp automation, no round-robin agent assignment. This is the natural next phase given the producer side now exists.

---

## 13. API Specification (current, updated)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/sessions` | none (by design) | rate-limited (10/min/IP) ✅, zod-validated body ✅ |
| GET | `/api/sessions/[token]` | token-in-path | unchanged — still a path param, not a header |
| POST | `/api/auth/complete` | Bearer (Supabase) | zod-validated ✅; fires `login_completed` analytics + `credit.granted` event |
| POST | `/api/generate` | session token | rate-limited (20/min) ✅; durable via `after()` ✅; fires `gate_shown`/`generate_started` analytics + `lead.created` event on stage-3 |
| GET | `/api/generate/status/[id]` | **sessionToken + ownership check** ✅ | returns signed URL, not base64 ✅ |
| GET | `/api/products`, `/api/categories` | none | public catalog (fine) |
| GET | `/api/customer/history` | token in query | returns signed URLs ✅ (was base64); still no pagination |
| POST/GET | `/api/customer/saved` | token | zod-validated ✅ (`productId` enforced as UUID); fires `saved` analytics |
| POST | `/api/leads` | token | zod-validated ✅; fires `lead.created` event + `lead_created` analytics; real funnel stage ✅ |
| POST | `/api/analytics/track` | token | zod-validated ✅; now has real callers client + server-side ✅ |
| ALL | `/api/admin/*` | **`requireAdmin(roles)`** ✅ | RBAC per route; zod-validated bodies ✅ |
| POST | `/api/admin/bootstrap` | shared secret header | new — one-time super_admin creation, self-disables after first use |

**Convention gaps still open:** no versioning (`/api/v1`), inconsistent auth mechanisms (path token vs header vs cookie-session for admin), no standard error envelope (though all errors are now at least schema-validated 400s vs. arbitrary 500s), no pagination.

---

## 14. Webhook / Event Specification — producer built, consumer still to build (Phase F, see §12)

---

## 15. Business Feature Recommendations — unchanged, still the priority list for Phase C+

1. **"Shop this look" on the result screen** — still the biggest conversion gap.
2. **Build the CRM event-bus consumer + WhatsApp handoff** — the producer side (this update) unblocks this; it's no longer blocked on "nothing dispatches events," just on building the worker.
3. ~~Instrument the funnel~~ ✅ done — the analytics dashboard now has real data to build against.
4. Face-shape/density recommendations — unchanged, Phase H.
5. Trust & proof on Home/result — unchanged, Phase C.

---

## 16. Analytics Plan (updated — now implemented)

**Events now firing** (`analytics_events`, via `trackAnalyticsEvent()` client-side / `recordAnalyticsEvent()` server-side):

| Event | Fired from | Trigger |
|---|---|---|
| `session_created` | `/api/sessions` | new device session + guest credits granted |
| `login_completed` | `/api/auth/complete` | phone OTP verified, session linked, bonus granted |
| `photo_added` | `PhotoStep.tsx` | selfie chosen (upload, drag-drop, or camera) |
| `style_selected` | `StyleStep.tsx` | catalog product or custom upload chosen |
| `gate_shown` | `/api/generate` | stage 1 (login) or stage 3 (agent) gate returned |
| `generate_started` | `/api/generate` | credit consumed, job enqueued |
| `generate_completed` | `lib/generation-queue.ts` | job succeeded, result uploaded |
| `generate_failed` | `lib/generation-queue.ts` | job failed after retry |
| `lead_created` | `/api/leads`, `/api/generate` (agent-gate auto-lead) | new lead row inserted |
| `saved` | `ResultStep.tsx` | result added to saved looks |
| `shared` | `ResultStep.tsx` | native share sheet completed |
| `downloaded` | `ResultStep.tsx` | image downloaded to device |

**CRM events now dispatching** (`integration_events`, via `dispatchIntegrationEvent()`): `credit.granted` (wired once, centrally, in `grantCredits()` — covers guest/bonus/agent/promo grants uniformly), `lead.created`, `generation.completed`.

**Not instrumented** (no backing feature yet, so nothing real to track): `shop_this_look_clicked`, `whatsapp_clicked` (Phase C/E), `consultation.booked`, `purchase.completed` (Phase F/H).

**Still to build:** the actual funnel dashboard UI reading this table (stage-transition rates, cost-per-lead) — data now exists, visualization doesn't yet. Device/geo/returning-user dimensions still absent. No pagination on the underlying query path if an admin analytics route reads this at volume.

---

## 17. Infrastructure / DevOps (updated)

- ~~No deployment config~~ — still no Dockerfile/CI/vercel.json; this update didn't add deployment tooling, but the app is now *compatible* with serverless deployment in a way it wasn't before (durable jobs via `after()`, fail-fast env, rate limiting all assume/support a Vercel-like target).
- ~~Move generated results to Supabase Storage~~ ✅ RESOLVED.
- **Add:** rate limiting ✅ done (Upstash); `middleware.ts`/`proxy.ts` auth ✅ done; error monitoring (Sentry), structured logging, DB backups/PITR, migration CI, staging env — still open.
- **Config hygiene:** `allowedDevOrigins` hardcode ✅ removed; demo-key fallbacks ✅ removed in prod; `bodySizeLimit` misconfiguration note still open (cosmetic).
- **New dependency risk:** the app now has a hard runtime dependency on Upstash Redis for rate limiting (fails open if unset — confirm env vars are provisioned before relying on this in production) and on `ADMIN_BOOTSTRAP_SECRET` being rotated/removed after first use.

---

## 18. Prioritized Roadmap & Effort (updated)

### ~~Phase A — Critical~~ ✅ **COMPLETE**
All of A1–A6 (admin auth+RBAC, durable generation, results→Storage, IDOR fix, `last_seen`/model-setting fixes, rate limiting+fail-fast env) shipped and verified.

### ~~Phase B — Architecture & reliability~~ ✅ **MOSTLY COMPLETE**
Event bus producer + analytics instrumentation ✅, zod validation + count-inefficiency/funnel-stage bug fixes ✅. Remaining from the original Phase B scope: standard error envelope (partially achieved via zod's consistent 400s, but no unified envelope shape across all error types), pagination, Sentry/structured logging, consolidating fully onto the DB prompt library (currently a resolution chain, which is arguably better than full consolidation). Call this **~80% done** — the remaining 20% is logging/observability infra, not urgent.

### Phase C — UX / conversion polish · ~1.5 weeks (unchanged, not started)
"Shop this look" + price on result; Home trust/onboarding; save custom looks; ETA/cancel on generating; accessibility pass; real camera face-detection (or honest cosmetic framing). — **6–8 d**

### Phase D — Performance · ~1 week (unchanged, not started)
Realtime/backoff instead of 1.5s polling; CDN/caching for results (balance against the current short signed-URL TTL); index/measure hot queries; paginate `analytics_events`/history reads before they're read at volume. — **4–5 d**

### Phase E — Shopify · ~2–3 weeks (unchanged, not started)
Catalog sync + webhooks; cart/Draft-Order deep links; Theme App Extension + App Proxy embedding. — **10–15 d**

### Phase F — CRM · ~1.5–2 weeks (**producer built, consumer remains**)
Build the `integration_events` worker (Edge Function/cron) with retry/backoff/idempotency/DLQ; LeadSquared adapter; WhatsApp automation; agent assignment + SLAs; populate the full lead payload (`products_tried`/`selfie_refs`). Original estimate reduced slightly since event dispatch already exists. — **6–10 d**

### Phase G — AI quality/cost · ~1–1.5 weeks (retries/timeout done; rest not started)
Real fallback model chain (allowlist currently has one entry); token/cost capture; result caching; prompt A/B. — **4–6 d** (reduced from original 5–7 d)

### Phase H — Business features · ~3–4 weeks (unchanged, not started)
Funnel analytics dashboard UI (data now exists to build it on); recommendations engine; comparison/favorites; referral/promo credits; multi-language; quiz/consultation booking. — **15–20 d**

**Indicative remaining effort to a full V2:** ~**8–11 weeks** single-engineer (was 11–15 weeks; Phase A/B closure accounts for the reduction). C/D are the next highest-leverage slice; F is now cheaper than originally scoped since the event producer exists.

---

## 19. Risk Assessment (updated)

- ~~Security/PII exposure (admin)~~ ✅ **RESOLVED** — was near-certain/catastrophic, now gated by RBAC.
- ~~Feature non-function on serverless~~ ✅ **RESOLVED** — durable via `after()`.
- **Cost blow-up** — *reduced but not eliminated.* Base64/DB bloat resolved; rate limiting now caps abuse volume (contingent on Upstash env vars actually being set in prod — verify this); no input quality gate or real cost/token tracking yet (Phase G).
- **New risk: rate limiting fails open** if `UPSTASH_REDIS_REST_URL`/`TOKEN` are unset in the deployment environment — the code warns via `console.warn` but does not block. Treat as a pre-launch checklist item, not a code gap.
- **New risk: `ADMIN_BOOTSTRAP_SECRET`** must be rotated or unset after the first super_admin is created — the endpoint self-disables once any `admin_users.auth_id` is populated, but the secret itself should not remain live/logged.
- Guest-quota bypass — *medium, accepted* per spec, unchanged.
- Vendor coupling (single Gemini model in the allowlist, no real fallback) — *medium,* unchanged. Phase G.
- Data model drift — keep this doc as the source of truth; re-verify against code before the next planning cycle.

---

## 20. Quick Wins — all done

1. ~~IDOR fix~~ ✅
2. ~~`last_seen_at`→`last_seen`~~ ✅
3. ~~Make `gemini_model` setting actually drive the call~~ ✅
4. ~~Call `trackAnalyticsEvent` at the funnel transitions~~ ✅ (12 events, exceeds the original "6 transitions" scope)
5. ~~Remove `allowedDevOrigins` hardcode + demo-key fallbacks~~ ✅
6. ~~Trim `select("*")`/base64 from admin & history payloads~~ ✅
7. ~~Add a `middleware.ts`/`proxy.ts` stub gating `/admin`~~ ✅ (shipped as full RBAC, not just a stub)

No quick wins remain outstanding from the original list. Next quick-win candidates worth scoping: paginate `/api/customer/history` and any future analytics-reading admin route; add magic-byte sniffing to upload validation; move `sessionToken` off the URL path.

## 21. Long-Term Vision (6–12 months) — unchanged from original audit

---

### Appendix — Verified tech stack (updated)
Next.js 16.2.9 · React 19.2.4 · TypeScript 5 · Tailwind v4 · `@google/genai` 2.10.0 (`gemini-3.1-flash-image`, now allowlist-validated rather than hardcoded-only) · `@supabase/supabase-js` 2.108 · `@supabase/ssr` (added — admin session handling) · `zod` (added — request validation) · `@upstash/ratelimit` + `@upstash/redis` (added — rate limiting) · Supabase Postgres + Storage + Auth (phone OTP + admin email/password) · lucide-react. 12 migrations (2 added since original audit). No tests, no CI, no deployment config present — unchanged gaps.
