# Phaser 4.2.1 Migration Report

**Date:** 2026-07-12
**Branch:** `chore/phaser-4-migration`
**Companion documents:** `docs/superpowers/specs/2026-07-12-phaser-4-migration-audit.md` (audit),
`docs/superpowers/plans/2026-07-12-phaser-4-migration.md` (plan).

This report records the executed, isolated migration of the ElementSynergies prototype from
Phaser **3.90.0** to Phaser **4.2.1**, with before/after evidence for every gate defined in
the plan.

---

## 1. Outcome summary

The migration was a **dependency-level change only**. No production source, test, or config
file was modified. The audit's central prediction held: the project uses no Phaser API that
was removed or changed between v3.90.0 and v4.2.1, so pinning the new engine was sufficient.

| | Value |
| --- | --- |
| Engine before | `phaser@3.90.0` (installed via the `^3.85.0` range) |
| Engine after | `phaser@4.2.1` (pinned exact, no caret) |
| Production source changes | **none** (`src/` untouched) |
| Type fix required (plan Task 2) | **none** |
| `roundPixels` config change | **none** (stayed `false`; see §5) |
| Net tracked diff vs `main` | `package.json` + `package-lock.json` only |

### Commits

| Commit | Message |
| --- | --- |
| `0c19d56` | `build: pin phaser to 4.2.1 and update lockfile` |
| `c21b8ab` | `docs: update Phaser 3 references to Phaser 4` |

Task 0 (revalidate baseline) and Task 2 (type-check/build under 4.2.1) changed no files and
produced no commit. There is deliberately **no `roundPixels` commit** (audit §4).

---

## 2. Before vs after — verification gates

All "before" values were measured on the unmodified `phaser@3.90.0` baseline (plan Task 0);
all "after" values on `phaser@4.2.1` (plan Task 3).

| Gate | Before (3.90.0) | After (4.2.1) |
| --- | --- | --- |
| `npx tsc --noEmit` | exit 0, no diagnostics | exit 0, no diagnostics |
| `npm run build` | exit 0 | exit 0 |
| `npm test` (Vitest) | 76 passed | 76 passed |
| `npm run test:e2e` (Playwright) | 9 passed | 9 passed |
| `npm ls phaser` | `phaser@3.90.0` | `phaser@4.2.1` |
| Renderer under `Phaser.AUTO` (canvas-context probe) | WebGL | WebGL |
| Runtime version (console banner number) | `v3.90.0` | `v4.2.1` |
| Canvas geometry (`getBoundingClientRect`) | `{0, 0, 480, 720}` | `{0, 0, 480, 720}` |
| Canvas backing store (`canvas.width`/`height`) | 480 × 720 | 480 × 720 |
| DOM mirrors (`data-scene` / `data-monster-hp`) | `battle` / `1000` | `battle` / `1000` |
| `?debug=1` → `window.__debug.getBoard()` cell count | 32 | 32 |

Notes:

- **Installed vs runtime version are distinct signals** and were both checked: `npm ls phaser`
  confirms the installed dependency (4.2.1); the browser console banner
  (`Phaser v4.2.1 (WebGL | Web Audio)`) confirms the engine actually executing at runtime. Only
  the version *number* is compared, not the full banner text.
- **Renderer** was confirmed via a canvas-context probe (`getContext('webgl2') ||
  getContext('webgl')` returned a WebGL context), not by trusting banner text.
- The e2e suite can flake on a **cold Vite/WebGL start** (a first-run timeout waiting for
  `[data-scene="battle"]`); this was observed once on the baseline and cleared on an immediate
  re-run (9/9). It is a startup-timing artifact, not a regression, and occurred in neither the
  final baseline nor the final 4.2.1 e2e run.

---

## 3. Bundle size (informational)

The production bundle grew, as expected for the larger v4 engine. This is not a defect and no
budget is configured for it:

| | JS bundle | gzip |
| --- | --- | --- |
| Before (3.90.0) | 1,494.15 kB | 345.36 kB |
| After (4.2.1) | 1,699.99 kB | 387.18 kB |

Vite's pre-existing "chunks larger than 500 kB" advisory appears under both engines and is
unrelated to this migration.

---

## 4. Visual parity (screenshot diff)

Both screenshots were captured at the fixed 480×720 canvas, deterministic `?seed=1`:

- Baseline (Phaser 3.90.0): `…/scratchpad/baseline-phaser3-seed1-480x720.png`
- After (Phaser 4.2.1): `…/scratchpad/after-phaser4-seed1-480x720.png`

**Result: visually identical.** The seeded board (stone colors and positions), the HP bar and
`Frost Yeti: 1000/1000` label, the four hero placeholders, the monster placeholder, the
background, and the portal glyphs all match. No sub-pixel or texture-filtering differences were
observed that required any intervention. In particular, **no `roundPixels` change was made or
needed** — any hypothetical sub-pixel shift would have been attributed to the renderer, never
"fixed" by toggling `roundPixels` (audit §4, §10).

---

## 5. roundPixels confirmation

`roundPixels` remained `false` throughout, with **no config change**. This is the corrected
finding from the audit: contrary to the Phaser migration guide's blanket claim, Phaser 3.90.0
does **not** default `roundPixels` to `true` — the installed source
(`node_modules/phaser/src/core/Config.js`) defaults it to `false`, and only forces `true` under
`pixelArt`. This project sets no `roundPixels`, `pixelArt`, or `zoom`, so the effective value is
`false` in both v3.90.0 and v4.2.1. Additionally, the board is drawn with `Graphics` objects,
which ignore `roundPixels` regardless. The project's rendering is therefore unaffected by this
property in either engine.

---

## 6. Scope confirmation (no out-of-scope / responsive change)

`git diff main --stat` after the migration:

```text
 package-lock.json | 10 +++++-----
 package.json      |  2 +-
 2 files changed, 6 insertions(+), 6 deletions(-)
```

- **No `src/` change**, no test change, no Vite/Vitest/Playwright/tsconfig/`index.html` change.
- The `package-lock.json` delta is phaser-only: the phaser node's `version`/`resolved`/
  `integrity`, plus phaser 4's own declared `eventemitter3` range (`^5.0.1` → `^5.0.4`). No
  unrelated dependency drifted.
- **No responsive work** was performed: the canvas stays a fixed 480×720, `Phaser.AUTO` with no
  `Scale` mode, no meta-viewport / safe-area / `compositionLayout.ts` / `boardLayout.ts` /
  grid-coordinate / stone-dimension edits. The Phaser-3 responsive audit was not used as a
  technical source.

The documentation commit (`c21b8ab`) additionally updated three current-state prose references
(`README.md`, `CLAUDE.md`, `design/implementation/BATTLE_SCENE_BLUEPRINT.md`) from "Phaser 3"
to "Phaser 4". The migration's own audit/plan and the historical `2026-07-05` design docs
intentionally retain their Phaser-3 baseline references as historical record.

---

## 7. Conclusion

The migration to Phaser 4.2.1 is complete and fully verified. Every gate that was green on the
3.90.0 baseline is green on 4.2.1 with identical results, the visual output is unchanged, the
production source is byte-for-byte untouched, and the tracked change set is limited to the two
dependency-manifest files. No compatibility fix, no `roundPixels` adjustment, and no responsive
or other out-of-scope change was required.
