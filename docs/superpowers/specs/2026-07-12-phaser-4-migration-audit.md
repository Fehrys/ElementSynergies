# Phaser 3 → Phaser 4.2.1 Migration Audit

**Date:** 2026-07-12
**Branch / worktree:** `chore/phaser-4-migration` (isolated git worktree)
**Start commit:** `bd1f65e` (== `origin/main`, verified 0 ahead / 0 behind)
**Scope:** Migrate the existing prototype to Phaser **4.2.1** with **zero** gameplay,
layout, coordinate, composition, asset, animation, or responsive change. This document is
**audit + plan phase only** — no production code or manifest has been modified.

> **Explicit non-goal (from the task brief):** no `Scale.RESIZE`/`Scale.FIT`, no meta
> viewport, no safe-areas, no canvas-size change, no responsive edits to
> `compositionLayout.ts` / `boardLayout.ts`, no grid/stone geometry change, no dependency
> update other than `phaser`. The pre-existing responsive design work is **out of scope**
> and must not be used as a technical source (see §9).

---

## 1. Baseline (the "before" state) — measured, not assumed

All commands were run inside the isolated worktree after `npm ci`. **Nothing was modified
to make the baseline green.**

| Check | Result |
|---|---|
| Worktree clean at start | ✅ `git status --porcelain` empty |
| Start commit | `bd1f65e` (= `origin/main`) |
| `npm ci` | ✅ exit 0 |
| Locked Phaser version (`npm ls phaser`) | **`phaser@3.90.0`** (the `^3.85.0` range floated up) |
| `npx tsc --noEmit` (full TypeScript type-check) | ✅ **exit code 0, no TypeScript diagnostics** — measured under Phaser 3.90.0 (tsc normally prints nothing on success; the exit code is the signal) |
| `npm run build` (Vite/esbuild bundle — **not** a type-check) | ✅ green — `dist/assets/index-*.js` **1,494.15 kB** (gzip 345.36 kB). Note: Vite/esbuild transpiles without full type-checking, so `npx tsc --noEmit` above is the authoritative type gate. |
| `npm test` (Vitest) | ✅ **76 passed** / 9 files |
| `npm run test:e2e` (Playwright) | ✅ **9 passed** (chromium) |
| Renderer under `Phaser.AUTO` (browser) | **WebGL** — console banner: `Phaser v3.90.0 (WebGL | Web Audio)`; canvas context probes as `webgl1` |
| Canvas geometry (`?seed=1`, viewport 480×720) | `getBoundingClientRect()` → `{x:0, y:0, w:480, h:720}`; `canvas.width/height` = 480/720; `devicePixelRatio` = 1 |
| `data-scene` | `"battle"` |
| `data-monster-hp` | `"1000"` (Frost Yeti 1000/1000) |
| `window.__debug` | present; keys `lastTurn, spawnTile, spawnPortal, getBoard, setMonsterHp`; `getBoard()` returns 32 cells |
| Determinism | `?seed=1` board reproduced 1:1 by tests via `fillBoard(new HexGrid(), mulberry32(1))` |
| Mouse interaction | ✅ e2e drags at `cellToPixel` coordinates damage the monster |
| Effective `roundPixels` | **`false`** — verified in installed `node_modules/phaser@3.90.0/src/core/Config.js:396` (`GetValue(renderConfig, 'roundPixels', false, config)`); the project sets no `roundPixels`/`pixelArt`/`zoom`, so nothing forces it to `true` (see §4) |
| Reference screenshot | captured at 480×720, `?seed=1&debug=1` under Phaser 3.90.0 → `…/scratchpad/baseline-phaser3-seed1-480x720.png` (re-verified accessible, 20.3 KB). If ever missing, it must be re-captured under Phaser 3.90.0 **before** any `package.json`/`package-lock.json` change (plan Task 0). |

**Pre-existing, non-blocking observations (documented, not "fixed"):**

