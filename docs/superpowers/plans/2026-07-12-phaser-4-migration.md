# Phaser 3 → Phaser 4.2.1 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the prototype from Phaser 3.90.0 to Phaser 4.2.1 with no gameplay, layout,
coordinate, composition, asset, or responsive change, keeping all existing Vitest and
Playwright tests green.

**Architecture:** The app's Phaser usage is a tiny, stable subset (config + one Scene doing
Graphics/Text/Container/Input). All game logic is Phaser-free under `src/core`. The
migration is therefore a dependency bump + lockfile update, with **no `src/` change
expected** (verified: the baseline already runs `roundPixels: false` and v4 keeps that
default — see audit §4), validated against the existing test suites and a deterministic
before/after screenshot.

**Tech Stack:** Phaser 4.2.1, TypeScript 5.6 (unchanged), Vite 5.4 (unchanged), Vitest 2.1
(unchanged), Playwright 1.48 (unchanged).

## Global Constraints

- Pin `phaser` to **exactly `4.2.1`** in `package.json` (no `^`, no `~`).
- Do **not** update any other dependency (Vite, TypeScript, Vitest, Playwright, etc.).
- Do **not** add or change: `Scale.RESIZE`, `Scale.FIT`, meta viewport, safe-areas, canvas
  size, `compositionLayout.ts`/`boardLayout.ts` geometry, grid coordinates, stone
  dimensions, gameplay rules, assets, animations, particles, or Playwright config (unless a
  v4 runtime breakage directly forces the last one).
- Keep `Phaser.AUTO`; do **not** force `Phaser.WEBGL` or Canvas.
- Canvas must remain exactly `x=0, y=0, 480×720`.
- Do **not** add `roundPixels` (or any render/scale option) to the config: the baseline
  runs `roundPixels: false` and v4 defaults to the same, so adding `roundPixels: true` would
  *change* text rendering, not preserve it (audit §4). `src/main.ts` stays byte-for-byte
  unchanged unless a v4 typing error on the *existing* config forces a minimal fix.
- No refactoring unrelated to the migration.
- Documentation "Phaser 3" → "Phaser 4" edits happen **only after** all suites are green.
- The full baseline and rationale live in
  `docs/superpowers/specs/2026-07-12-phaser-4-migration-audit.md`. Baseline reference image:
  `baseline-phaser3-seed1-480x720.png` in the session scratchpad.

**Baseline to preserve (must match after migration):** `npx tsc --noEmit` = exit 0, no
TypeScript diagnostics · `npm run build` green · `npm test` = 76 passed ·
`npm run test:e2e` = 9 passed ·
renderer = WebGL · canvas = `{0,0,480,720}` · `data-scene="battle"` ·
`data-monster-hp="1000"` · `window.__debug` with 5 keys · 32 cells · `?seed=1` deterministic.

---

### Task 0: Revalidate the baseline (no file changes)

**Files:** none — this task must **not** modify any file. It runs *before* Task 1 (before
any `package.json` / `package-lock.json` change) to confirm the "before" state is still the
green Phaser 3.90.0 baseline recorded in audit §1.

**Interfaces:**
- Produces: a confirmed-green Phaser 3.90.0 baseline and a confirmed-accessible reference
  screenshot, so that any post-migration difference is unambiguously attributable to the
  migration.

- [ ] **Step 1: Confirm a clean tree and record the start commit**

Run: `git status --short`
Expected: **no unrelated modifications** to production code (`src/`), tests (`tests/`),
configs (`vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`,
`index.html`), or dependencies (`package.json`, `package-lock.json`). The two migration
planning docs may appear as tracked or untracked depending on their commit state — either is
fine; anything else showing as modified must be investigated before proceeding.
Run: `git rev-parse HEAD`
Expected: `bd1f65e…` (the `origin/main` start commit recorded in the audit).

- [ ] **Step 2: Install the locked baseline deps and confirm the version**

Run: `npm ci`
Expected: exit 0.
Run: `npm ls phaser`
Expected: `└── phaser@3.90.0` (the baseline engine — **not** 4.2.1 yet).

- [ ] **Step 3: Run the full baseline gate (all must be green, nothing modified)**

Run: `npx tsc --noEmit`
Expected: exit code 0, with no TypeScript diagnostics.
Run: `npm run build`
Expected: green (the 500 kB chunk-size warning is pre-existing and acceptable).
Run: `npm test`
Expected: `Tests 76 passed (76)`.
Run: `npm run test:e2e`
Expected: `9 passed`.

