# HairOriginals AI Platform — V2 Context & Specification (Revised)

**Status:** Working draft — supersedes the original V2 PRD
**Last updated:** June 29, 2026
**Purpose of this file:** This is the canonical context document for anyone (human or AI agent) building HairOriginals AI Platform V2. It captures product requirements, the updated generation-limit funnel, architecture decisions, and the data model — and explicitly flags what changed from the original draft and what's still undecided.

---

## 0. How to Use This File

- Section 1 summarizes what changed and why — read this first if you've seen the original PRD.
- Sections 2 onward are the full spec, written to stand alone (you shouldn't need the original PDF to build from this).
- Section 11 ("Open Questions") lists decisions that are still pending sign-off from the HairOriginals team. Don't treat assumptions elsewhere in this doc as immovable — check Section 11 first.

---

## 1. Summary of Key Changes from the Original Draft

| Area | Original Draft | Revised in This Doc | Why |
|---|---|---|---|
| Generation funnel | Guest: 3 free → login → unlimited | Guest: **1** free → login required → **2** more → hard gate → mandatory agent contact | Converts high-intent users into sales leads faster; caps AI spend from anonymous traffic |
| Quota mechanism | Implied simple counter | **Generation Credits ledger** (NEW) | Lets admin/agent grant bonus credits later without new code paths |
| Photo validation | Face checks only on camera-capture mode | Same validation pipeline applied to **uploaded** photos too (NEW) | Uploaded photos currently have zero quality gate, which risks bad AI output |
| Generation processing | Implied synchronous request | **Async job queue** with status polling (NEW) | Avoids timeouts on slow generations; is also the foundation the "Generation Queue" future feature needs anyway |
| Integrations (Shopify, WhatsApp, etc.) | Described as "optional, not tightly coupled" with no mechanism | Concrete **event/webhook bus** (NEW) | Gives the decoupling requirement an actual implementation, not just a goal |
| Admin roles | Single implicit "Admin" role | **Role-based access**: Super Admin / Content Manager / Sales Agent (NEW) | Sales agents now use this system daily once the agent-gate ships; they shouldn't need full admin rights |
| Analytics | General business/AI/product analytics | Added **funnel-stage conversion analytics** specific to the new gate (NEW) | This funnel is now your core lead-gen mechanism — it needs its own dashboard |
| Guest abuse | Not addressed | Flagged explicitly as a known, accepted limitation (NEW) | "1 free generation" for anonymous users is a soft gate, not a hard guarantee — see §2.4 |

---

## 2. Core Funnel: Generation Limits & Agent Handoff

This is the most consequential behavioral change in V2 — read carefully before implementing.

### 2.1 Funnel Stages

```
STAGE 0 — Guest (Anonymous)
   │   Quota: 1 generation   [config: guest_free_generations]
   │   Identity: device/session fingerprint only (not a real account)
   ▼
[1 generation consumed]
   ▼
STAGE 1 — Login Gate (hard block, no further generation without this)
   │   Copy: "Loved how that looked? Sign in to unlock 2 more free try-ons."
   │   Auth: Phone OTP via Supabase
   ▼
[Account created / logged in]
   ▼
STAGE 2 — Registered User
   │   Quota: +2 generations   [config: registered_bonus_generations]
   │   Cumulative without agent contact: 1 + 2 = 3
   ▼
[2 generations consumed → quota fully exhausted]
   ▼
STAGE 3 — Agent Gate (hard block)
   │   Copy: "You've tried 3 looks! Talk to a HairOriginals stylist to
   │          find your perfect match and unlock more try-ons."
   │   Action: auto-create CRM lead with full generation history
   ▼
STAGE 4 — Agent-Unlocked (optional, NEW)
   │   A sales agent or admin manually grants bonus credits from the
   │   Admin Dashboard / CRM after speaking with the customer.
   │   This re-opens access without a separate code path — it's just
   │   another entry in the same credits ledger.
```

### 2.2 Why a Credits Ledger, Not a Simple Counter

Use a `GenerationCredits` ledger per user (or guest session) instead of one decrementing field:

- Every grant — guest free try, registered bonus, agent-unlocked, future referral/promo — is its own ledger row with a **source**, **amount**, and optional **expiry**.
- Remaining balance = sum(grants) − sum(consumed).
- This means future growth levers (referral credits, promo codes, win-back campaigns) are just new grant sources — no new gating logic required.
- Analytics can report exactly where each user's credits came from, which is useful for understanding what actually drives conversions.

### 2.3 Configurable Parameters (Admin → AI Settings)

| Setting | Default | Notes |
|---|---|---|
| `guest_free_generations` | 1 | Per the new requirement |
| `registered_bonus_generations` | 2 | Per the new requirement |
| `agent_gate_enabled` | true | Kill switch if the team wants to disable the hard gate temporarily |
| `login_gate_message` | editable text | Shown at Stage 1 |
| `agent_gate_message` | editable text | Shown at Stage 3 |
| `allow_agent_credit_grants` | true | Whether Stage 4 is available at all |
| `max_agent_grant_per_action` | 5 | Prevents an agent from granting unlimited credits in one click |
| `registered_monthly_refresh` | 0 (disabled) | Optional growth lever — see §2.6 |

All of these must be editable from the Admin Dashboard with no code deployment, consistent with the rest of the platform's "no-code config" principle.

### 2.4 Guest Tracking — an Honest Limitation

Guests have no account, so "1 free generation" is enforced via a combination of:
- a short-lived device/browser fingerprint + local token, and
- IP-based heuristics as a secondary signal.

This deters casual reuse but **is not bypass-proof** — clearing storage or using incognito mode can reset it. This is an accepted trade-off: requiring phone verification before *any* generation would protect the quota perfectly but kill the "try before you sign up" value the whole funnel depends on. Worth confirming the team is comfortable with this trade-off (see §11).

### 2.5 CRM Lead Trigger Points

- **Primary:** Stage 3 reached (full quota exhausted) — always creates or updates a lead.
- **Secondary** (carried over from original spec): an explicit "Talk to an Expert" button, available at any stage, for users who want to skip ahead.
- **Lead payload:** Name, Phone, Uploaded Selfie(s), Products Tried, Number of Generations, Saved/Favourite Products, Last Activity, Generated Images, **and the funnel stage at time of creation** (NEW — tells the agent how "warm" the lead is and how many free tries they've already used).

### 2.6 Optional Growth Lever (disabled by default)

To avoid contradicting the explicit requirement above, this is off by default — but worth having configurable: a small monthly credit refresh for registered users (`registered_monthly_refresh`) to bring lapsed users back without forcing every return visit through agent contact. Leave at 0 unless/until the team wants to test it.

---

## 3. Overall Architecture

```
Customer Application
   │
   ▼
Generation API  ──────────────►  Generation Job Queue ──► Gemini Image Generation
   │                                                            │
   ▼                                                            ▼
Database  ◄─────────────────────────────────────────────  Job Result
   ▲
   │
Admin Dashboard ──► Event/Webhook Bus ──► (Shopify Sync / CRM / WhatsApp / Email / Push)
```

Key principles (carried over and reinforced):
- The customer app **never** talks to Shopify directly. Products live entirely in the platform's own database, managed via the Admin Dashboard.
- Generation requests go through a **job queue**, not a synchronous call — the client gets a job ID immediately and polls/subscribes for status. This avoids timeout issues on slow Gemini responses and is the natural foundation for the "Generation Queue" feature already on the future-features list, so it's worth building this way from the start rather than retrofitting it later.
- All third-party integrations (Shopify, WhatsApp, Email, Push, Payment Gateway) sit behind an **event/webhook bus**, not direct calls from core app logic. This gives the "should remain optional and not tightly coupled" requirement an actual mechanism instead of just being a goal.

---

## 4. Customer Application

### 4.1 Landing & Image Capture

Two modes, as in the original spec:

**Mode 1 — Upload Photo**
```
Upload Photo → Crop (future) → Quality Validation (NEW) → Choose Product → Generate → Result
```

**Mode 2 — Camera Capture**
```
Open Camera → Live Face Detection → Face Guidance → Capture → Review → Choose Product → Generate
```

Camera guidance includes: face detection, centering guide, oval overlay, lighting validation, single-face validation, distance guidance, retake option, and a review screen before continuing. Auto-capture once all validations pass is a future enhancement.

**NEW:** Apply the *same* validation pipeline (single face, adequate lighting, reasonable framing) to **uploaded** photos, not just camera captures. If validation fails, show a "Retake / Reupload" prompt with a "Continue anyway" override — warn, don't hard-block, since some users may legitimately want to override it.

### 4.2 Product Selection

Products are browsed from the platform database, grouped by category (Hair Toppers, Hair Extensions, Wigs, Fringes, Hair Patches). Each product page shows image, name, short description, and a Try On button.

**NEW:** Add basic product search/filter (name, category, colour, length) as a core feature rather than a "future" one — once the catalog grows past ~20 products, browsing-only becomes a real friction point.

### 4.3 AI Try-On Flow

```
Choose Image → Choose Product → Generate (async job) → Loading → Result → Download / Save / Generate Again / Try Another Product
```

### 4.4 Customer Dashboard

Sections: Previous Generations, Saved Products, Favourite Products, Recently Tried Products, Profile, Account Settings.

**NEW:** Surface remaining credit balance and a stage-aware CTA — e.g. "2 try-ons left — keep exploring" pre-Stage-3, or "Talk to a stylist to unlock more" once the agent gate is hit.

### 4.5 Authentication

- Phone OTP via Supabase (now); Email (future).
- Account creation is the action that resolves Stage 1 of the funnel in §2.

---

## 5. Admin Dashboard

### 5.1 Roles (NEW)

| Role | Access |
|---|---|
| Super Admin | Full access — products, prompts, AI settings, users, CRM, analytics |
| Content Manager | Products, categories, banners/content, FAQs — no AI cost data, no raw user PII beyond basics |
| Sales Agent | Leads/CRM view and generation history **for their assigned leads only** — no product, prompt, or AI settings access |

This matters once the agent gate in §2 goes live — agents will be in this system daily and shouldn't need (or want) full admin rights.

### 5.2 Dashboard Home

Metrics: Total Users, Active Users, Total Generations, Successful/Failed Generations, AI Cost, Total Products, Most Popular Product.

### 5.3 Product Management

Per product: Name, Description, Category, Thumbnail, Multiple Reference Images, Status, Featured Flag, Display Priority. Reference images should be high quality and optimized for AI generation.

### 5.4 Category Management

Per category: Name, Icon, Banner, Description, Display Order.

### 5.5 Prompt Management

A Prompt Library, not hardcoded prompts: Default Prompt, Hair Topper Prompt, Hair Extension Prompt, Wig Prompt, Fringe Prompt. Products may override the default. Prompt versioning is supported.

### 5.6 AI Configuration

Configurable without code deployment: Gemini Model, Output Resolution, Prompt Version, Safety Settings, Temperature, Free Generation Limit, Maximum Upload Size — plus the funnel settings from §2.3.

### 5.7 User Management

Per user: Name, Phone, Email, Account Status, Total Generations, Saved/Favourite Products, Last Activity, plus a timeline of Products Tried, Downloads, Login History, Generated Images.

### 5.8 Generation Management

Full history per record: Original Image, Product, Generated Image, Prompt, Model, Duration, Status, Error Logs (for debugging poor outputs).

### 5.9 Analytics Dashboard

See §8 for the full breakdown, including the new funnel analytics.

---

## 6. Database Modules (Updated)

**Carried over:** Users, Products, Categories, ProductImages, Generations, PromptTemplates, Settings, AnalyticsEvents, SavedProducts, FavouriteProducts, AdminUsers

**New:**

| Table | Key Fields | Purpose |
|---|---|---|
| `GenerationCredits` | user_id/session_id, source, amount, consumed, granted_at, expires_at, granted_by | The credits ledger described in §2.2 |
| `Leads` | user_id, name, phone, funnel_stage_at_creation, products_tried, generations_count, selfie_refs, status, assigned_agent_id | Internal mirror of CRM leads, even if synced externally — keeps an audit trail |
| `AgentActions` | agent_id, lead_id, action_type (note/call/credit_grant), amount, timestamp | Tracks agent follow-up and any Stage 4 credit grants |
| `DeviceSessions` | fingerprint_hash, ip_hash, first_seen, generations_used | Backs the guest-quota enforcement in §2.4 |
| `AuditLog` | admin_id, action, target_entity, timestamp | Accountability for admin/agent actions — who changed what |
| `IntegrationEvents` | event_type, payload, status, target_integration | The webhook/event bus queue described in §3 |

---

## 7. Analytics

**Business:** Total Users, Returning Users, DAU/WAU/MAU.

**Product:** Most Viewed / Generated / Downloaded Products, Highest Conversion Products.

**AI:** Success Rate, Failure Rate, Average Generation Time, Average AI Cost, Cost per User, Cost per Generation.

**Usage:** Average Session Duration, Average Generations per User, Funnel Conversion.

**Funnel Analytics (NEW)** — specific to §2's gating funnel, since it's now the core lead-gen mechanism:
- Guest → Generation 1 completion rate
- Generation 1 → Login conversion rate
- Login → Generations 2–3 completion rate
- Stage 3 (agent gate) → Lead creation rate
- Lead → Agent contact rate → Lead → Sale rate (if trackable via CRM)
- Drop-off point distribution across all stages

This funnel dashboard is arguably the single most important new analytics surface in V2 — it directly measures whether the new gating strategy is working.

---

## 8. CRM Integration

Trigger points and lead payload covered in §2.5. Sales agents use the lead's `funnel_stage_at_creation` and generation history to understand customer intent before reaching out.

---

## 9. Future Integrations (Decoupled)

Shopify Product Sync, Payment Gateway, WhatsApp Notifications, Email Notifications, Push Notifications — all implemented as subscribers to the event/webhook bus in §3, not direct dependencies of core app logic.

---

## 10. Design Principles

Premium beauty-tech feel: minimal, modern, mobile-first, responsive, accessible. Generous whitespace, subtle animation, high-quality imagery. The experience should guide customers naturally from image capture → product discovery → AI generation → (eventually) human stylist conversation, with minimal friction at each step.

---

## 11. Open Questions for the HairOriginals Team

These are real decisions, not implementation details — flagging them here rather than quietly assuming:

1. **Agent contact channel** — once Stage 3 hits, is "connect with agent" a WhatsApp handoff, a callback request, in-app chat, or something else? This affects what the Lead → Agent flow actually looks like.
2. **Guest abuse tolerance** — is the soft fingerprint/IP approach in §2.4 acceptable, or does the team want a stricter (but more friction-heavy) approach?
3. **Agent-granted credits** — should Stage 4 credits expire? Should there be a cap per customer per month?
4. **Monthly refresh lever (§2.6)** — keep disabled for launch, or is there appetite to test it early?
5. **CRM system specifics** — which CRM, and what's the integration auth method (API key, OAuth)? Needed before the webhook bus in §3 can be wired up for real.
6. **Content Manager role scope** — confirm whether this role should see AI cost data at all, or stay fully separated from anything billing-related.

---

## 12. Future Features (carried over, unchanged)

- Before/After comparison slider
- Side-by-side product comparison
- Saved Collections
- Rule-based (later AI-powered) recommendations based on hair density, hairline, length, and type
- Generation Queue (multiple try-ons queued — now structurally supported from V2 via the async job queue in §3)
- Content management for banners, hero text, featured products, tutorials, FAQs, and T&Cs — no developer required
