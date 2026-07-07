# Build Prompt: HairOriginals AI Try-On — MVP → V2

**How to use this file:** Paste this entire prompt as your first message to a coding agent (e.g. Claude Code) working inside the `hair-tryon` repository, with `context.md` and `current-state.md` also placed in the repo root (or pasted alongside this prompt). Everything below is written *to the agent*, not to you.

---

You are picking up engineering work on HairOriginals' AI hair try-on application. Two reference files sit alongside this prompt — read both **in full** before writing any code or proposing a plan:

- **`current-state.md`** — an exact audit of what exists in this repo today: tech stack, file structure, state shape, the one API route, and an explicit list of what's missing.
- **`context.md`** — the target V2 product and technical specification: the customer app, admin dashboard, generation-limit funnel, CRM integration, database schema, and analytics. Pay particular attention to §2 (the generation-limit funnel — this is the highest-priority business logic), §6 (database schema), and §11 (open questions that are *not yet decided* by the HairOriginals team).

## Objective

Evolve the current MVP — a stateless, no-auth, single-screen upload-and-generate tool — into the V2 platform described in `context.md`, **without breaking what already works**. The existing Gemini generation pipeline (`lib/gemini.ts`, `lib/prompt.ts`, `app/api/generate/route.ts`) is the one thing in this codebase that's already proven; extend it, don't throw it away.

## Ground Rules

1. **No persistence layer exists yet.** Every phase below depends on standing up a database and auth first (`context.md` specifies Supabase for both — use it, don't introduce a second system).
2. **Leave the app deployable after every phase.** Don't open a long-lived branch that breaks the working build for weeks. Each phase should be shippable on its own.
3. **Preserve the existing visual language** (dark aesthetic, glassmorphism, accessibility attributes already in place) unless `context.md` explicitly calls for a different interaction pattern — e.g. the product catalog browsing UI replaces manual product image upload, but it should still feel like the same app.
4. **No hardcoded business config.** Funnel numbers, model name, temperature, output resolution, max upload size, etc. must live in a `Settings` table (per `context.md` §5.6 / §2.3), not in code constants — that's the entire point of the "no code deployment required" requirement.
5. **For anything listed in `context.md` §11 (Open Questions):** implement the stated default, but keep it as a named, easily-changed config value and flag it back to me rather than burying the decision deep in business logic. Don't silently make a permanent architectural choice on something explicitly marked undecided.
6. **Confirm before starting a new phase** if your gap-analysis surfaces something that changes scope, or if you think the phase order below should change. Otherwise, proceed phase by phase without waiting for approval on every file.

## Suggested Phase Roadmap

This is ordered by dependency, with the most recently-prioritized business logic (the generation-limit funnel) placed as early as the data layer allows. Adjust if your own analysis of the codebase suggests a better order — just tell me why.

| Phase | Scope |
|---|---|
| **0 — Foundation** | Stand up Supabase. Schema for `Users`, `AdminUsers`, `Settings`, `DeviceSessions`, `GenerationCredits`, `Generations` (minimum needed for Phase 1). Wire Supabase Auth (Phone OTP). |
| **1 — Funnel & Persistence** | Implement the `GenerationCredits` ledger and the full Stage 0→3 funnel from `context.md` §2 (1 guest generation → login gate → 2 more → agent gate) inside the *existing* upload→generate→result flow. Persist every generation to the `Generations` table. Create a `Leads` record when the hard gate is hit. |
| **2 — Async Generation Pipeline** | Convert `/api/generate` from a single synchronous request into a job: create a `Generations` row with `status=pending`, return a job id, process in the background, add a status-polling endpoint. Update the frontend to poll instead of blocking on one long fetch. This is also the foundation for the future "Generation Queue" feature. |
| **3 — Product Catalog** | `Categories` / `Products` / `ProductImages` tables + a browsing UI, replacing the current manual "upload your own product photo" step. Basic admin CRUD for products/categories. |
| **4 — Admin Dashboard Core** | New `/admin` area with role-based access (Super Admin / Content Manager / Sales Agent per `context.md` §5.1). Dashboard home metrics, product/category management UI, AI Configuration settings page (including the funnel numbers from Phase 1), and a versioned Prompt Library migrating the logic currently hardcoded in `lib/prompt.ts`. |
| **5 — CRM & Analytics** | Leads UI for sales agents, agent actions (notes, manual credit grants per `context.md` §2.1 Stage 4), funnel/business/AI analytics dashboards, `AnalyticsEvents` instrumentation throughout the app. |
| **6 — Customer Dashboard** | Auth-gated dashboard: previous generations, saved/favourite products, profile & account settings. |
| **7 — Camera Capture & Validation** | Mode 2 guided camera flow (face detection, centering guide, lighting/distance validation, retake/review). Apply the *same* validation pipeline to uploaded photos too, per `context.md` §4.1 — this doesn't exist for either mode today. |
| **8 — Integrations & Polish** | Event/webhook bus skeleton for future Shopify/WhatsApp/email/push integrations, product search/filter, before/after comparison slider, remaining lower-priority future features. |

## Before You Write Any Code

Respond first with:

1. A short gap-analysis confirming you've read both reference files (don't just restate them — note anything in the actual codebase that `current-state.md` might have missed or gotten slightly wrong, since audits can drift from reality).
2. Your proposed phase plan — confirm the order above or propose changes, with reasoning.
3. Any blocking questions — distinct from `context.md` §11, which is already a known list; only raise things that would change *how* you build Phase 0/1, not product-level decisions that can wait.

Once that's confirmed, start on Phase 0.