If any of these is **not** green on the unmodified baseline, **stop** and report it as a
pre-existing issue (document it separately) — do **not** start the migration on a red
baseline.

- [ ] **Step 4: Confirm the reference screenshot is accessible**

Verify `…/scratchpad/baseline-phaser3-seed1-480x720.png` exists and is readable.
- If present: proceed.
- If **missing**: re-capture it **now, under Phaser 3.90.0** (the version installed in
  Step 2), at a 480×720 viewport with `?seed=1&debug=1`, **before** Task 1 changes
  `package.json` / `package-lock.json`. A baseline captured under 4.2.1 would be worthless
  for the before/after comparison.

- [ ] **Step 5: No commit** — this task changes nothing; there is nothing to commit.

---

### Task 1: Pin Phaser to 4.2.1 and update the lockfile

**Files:**
- Modify: `package.json` (the `phaser` dependency line)
- Modify: `package-lock.json` (regenerated)

**Interfaces:**
- Produces: `node_modules/phaser@4.2.1` installed; `npm ls phaser` reports `4.2.1`.

- [ ] **Step 1: Edit `package.json`** — change the dependency from `"phaser": "^3.85.0"` to
  an exact pin:

```json
  "dependencies": {
    "phaser": "4.2.1"
  },
```

- [ ] **Step 2: Regenerate the lockfile and install**

Run: `npm install --save-exact phaser@4.2.1`
(Regenerates `package-lock.json` for 4.2.1 and installs it. `--save-exact` keeps the pin.)

- [ ] **Step 3: Verify the locked version**

Run: `npm ls phaser`
Expected: `└── phaser@4.2.1` (no other phaser version in the tree).

- [ ] **Step 4: Confirm no unintended dependency drift**

Run: `git diff --stat package.json package-lock.json`
Expected: only `package.json` (one line) and `package-lock.json` changed. If any *other*
dependency version moved in the lockfile, stop and investigate before proceeding.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: pin phaser to 4.2.1 and update lockfile"
```

---

### Task 2: Get TypeScript + build green under 4.2.1

**Files:**
- Modify (only if a compile error forces it): `src/main.ts` and/or `src/scenes/BattleScene.ts`

**Interfaces:**
- Consumes: `phaser@4.2.1` from Task 1.
- Produces: a green `npx tsc --noEmit` **and** a green `npm run build`.

> **Important:** `npm run build` (Vite/esbuild) transpiles TypeScript **without** full
> type-checking, so a build passing does **not** prove the types are sound. `npx tsc --noEmit`
> is the authoritative type gate (`tsconfig.json` is `strict: true`, `noEmit: true`) and must
> be run explicitly. Both commands are required.

- [ ] **Step 1: Run the full type-check to surface any v4 type errors**

Run: `npx tsc --noEmit`
Expected (best case): exit code 0, with no TypeScript diagnostics — same as the Phaser
3.90.0 baseline. If it errors, the diagnostics name the exact symbol/line/file.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected (best case): green. (The 500 kB chunk-size *warning* is pre-existing and
acceptable; bundle size may differ from baseline — that is expected.)

- [ ] **Step 3: If (and only if) either command errored, apply the minimal fix**

Only touch the exact line the compiler rejects. Do **not** refactor. The audit predicts
zero errors (every used symbol — `Phaser.Types.Core.GameConfig`, `Phaser.AUTO`,
`Phaser.GameObjects.Container/Graphics/Text`, `Phaser.Input.Pointer`,
`Phaser.Math.Distance.Between`, and all Graphics/Text/Container methods — is stable in v4).
If an error does appear, record the exact before/after in the commit message. **After every
fix, re-run BOTH commands** (`npx tsc --noEmit` then `npm run build`) and repeat until both
are green.

- [ ] **Step 4: Confirm both gates are green**

Run: `npx tsc --noEmit` → Expected: exit code 0, with no TypeScript diagnostics.
Run: `npm run build` → Expected: `✓ built in …`.

- [ ] **Step 5: Commit** (only if a fix was needed in Step 3; otherwise nothing to commit —
  proceed to Task 3)

```bash
git add src/
git commit -m "fix: minimal type fix for Phaser 4.2.1 compatibility"
```

---

### Task 3: Verify full parity — suites, renderer, canvas, screenshot

> **Note (audit §4):** there is intentionally **no** `roundPixels` / config task. The
> baseline already runs `roundPixels: false` and v4 keeps that default, so no `src/` change
> is expected. This task proves parity empirically.

**Files:** none (verification only).

**Interfaces:**
- Consumes: the migrated build from Tasks 1–2.
- Produces: green suites + a documented before/after visual comparison.

- [ ] **Step 1: Full type-check (authoritative — `npm run build` does not type-check)**

Run: `npx tsc --noEmit`
Expected: exit code 0, with no TypeScript diagnostics — identical to the baseline (audit §1).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: green (`✓ built in …`). The 500 kB chunk-size warning is pre-existing.

- [ ] **Step 3: Run the unit suite**

Run: `npm test`
Expected: `Test Files 9 passed (9)` / `Tests 76 passed (76)` — identical to baseline.

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e`
Expected: `9 passed`. This re-verifies canvas bounds (480×720 @ origin), `?seed`
determinism, drag→damage, portals, special tiles, `data-scene`, `data-monster-hp`, and
`window.__debug`.