- `npm run build` prints a Vite *warning* that the bundle exceeds 500 kB. Pre-existing;
  not a failure; unrelated to the Phaser major version. (Bundle size will change with
  Phaser 4 — see §7.)
- One browser console **error** at load: `GET /favicon.ico 404`. Pre-existing, unrelated to
  Phaser, harmless.
- Target version **`phaser@4.2.1` is published** and is the current `latest` dist-tag
  (verified via `npm view phaser dist-tags`).

**No flaky or failing tests were observed in the baseline.**

---

## 2. Complete Phaser API surface used by the project

Established by reading every source file and by an exhaustive grep of `src/` for the whole
Phaser-4 breaking-change checklist. The **entire** Phaser surface is:

| API | File(s) | Purpose |
|---|---|---|
| `Phaser.Types.Core.GameConfig` | `src/main.ts:6` | config object type |
| `Phaser.AUTO` | `src/main.ts:7` | renderer auto-select |
| `new Phaser.Game(config)` | `src/main.ts:14` | bootstrap |
| `Phaser.Scene` (extends) | `src/scenes/BattleScene.ts:73` | the single scene |
| `Phaser.GameObjects.Container` | `BattleScene.ts` (9 containers) | depth-ordered layers |
| `Phaser.GameObjects.Graphics` | `BattleScene.ts` | all board/HUD/background drawing |
| `Phaser.GameObjects.Text` | `BattleScene.ts` | HP text, emoji glyphs, "Victory!" |
| `Phaser.Input.Pointer` | `BattleScene.ts` | drag input typing |
| `Phaser.Math.Distance.Between` | `BattleScene.ts:174` | pointer→cell hit test |
| `this.add.container / .graphics / .text` | `BattleScene.ts` | factory calls |
| `this.input.on('pointerdown'|'pointermove'|'pointerup')` | `BattleScene.ts:160-162` | input events |
| Graphics methods | `BattleScene.ts` | `fillStyle, fillCircle, fillEllipse, fillRect, fillRoundedRect, lineStyle, beginPath, moveTo, lineTo, strokePath, clear` |
| Text methods | `BattleScene.ts` | `setText, setPosition, setOrigin`; style `{ fontSize, color }` |
| Container methods | `BattleScene.ts` | `add, removeAll(true), setDepth` |

There is **no** `preload()`, no image/audio asset loading, no tween, no particle emitter,
no camera manipulation, no custom pipeline/shader, no mask, no tint, no interactive
hit-areas (input is a single scene-level pointer listener + manual distance test), and no
`scale` / `render` config block.

`src/core/**` is pure TypeScript with **zero** Phaser import (verified) — it cannot be
affected by the engine version. `src/scenes/boardLayout.ts` and
`src/scenes/compositionLayout.ts` are deliberately Phaser-free too.

---

## 3. Incompatibility audit against the official Phaser v3→v4 guide

