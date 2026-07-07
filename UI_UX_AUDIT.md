# UI/UX Audit & Redesign — HairOriginals AI Try-On (Customer App)

**Author:** Product Design + Frontend
**Scope:** Customer-facing app (full redesign) + admin consistency polish
**Direction (locked with stakeholder):** Guided step-by-step flow · lighter/brighter premium beauty-tech theme · foundation-first rollout.

> This document is the living record of the redesign. Section A audits the app **as it was**. Section B is the redesign spec. Section C is the running changelog updated as each screen ships.

---

## A. The App As It Was

### A.1 Current flow
```
Home ( / )
  └─ single scrolling page, 2 upload cards side-by-side
       Card 1 "Customer Photo"  →  ImageUploader (drag/drop, file, camera)
       Card 2 "Hair Product"    →  ProductSelector (catalog | custom upload)
                                       └─ first-load blocking Gender modal
  →  GenerateButton (enabled only when BOTH images present)
  →  LoadingOverlay (async job + 1.5s polling)
  →  ResultViewer (Result view | Before/After) → Download · Generate Again · Replace Images
Dashboard ( /dashboard )
  └─ profile/credit header (exposes "Session ID") · history gallery (Download only) · inert saved products
```

### A.2 Screen-by-screen problems

**Home / Try-On Studio (`app/(customer)/page.tsx`)**
- Framed as an internal tool: symmetric "Customer Photo" (1) + "Hair Product" (2) uploads. Never says *take a photo → pick a look → see yourself*.
- Desktop-first `md:grid-cols-2`; on mobile the catalog (search + chips + scrolling grid) is squeezed into a narrow column inside a `max-h-[460px]` nested scroll.
- Micro-labels at `text-white/25`, `text-[11px]`, `uppercase tracking-widest` — low contrast, hard to read, cognitively noisy.
- Hero leaks jargon ("HairOriginals product image", "Gemini").
- Single CTA "Generate Try-On" is centered mid-page, not thumb-anchored.

**Upload (`ImageUploader.tsx`)**
- Replace/retake controls are **hover-only** (`opacity-0 group-hover:opacity-100`) → invisible and unusable on touch, the primary audience.
- "Take Photo" entry is a tiny `text-xs` chip that disappears once an image exists.
- Quality validation is advisory text with no "Use anyway / Retake" affordance.

**Style selection (`ProductSelector.tsx`)**
- The style to try on is modeled as a second **image upload slot**, not a first-class "choose a style" step.
- Gender modal hard-blocks on first load before the user has any context.
- Catalog — the core discovery surface — lives inside a cramped nested-scroll card.
- Selection entrance uses `animate-scale-in`, which **is never defined** in CSS (silent no-op bug).

**Generating (`LoadingOverlay.tsx`)**
- Time-based "theater" progress; leaks internal jargon ("Asynchronous job queued…").
- No preview of inputs, no estimate, no cancel.

**Results (`ResultViewer.tsx`) — most important, under-delivers**
- **No Save, no Share** — only Download. The funnel wants saved products; the screen can't save.
- **No "Try another style"** — to try a different look the user hits "Replace Images", which dumps *both* photo and style. High friction for the core "try many looks" loop.
- Result view (`aspect-[4/3]`, `object-cover`) vs slider (`aspect-[3/4]`) — inconsistent ratios; `object-cover` can crop the generated hair.
- 3 buttons wrap on mobile; primary loses prominence.

**Dashboard (`app/(customer)/dashboard/page.tsx`)**
- Exposes "Session ID" and raw funnel-stage jargon to end users.
- History tiles offer Download only (no re-try/share/delete); saved favorites are inert.

**Onboarding** — none. Only the abrupt Women/Men gender modal.