- [ ] **Step 5: Verify the runtime in a real browser — blocking criteria**

Start the dev server (`npm run dev`) and load `?seed=1&debug=1` at a 480×720 viewport.
The **blocking** criteria are:
- **Phaser 4.2.1 is the installed dependency** — `npm ls phaser` reports `4.2.1`;
- **Phaser 4.2.1 is the version running at runtime** — check `Phaser.VERSION === '4.2.1'`
  when `Phaser` is accessible in the page; otherwise read the version *number* from the
  console banner and compare **only the number** (`4.2.1`), not the full banner text;
- the **renderer is WebGL** — verified by probing the canvas context (returns a WebGL
  context, not 2D), **not** by the banner string;
- `document.querySelector('canvas').getBoundingClientRect()` → `{x:0, y:0, width:480,
  height:720}`;
- `document.body` has `data-scene="battle"` and `data-monster-hp="1000"`;
- `window.__debug` exists with keys `lastTurn, spawnTile, spawnPortal, getBoard,
  setMonsterHp` and `getBoard().length === 32`.
The console banner may be *observed* for information, but its exact text is **not** a
pass/fail criterion. If the renderer is **not** WebGL, stop and investigate (do not force
WEBGL blindly — determine why AUTO fell back).

- [ ] **Step 6: Capture the "after" screenshot and diff it against the baseline**

Re-capture `?seed=1&debug=1` at 480×720 → `after-phaser4-seed1-480x720.png` (in the
scratchpad, not the worktree). Compare to `baseline-phaser3-seed1-480x720.png`.
Expected: structurally identical (same monster, HP bar, 4 heroes, table, 32 stones, 2
portals, same positions). Any difference must be **sub-pixel** and may come only from
Phaser 4's new renderer — WebGL2, Graphics tessellation, text rasterization, or
antialiasing. A structural difference (moved/missing/rescaled element) is a **fail** —
investigate before continuing. **Never** respond to a visual difference by adding
`roundPixels` (audit §4); investigate the renderer instead.

- [ ] **Step 7: Confirm the diff contains no responsive/out-of-scope change**

Run: `git diff main --stat`
Expected: only `package.json`, `package-lock.json`, and the planning docs. **No `src/`
change** (unless a Task 2 type fix on the existing config was required and recorded). No
change to `main.ts`, `compositionLayout.ts`, `boardLayout.ts`, `BattleScene.ts`, tests, or
any `Scale`/viewport config.

---

### Task 4: Update documentation "Phaser 3" → "Phaser 4" (only after green)

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `design/implementation/BATTLE_SCENE_BLUEPRINT.md`

**Interfaces:**
- Consumes: fully green migration from Task 3 (do not start this task until Task 3 passed).

- [ ] **Step 1: Update `README.md`** — change "Built with Phaser 3, TypeScript, and Vite."
  to "Built with Phaser 4, TypeScript, and Vite."

- [ ] **Step 2: Update `CLAUDE.md`** — change "Built with Phaser 3 + TypeScript + Vite." to
  "Built with Phaser 4 + TypeScript + Vite."

- [ ] **Step 3: Update `design/implementation/BATTLE_SCENE_BLUEPRINT.md`** — change the
  Purpose line "…a scene structure that can be implemented in Phaser 3." to "…in Phaser 4."
  (Do not touch the "Responsive Layout Rules" section — that is out-of-scope design intent.)

- [ ] **Step 4: Grep for any remaining stale mentions**

