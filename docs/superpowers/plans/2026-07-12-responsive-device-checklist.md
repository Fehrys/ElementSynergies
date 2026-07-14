# Responsive Battle Layout — Real-Device Checklist

> These are the **device-only gates** (audit risks R4/R5/R8) that the automated
> suite cannot cover. The automated matrix (Vitest + Playwright) validates geometry,
> browser↔Node consistency, no-clip, no-duplication, safe-area math, DPR-independence
> of the *layout*, reflow safety, and pointer accuracy in headless Chromium. The
> items below require a human on real hardware and must be signed off before the
> responsive layout is considered production-validated. See
> `2026-07-12-responsive-layout-decisions.md` for the decisions of record.

## Automated coverage (already green — context, not a manual gate)

- Canvas fills the viewport at the origin across the full matrix
  (`320×568 … 1000×700` + `844×390` landscape) — `canvas-bounds.spec.ts`.
- Runtime `getBattleLayout()` deep-equals the Node `computeBattleLayout` per size —
  `matrix.spec.ts`.
- `tileBounds ⊆ safeRect` (no clip), exactly one canvas (no duplication), one real
  valid-chain drag scores per size — `matrix.spec.ts`.
- Safe-area insets via the real DOM adapter; `deviceScaleFactor: 3` layout equals the
  DPR-1 model; game→client is a no-op; reflow coalescing / mid-drag cancel / RNG
  non-advance — `reflow.spec.ts`.
- 480×720 / 360×640 / 768×1024 deterministic screenshots — `visual-baseline.spec.ts`.
  These are the **canonical `-win32` baselines**, validated on GitHub Actions
  `windows-2022` (Playwright `1.61.1`, Chromium) — the single canonical visual CI
  platform. No Linux snapshots are maintained. See
  `2026-07-12-responsive-layout-decisions.md` and `.github/workflows/ci.yml`.

## Device matrix (minimum)

Sign off on **≥ 1 notched high-DPR phone** AND **≥ 1 tablet**. Recommended:

- Phone: a notched, high-DPR device (e.g. iPhone-class with a display cutout,
  `devicePixelRatio ≥ 3`) in **portrait and landscape**.
- Tablet: a large-screen device (e.g. iPad-class) in **portrait and landscape**.

## Manual gates

### R5 — Safe-area insets (real notch, after rotation)
- [ ] On the notched phone, the HUD / boss bar / heroes / board all sit **inside** the
      safe area (nothing under the notch, rounded corners, or home indicator).
- [ ] **Rotate the device** (portrait ↔ landscape): after rotation the insets update
      and the composition re-lays-out correctly (no content left under the cutout,
      no dead band). This exercises the real `env(safe-area-inset-*)` + the browser
      viewport-change signals that headless cannot reproduce.
- [ ] Show/hide the mobile URL bar (scroll): the `dvh`-based sizing keeps the board
      fully visible; no clipped bottom row when the toolbar appears.

### R4 — High-DPR visual sharpness
- [ ] Tiles, table, HUD text, and the trace line are **crisp** (no blur / half-pixel
      shimmer) on the `dpr ≥ 3` device. (Layout is DPR-independent; this checks the
      renderer backing store looks right at native DPR.)

### R8 — Performance / frame rate
- [ ] Sustained smooth frame rate during a drag and during resolution animations on
      the high-DPR phone.
- [ ] **No stutter or memory growth across repeated resize / rotation** (the reflow is
      coalesced to one apply per frame; confirm it holds on-device).
- [ ] Decide the **provisional "no backing-store DPR cap"** question
      (`2026-07-12-responsive-layout-decisions.md`): if the high-DPR device shows
      frame-rate or GPU-memory problems, record the need for a backing-store cap.
      Otherwise confirm "no cap" as accepted. *(Layout stays DPR-independent either
      way — this is a rendering-only decision.)*

### Pointer accuracy (physical touch)
- [ ] Dragging a chain on a physical touchscreen selects exactly the intended cells
      at the extremes (corners, first `{0,0}` / last `{4,6}` cells) at both a small
      phone and a tablet — no offset, including after a rotation-triggered reflow.

### Composition sanity (real screen)
- [ ] On the smallest real phone, tiles are large enough to tap comfortably and the
      table keeps a visible margin around them (`minimumTablePadding`).
- [ ] On the tablet, the play column is centered with the decorative environment
      revealed on both sides and the table **not** stretched to the full width.

## Sign-off

- [ ] Phone (notched, high-DPR): ____________________  date: __________
- [ ] Tablet: ____________________  date: __________
- [ ] Backing-store DPR-cap decision recorded in the decisions doc: ______________