### A.3 Cross-cutting issues
- **Touch-hostile:** hover-only controls, hover-only zoom, nested `max-h` scroll.
- **No design tokens:** colors/radii/shadows hardcoded as literal utilities everywhere; brand gradient copy-pasted in 6+ files; `#080808` duplicated.
- **No shared primitives:** Button / Card / Modal / Input / Badge re-implemented per file. `FunnelGate` has private `Overlay`/`Card` that should be shared.
- **No toast system, no skeletons** — only spinners and inline banners.
- **Inconsistent modals:** backdrop opacity/blur differ per modal; no focus trap or Escape-to-close.
- **A11y:** small tap targets, low contrast, no focus trapping, icon buttons missing labels in places.
- **Exposed internals/bugs:** dev OTP hint in production (`FunnelGate.tsx`), `error_log` vs `error_message` column mismatch swallows real failure messages.

---

## B. Redesign Spec

### B.1 Design language — lighter/brighter beauty-tech
Warm, bright, premium. Near-white warm canvas, white cards, soft warm-tinted shadows, generous rounded corners, the signature **amber→orange→rose** gradient reserved for the primary CTA. Big friendly type, 8-pt spacing.

**Tokens** (Tailwind v4 `@theme` in `app/globals.css`):
- Canvas `#FBF8F6` · Surface `#FFFFFF` · Sunken `#F4EFEC`
- Ink `#1A1613` · Ink-soft `#6B615B` · Ink-faint `#9A8F88`
- Line `#ECE4DE` · Line-strong `#DCD1C9`
- Brand `#F4623A` (coral) · Brand-soft `#FFF1EC` · gradient for hero CTA
- Success/Danger/Warn each with a soft tint
- Radii `.625/1/1.25/1.75/2rem` · soft layered shadows · rose-tinted brand glow

**Primitives** (`components/ui/`): Button, IconButton, Card, Badge, Input, Sheet (mobile bottom sheet, focus-trapped, Escape-close, drag handle), Skeleton, Toast + `useToast`, Stepper.

### B.2 Flow — one goal per screen
Step machine in `app/(customer)/page.tsx` (`home | photo | style | result` + loading), URL-hash synced for Back. Working generation/funnel/polling logic preserved verbatim.

1. **Home** — hero + one giant "Try a hairstyle →". 3-dot "how it works" strip. "My looks" secondary.
2. **Add your photo** — big "Take a selfie" / "Choose photo"; always-visible Retake/Replace; non-blocking quality tip with Use anyway / Retake; sticky Continue.
3. **Pick a style** — full-bleed catalog, gender toggle + search + category chips, big 2-col tiles; select → sticky "Try this on →" with thumbnail; "Upload your own" secondary.
4. **Generating** — photo + style thumb, branded progress, friendly copy, estimate.
5. **Your look** — Before/After slider default; thumb-anchored Save · Share · Download · **Try another style** (keeps photo) · Start over.
6. **My Looks (dashboard)** — friendly stage-aware header + credit pill; history tiles get re-try/share/download/remove; interactive saved looks; skeletons.

### B.3 Chrome & gates
Slim top bar (brand + back + Stepper during flow) + bottom tab bar (Home · My Looks) on non-flow screens, safe-area padded, hidden during flow/loading. Funnel gates become friendly `Sheet`s; dev OTP hint removed from production.

### B.4 Cross-cutting
Mobile 320–428px verified, no h-scroll, safe-area CTAs, `dvh`. A11y: ≥44px targets, AA contrast, focus rings, labels, `role="status"` announcements, focus-trapped Escape-closable sheets. Micro-interactions subtle + reduced-motion aware. Bug fixes folded in (see A.3).

### B.5 Priority (by impact)
1. Foundation (tokens + primitives) — unblocks everything.
2. Guided flow Home→Photo→Style→Generating→Result — the toddler-test core.
3. Results Save/Share/Try-another — the funnel's looping engine.
4. Dashboard, chrome, gates.
5. Admin polish.

---

## C. Changelog (updated as screens ship)