Sources (official only): the [v3→v4 Migration Guide](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/MIGRATION-GUIDE.md),
the [4.0.0 changelog](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/CHANGELOG-v4.0.0.md),
the [4.2.0 changelog](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.2/CHANGELOG-v4.2.0.md),
and the official [`skills/v3-to-v4-migration`](https://github.com/phaserjs/phaser/blob/master/skills/v3-to-v4-migration/SKILL.md).
(No standalone official *skill* for this migration is installed in this environment; the
repository skill above was used as the authoritative checklist. No third-party tutorials
were used.)

For each checklist category: **used?** · files · change required · compile risk · behavior
risk · visual risk.

| Category | Used? | Files | Change required | Compile risk | Behavior risk | Visual risk |
|---|---|---|---|---|---|---|
| WebGL pipelines / `setPipeline` | **No** | — | none | none | none | none |
| Direct renderer access (`game.renderer.*`) | **No** | — | none | none | none | none |
| `preFX` / `postFX` | **No** | — | none | none | none | none |
| Masks / `BitmapMask` (→ Filters) | **No** | — | none | none | none | none |
| `setTintFill` (→ `setTint`+`setTintMode`) | **No** | — | none | none | none | none |
| `Phaser.Geom.Point` (→ `Vector2`) | **No** | — | none | none | none | none |
| `Math.TAU` (meaning changed) / `Math.PI2` (removed) | **No** | — | none | none | none | none |
| `Phaser.Struct.Set` / `Struct.Map` (→ native) | **No** | — | none | none | none | none |
| `DynamicTexture` / `RenderTexture` | **No** | — | none | none | none | none |
| `Camera.matrix` direct access | **No** | — | none | none | none | none |
| Shaders / GLSL | **No** | — | none | none | none | none |
| `Light2D` / Lights | **No** | — | none | none | none | none |
| `TileSprite` / cropping | **No** | — | none | none | none | none |
| `Grid` shape / outline·stroke props | **No** | — (only the word "Grid" in a `boardLayout.ts` comment) | none | none | none | none |
| `Mesh` / `Plane` (removed) | **No** | — | none | none | none | none |
| Removed plugins / entry points (Camera3D, Layer3D, Create palette, polyfills) | **No** | — | none | none | none | none |
| Canvas renderer (deprecated, not removed) | **No** (AUTO→WebGL) | `main.ts` | none (see §5) | none | none | **potential** (§8) |
| `roundPixels` default | **No override**; effective value `false` in both v3 and v4 | `main.ts` | **none** — do NOT add `roundPixels: true` (§4) | none | none | none (Graphics ignore it; no default change) |

**Confirmed hard incompatibilities that require a code change: none.**
The project uses no removed or signature-changed API. The migration is therefore expected
to be: **one dependency bump + one lockfile update, with no `src/` change at all** (in
particular, `roundPixels` must **not** be added — see §4).

---

## 4. `roundPixels` — verified against the installed source; **no change is required**

> **Correction.** An earlier draft of this audit repeated the migration guide's claim that
> "v3 defaulted `roundPixels` to `true`" and recommended adding `roundPixels: true`. That is
> **wrong for this baseline.** Verified directly against the installed engine below.

**Fact — Phaser 3.90.0 (the actual baseline), from `node_modules/phaser/src/core/Config.js`:**
```js
// line 394 (doc comment):
// @const Phaser.Core.Config#roundPixels - Draw texture-based Game Objects at only
// whole-integer positions. Game Objects without textures, like Graphics, ignore this property.

// line 396:
this.roundPixels = GetValue(renderConfig, 'roundPixels', false, config);   // default: FALSE

// lines 401–408 — only path that forces it true:
this.pixelArt = GetValue(renderConfig, 'pixelArt', this.zoom !== 1, config);
if (this.pixelArt) {
    this.antialias = false;
    this.antialiasGL = false;
    this.roundPixels = true;
}
```
The project's `src/main.ts` sets **no** `roundPixels`, **no** `pixelArt`, and **no** `zoom`
(so `zoom === 1` ⇒ `pixelArt === false`). Therefore **the baseline runs with
`roundPixels === false`.** The migration guide's parenthetical "(it was `true` in v3)" does
not hold for 3.90.0.

**Fact — Phaser 4.0.0 changelog:**
> "Set `roundPixels` game option to `false` by default."

**Fact — v4 semantics (migration guide / skill), for completeness only:**
> "`roundPixels` only operates when objects are axis-aligned and unscaled…" Per-object
> control via `GameObject#vertexRoundMode` (default `"safeAuto"`). *Irrelevant here because
> the project keeps `roundPixels` at its `false` default — the new semantics of `true` never
> apply.*

**Net result: the effective value is `false` in both v3.90.0 and v4.2.1 for this project.
There is no default change to preserve.**

**Does the project implicitly depend on the old behavior?** No.
- **Tests:** no unit or e2e test inspects pixels (they assert canvas bounds, HP deltas, DOM
  attributes, `__debug`) — all independent of `roundPixels`.
- **Rendering:** all shapes (stones, trace line, HP bar, background, table, hero/monster
  placeholders) are `Graphics`, which — per the engine's own doc comment — **ignore**
  `roundPixels` entirely. Only `Text` objects (HP readout, emoji glyphs, "Victory!") are
  texture-based and could ever be affected, and only when `roundPixels` is `true`. Since it
  is `false` before and after, **nothing changes**.

**Where it would live if set:** `roundPixels` is a top-level `GameConfig` option
(`Phaser.Types.Core.GameConfig.roundPixels`, sibling of `type`/`width`/`height`). But it
must **not** be set here.

**Recommendation: do NOT add `roundPixels: true` (or any `roundPixels` value).** Leaving it
unset preserves the current rendering exactly. Adding `roundPixels: true` would *enable*
whole-integer snapping for `Text` objects that today render *without* it — a deliberate
visual change and a scope violation, not a preservation. `src/main.ts` should therefore
stay **byte-for-byte unchanged** (see §7). The seed=1 before/after screenshot comparison
(§10, plan Task 3) remains the guard: if it ever showed a text difference, the correct
response is to investigate the new renderer — **not** to reflexively add `roundPixels`.

---

## 5. `Phaser.AUTO` renderer selection — before vs after

- **Before:** `Phaser.AUTO` selected **WebGL** in the test browser — verified by probing the
  canvas context (returns a WebGL context, not 2D). The console banner
  (`Phaser v3.90.0 (WebGL | Web Audio)`) was observed for information only.
- **After (expected):** `Phaser.AUTO` in v4 still prefers WebGL and falls back to the
  (deprecated) Canvas renderer only when WebGL is unavailable. In the same Chromium it is
  expected to select WebGL again.
- **Decision:** **Keep `Phaser.AUTO`.** Per the brief, do **not** force `Phaser.WEBGL` and
  do **not** switch to Canvas. The Canvas renderer is deprecated in v4 but AUTO does not
  need replacing. The after-migration renderer will be re-verified in the browser (plan
  Task 3) by **probing the canvas context** (must be WebGL); the exact banner string is not
  a pass/fail criterion (see §10).

**Potential (not confirmed) nuance:** Phaser 4's rewritten renderer may request a **WebGL2**
context where v3 used WebGL1. This is invisible to this project's 2D output in principle,
but it is the most likely source of any sub-pixel rasterization/antialiasing difference. It
is flagged in §8 and is exactly what the screenshot comparison exists to catch.

---

## 6. Project-specific API confirmation under 4.2.1

Each item the brief called out, checked against the official changelogs (4.0.0 and 4.2.0
were searched line-by-line for these symbols):

| Symbol / behavior | Status in v4 | Note |
|---|---|---|
| `Phaser.Types.Core.GameConfig` | present | to be confirmed after installation with `npx tsc --noEmit` (plan Task 2) |
| `Phaser.AUTO` | present | §5 |
| `Phaser.Scene` | present, lifecycle unchanged | changelog: not mentioned = unchanged |
| `Phaser.GameObjects.Container` (`add`/`removeAll(true)`/`setDepth`) | present, unchanged | not mentioned in changelogs |
| `Phaser.GameObjects.Graphics` + `fillStyle/fillCircle/fillEllipse/fillRect/fillRoundedRect` | present, unchanged | not mentioned in changelogs |
| `beginPath/moveTo/lineTo/strokePath` | present, unchanged | not mentioned |
| `Phaser.GameObjects.Text` + `setText/setPosition/setOrigin` + `{fontSize,color}` | present, unchanged | not mentioned |
| `Phaser.Input.Pointer`, `pointer.x/y`, `pointerdown/move/up` | present, unchanged | changelog Input section only touches Gamepad |
| `Phaser.Math.Distance.Between` | present, unchanged | not mentioned |
| Fixed canvas with no `scale` block | still valid | AUTO + width/height + parent behaves as v3; no `scale` block required |
| `roundPixels` default | **unchanged for this project** — `false` in both v3.90.0 and v4.2.1 (project sets no override) | §4; do **not** add it |

**Nothing in 4.1 / 4.2 / 4.2.1** touched any of these symbols (4.2.x work concerned
stencils, meshes, cone lights, tint modes, and fixes to Layer/SpriteGPULayer/Blitter/Line —
none used here). Final typing/compilation truth is to be established empirically by running
`npx tsc --noEmit` (then `npm run build`) after installation — plan Task 2.

---

## 7. Files that will (and will not) change

**Will change:**
- `package.json` — `phaser` dependency pinned to **exactly `4.2.1`** (no caret) so a later
  publish cannot silently move the tested base.
- `package-lock.json` — regenerated for phaser 4.2.1 and its transitive deps.
- Documentation (only **after** all suites are green): README.md "Phaser 3" → "Phaser 4",
  CLAUDE.md's "Phaser 3 + TypeScript + Vite" line, and the "implemented in Phaser 3"
  wording in `design/implementation/BATTLE_SCENE_BLUEPRINT.md`. Text-only; no behavior.

**Will NOT change (must stay byte-for-byte unless a hard compile error forces it):**
- `src/main.ts` — expected untouched. In particular, **no `roundPixels` line is added**
  (§4): the baseline already runs `roundPixels: false` and v4 defaults to the same. The only
  reason to touch this file would be a v4 typing error on the existing config (not expected).
- `src/scenes/BattleScene.ts` — expected untouched; every API it uses is stable.
- `src/scenes/compositionLayout.ts`, `src/scenes/boardLayout.ts`, `src/scenes/depth.ts` —
  untouched (no responsive edits).
- `src/core/**` — untouched (no Phaser dependency).
- `index.html`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`,
  `playwright.config.ts` — untouched. (Playwright config only if a v4-specific runtime
  breakage directly demands it — not expected.)
- All tests — untouched. They are the migration's acceptance gate.
- Bundle size will grow/shrink with the new engine; this is expected and not a regression.

---

## 8. Risk register — **potential** risks only (no confirmed incompatibility exists)

Clearly separated from §3's confirmed findings (which are: none).

| # | Potential risk | Likelihood | Detection | Mitigation |
|---|---|---|---|---|
| P1 | Text glyph rasterization differs under v4's new renderer (font atlas / AA), **independent of `roundPixels`** (which stays `false` — §4) | Low | seed=1 screenshot diff vs baseline | accept if sub-pixel; document in final report. **Do NOT** add `roundPixels: true` as a "fix" — it would change, not preserve, current text rendering |
| P2 | WebGL2 (v4) vs WebGL1 (v3) rasterization of AA edges on circles/ellipses | Low | seed=1 screenshot diff | accept if imperceptible; documented in final report |
| P3 | A `GameConfig`/`Graphics`/`Text` **type** signature tightened in v4 typings, causing a type error | Low–Med | `npx tsc --noEmit`, then `npm run build`, in plan Task 2 | apply the *minimal* typing fix only; record it |
| P4 | `Phaser.AUTO` unexpectedly selects Canvas under v4 in some env | Very low | browser renderer probe in plan Task 3 | keep AUTO; investigate only if WebGL is genuinely unavailable — do **not** force WEBGL preemptively |
| P5 | New Phaser 4 startup console warning/log differs, tripping something that reads console | Very low | e2e run + console capture | e2e does not assert console; informational only |
| P6 | Larger/renamed dist chunk changes the Vite 500 kB warning text | Cosmetic | build output | none needed |

**No potential risk touches gameplay, coordinates, canvas size, or the test contract.** The
core/scene separation means logic is provably version-independent.

---

## 9. Pre-existing responsive material — flagged, NOT touched

Per the brief, the old **responsive audit that targeted Phaser 3 must not be used as a
technical source**, and if it still exists in tracked files it must be flagged separately
from the migration.

Findings:
- The standalone **"responsive battle layout audit"** lives on the **unmerged** branch
  `feature/responsive-design` (`origin/feature/responsive-design`, commit f953d16). It is
  **not present** in the tracked files on `main` / this worktree. Nothing to remove here.
- Tracked files on `main` that *mention* responsiveness as future design intent (not a
  Phaser-3 technical audit, left untouched):
  - `design/implementation/BATTLE_SCENE_BLUEPRINT.md` — has a "Responsive Layout Rules"
    section and a "Release requirement" note stating the fixed 480×720 canvas is a
    *temporary* baseline. **Design intent only. Out of scope. Not acted on.**
  - `src/scenes/compositionLayout.ts` — its header comment explicitly says *"This is NOT
    responsive-scaling support: the canvas stays a fixed 480x720."* Consistent with this
    migration; untouched.
  - `design/README.md`, `design/references/ART_TARGET.md`, and the 2026-07-11 composition
    spec/plan mention responsiveness as future work. Untouched.
- `design/implementation/BATTLE_SCENE_AUDIT.md` is a **composition** design-to-implementation
  audit (unrelated to Phaser versioning). It contains some stale pre-migration details
  (e.g. an old `ORIGIN_Y = 486`, a `drawBattleLineup()` that no longer exists). This drift
  is **pre-existing and out of scope** — noted only so it is not mistaken for migration work.

**Recommendation:** keep any responsive-audit cleanup entirely separate from this migration
(different branch/PR), so the migration diff contains no responsive material whatsoever.

---

## 10. Before/after comparison strategy

The migration is "correct" only if the after-state is behaviorally and visually
indistinguishable from §1. Comparison method:

1. **Automated parity (the contract)** — all four must pass, identical to §1:
   `npx tsc --noEmit` (exit 0, no diagnostics), `npm run build` green, `npm test` = 76 passed,
   `npm run test:e2e` = 9 passed. These already cover canvas bounds (480×720 @ origin),
   determinism, drag→damage, portals, special tiles, `data-scene`, `data-monster-hp`, and
   `window.__debug`. `npx tsc --noEmit` is listed first because `npm run build` alone does
   **not** type-check.
2. **Version + renderer parity — blocking criteria (not the banner text):** the blocking
   checks are (a) **installed dependency** is Phaser 4.2.1 (`npm ls phaser` = 4.2.1);
   (a′) **runtime version** is 4.2.1 — `Phaser.VERSION` = `4.2.1` when accessible in the
   page, otherwise the version *number* read from the console banner (compare the number
   only, not the full banner string); (b) the renderer is **WebGL** (canvas context probes
   as WebGL, not 2D); (c) `getBoundingClientRect` is `{0,0,480,720}`; (d) runtime + tests
   function. The console banner may be *observed* for information, but its full text is
   **not** a pass/fail criterion — only the version number within it is.
3. **Visual parity** — re-capture `?seed=1&debug=1` at 480×720 and diff against
   `baseline-phaser3-seed1-480x720.png`. Because the board is seed-deterministic, the two
   images are directly comparable. Any diff must be **sub-pixel** and may come only from
   Phaser 4's new renderer — WebGL2, Graphics tessellation, text rasterization, or
   antialiasing. A structural diff (moved/missing/rescaled element) is a **fail** and blocks
   the migration. A visual difference must **never** be "fixed" by adding `roundPixels`
   (audit §4); the correct response is to investigate the renderer.
4. **Diff artifacts** are kept in the session scratchpad (outside the tracked worktree) so
   the migration diff stays free of binaries.

---

## 11. Conclusion

This is a **low-risk, dependency-level migration**. The application's Phaser usage is small,
entirely within the stable core API, and completely decoupled from all game logic. The
expected change set is: **`phaser` → `4.2.1` (pinned)** and a **lockfile update** — with
**no `src/` change at all** (in particular **no `roundPixels` line**; the baseline already
runs `roundPixels: false` and v4 keeps that default), and no change to any scene, layout,
coordinate, test, or asset. The only other edits are text-only documentation updates made
*after* the suites are green. All identified risks are *potential* and cosmetic, gated
behind the existing test suites plus a deterministic screenshot comparison.

Implementation steps, verification commands, and commit slicing are in the companion plan:
`docs/superpowers/plans/2026-07-12-phaser-4-migration.md`.