Run: `grep -rn "Phaser 3" README.md CLAUDE.md design/ docs/`
Expected: no *current-state* claim that the app is built on Phaser 3 remains. (Historical
mentions inside dated spec/plan files may be left as-is — they record history; use judgment
and do not rewrite the archival design specs.)

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md design/implementation/BATTLE_SCENE_BLUEPRINT.md
git commit -m "docs: update Phaser 3 references to Phaser 4"
```

---

### Task 5: Write the final migration report

**Files:**
- Create: `docs/superpowers/plans/2026-07-12-phaser-4-migration-report.md`

**Interfaces:**
- Consumes: results from Tasks 1–4.

- [ ] **Step 1: Write the report** capturing, with **before vs after** results for each:
  `npx tsc --noEmit` (baseline: exit 0 / no diagnostics under 3.90.0 → after: under 4.2.1);
  `npm run build`; `npm test` (76 passed); `npm run test:e2e` (9 passed); final
  `npm ls phaser` (4.2.1); renderer before/after (WebGL/WebGL, via canvas-context probe, not
  banner text); canvas geometry before/after (`{0,0,480,720}`); confirmation that
  `roundPixels` stayed `false` (no config change) and the actual screenshot-diff outcome
  (identical, or the specific sub-pixel differences observed and their renderer-level cause);
  whether any Task 2 type fix was needed (and exactly what); confirmation the diff contains
  no responsive/out-of-scope change; and a link to the baseline/after screenshots.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-12-phaser-4-migration-report.md
git commit -m "docs: add Phaser 4.2.1 migration report"
```

---

## Commit slicing (summary)

0. *(no commit)* Task 0 — revalidate the green Phaser 3.90.0 baseline; changes nothing.
1. `build: pin phaser to 4.2.1 and update lockfile` — `package.json`, `package-lock.json`
2. *(conditional)* `fix: minimal type fix for Phaser 4.2.1 compatibility` — `src/` (only if
   Task 2 required it; expected: not needed)
3. `docs: update Phaser 3 references to Phaser 4` — README/CLAUDE/blueprint
4. `docs: add Phaser 4.2.1 migration report` — report

(There is deliberately no `roundPixels` commit — audit §4.)

The audit + this plan (already written) can be committed first as a docs-only commit, or
folded into the same branch — user's choice at execution time.

## Success criteria (migration considered done)

- `npx tsc --noEmit` = **exit 0, no TypeScript diagnostics** (before and after; `npm run
  build` alone does **not** type-check) · `npm run build` green · `npm test` = 76 passed ·
  `npm run test:e2e` = 9 passed
- Phaser **4.2.1** is the **installed dependency** (`npm ls phaser` = 4.2.1) **and** the
  version **running at runtime** (`Phaser.VERSION` = `4.2.1` when accessible in the page,
  otherwise the version *number* read from the console banner — compare the number only, not
  the full banner text)
- Canvas stays exactly `x=0, y=0, 480×720`; Playwright coordinates still hit the same cells
- Chains, portals, special tiles work; `?seed=N` still deterministic
- `window.__debug`, `data-scene`, `data-monster-hp` all still function
- Renderer still **WebGL** under `Phaser.AUTO` (verified by canvas-context probe, not by the
  banner string)
- Screenshot preserves the validated composition; any rasterization/AA difference is
  identified and explained (renderer-level cause), and **not** "fixed" via `roundPixels`
- `git diff main` contains **no** responsive change, **no `src/` change** (barring a Task 2
  typing fix), and touches only the files listed in audit §7
- `roundPixels` remains `false` (unset) — **not** added (audit §4)

## Self-review (against the audit)

- **Coverage:** every audit section maps to a task — baseline revalidation incl.
  `npx tsc --noEmit` and the reference-screenshot check (§1 → T0), dependency/lockfile
  (§7 → T1), type-check + build (§3/§6/P3 → T2, running `npx tsc --noEmit` then `npm run
  build`), behavior+renderer+visual parity incl. the `roundPixels` "no-change" verification
  (§1/§4/§5/§8/§10 → T3), docs (§7 → T4), report (§11 → T5).
- **Type-check honesty:** `npx tsc --noEmit` is the authoritative type gate and appears in
  T0, T2, T3, the success criteria, and the report; the plan never claims `npm run build`
  (Vite/esbuild) performs full type-checking.
- **Scope guard:** responsive material (§9) is explicitly excluded in every task's file list
  and in the Global Constraints. The corrected `roundPixels` finding (§4) means **no** config
  task exists, and no step ever recommends `roundPixels: true`.
- **Type/version consistency:** the pinned version string `4.2.1` (exact) is used identically
  in T1 and the success criteria; `roundPixels` is described consistently as staying `false`
  (unset) throughout.