### Foundation — design system
**What changed:** Replaced the dark base with a light/bright token system in [globals.css](app/globals.css) via Tailwind v4 `@theme` (canvas/surface/ink/line/brand tokens, radii, warm shadows, 8-pt convention), added `scale-in`/`slide-up`/`skeleton`/`toast` keyframes + reduced-motion + safe-area helpers, and dropped the `dark` class in [layout.tsx](app/layout.tsx). Built a shared primitive layer in [components/ui/](components/ui/): `Button`, `IconButton`, `Card`, `Badge`, `Input`, `Sheet` (focus-trapped, Escape-close bottom sheet), `Skeleton`, `Toast`+`useToast`, `Stepper`, `cn`.
**Why:** Kill the 6×-duplicated button/modal/card markup and the "no tokens" problem; give every screen ≥44px targets, AA-contrast light surfaces, and one place to theme.
**Remaining debt:** Fully remove remaining raw `<img>` in favor of `next/image` (perf follow-up).

### Guided flow — Home · Photo · Style · Generating · Result
**What changed:** Rebuilt [app/(customer)/page.tsx](app/(customer)/page.tsx) as a `home|photo|style|result` step machine (URL-hash synced for hardware Back), preserving all generation/funnel/polling logic. New [components/flow/](components/flow/): `HomeStep` (hero + one CTA + "how it works"), `PhotoStep` (big Take-selfie/Choose-photo, **always-visible** replace/retake, non-blocking quality tip, sticky Continue), `StyleStep` (full-bleed catalog, gender toggle, search, chips, sticky "Try this on" + thumbnail, first-run gender **sheet** instead of a blocking modal), `GeneratingStep` (photo+style preview, friendly copy, no jargon), `ResultStep` (Before/After default, **Save · Share · Download** + prominent **Try another style** keeping the photo). New chrome: `TopBar` (brand/back + `Stepper`) and `BottomNav` (Try On · My Looks). Restyled `CameraCapture`, `BeforeAfterSlider`, and `FunnelGate` (now light bottom-sheets) to tokens.
**Why:** Convert the internal-tool "two uploads" model into a one-goal-per-screen, thumb-first flow that passes the toddler test; deliver the funnel's missing looping actions (save/share/try-another).
**Removed:** Orphaned dark-theme components (`ImageUploader`, `ProductSelector`, `GenderSelectorModal`, `GenerateButton`, `LoadingOverlay`, `ResultViewer`, `ImagePreview`, `Navbar`, `Footer`).
**Remaining debt:** Camera guide is still cosmetic (no real-time face detection — future); "remove saved" needs a DELETE endpoint before it can surface in the dashboard.

### Dashboard → "My Looks"
**What changed:** Rewrote [app/(customer)/dashboard/page.tsx](app/(customer)/dashboard/page.tsx) to light tokens with a friendly stage-aware credit header (no "Session ID" jargon), skeleton loading, a 2-col looks gallery with per-item **Share + Download**, and interactive saved styles that link back into the flow.

### Bug fixes folded in
- Defined the missing `animate-scale-in` keyframe (silent no-op selection animation).
- Replaced hover-only (touch-invisible) replace controls with always-visible buttons.
- Removed the dev OTP hint from the production login gate.
- Fixed the `error_log` vs `error_message` column mismatch in [lib/generation-queue.ts](lib/generation-queue.ts) so failed generations surface real messages (DB column is `error_log`).

### Admin
**What changed:** The admin console stays a self-contained **dark "pro console"** (its layout already scopes its own dark canvas, so the global light flip doesn't affect it) — an intentional split: bright/friendly for customers, focused dark for the internal data tool. Aligned the sidebar brand mark to the new gradient.
**Remaining debt:** A full light-theme migration of the 8 dense admin data pages is deferred — high effort, zero customer impact, and it would fight the data-dense dark design. Offer as a separate follow-up if desired.

### Verification
`npx tsc --noEmit` clean · `npm run build` succeeds (all 35 routes; `/` and `/dashboard` prerender as static HTML) · dev server serves `/` and `/dashboard` at HTTP 200 with new copy. Pre-existing `react-hooks/set-state-in-effect` lint warnings remain across the codebase (not build-blocking). Not yet done here: live end-to-end generation (needs Gemini/Supabase keys) and manual screenshots at 320–428px.
