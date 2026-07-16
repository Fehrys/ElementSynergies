# Lot 1 — Combat Environment Production

This folder drives the production of the **five modular environment assets**
that will replace the single master reference image
`design/references/combat-background-target.png` in the combat scene.

> **Six-to-five migration (2026-07-16).** The original contract split the
> upper scene into two layers, `upperArchitecture` and `stoneFloor`. They are
> now merged into a single `battleBackgroundUpper` asset that covers the full
> band from the viewport top down to the stone/wood separation (`layout.table.y`)
> in one painting — the wall/floor seam is no longer an asset-slot boundary.
> `ASSET_CONTRACT.md` documents the current, binding five-asset contract; the
> 2026-07-14 and 2026-07-15 specs/plans linked below describe the superseded
> six-asset version and are kept for history only.

The master image stays the qualitative art target (see
`design/references/ART_TARGET.md`); this lot decomposes its *environment* into
integrable layers. Characters, tiles, HUD and effects are NOT part of Lot 1.

## Status

**Three of five assets produced, contract finalized for five.** `battle_bg_upper.webp`,
`battle_prep_table_base.webp` and `battle_prep_cutting_board.png` are produced
and live at their final path under `public/assets/battle/environment/`. The
two prop clusters (`battle_left_hearth_cluster.png`,
`battle_right_larder_cluster.png`) are still awaiting production — only
`.gitkeep` placeholders exist at their folders. See
`tests/assets/environmentAssetFiles.test.ts` for the automated check that
distinguishes available from pending assets, and `ASSET_CONTRACT.md`'s
"Known issues" section for two unresolved problems on the produced files
(a container/extension mismatch and a missing alpha channel on the cutting
board). Loading these assets into Phaser (`this.load.image()`) is still out
of scope for Lot 1 — a later integration lot wires that up.

## Documents

- `ASSET_CONTRACT.md` — the binding production contract for each of the five
  assets (naming, transparency, anchor, depth, target rect, responsive and
  crop behavior, inclusion/exclusion lists, validation criteria).
- Spec (superseded, six-asset version, kept for history):
  `docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md`
- Plan (superseded, six-asset version, kept for history):
  `docs/superpowers/plans/2026-07-14-lot-01-environment-production-setup.md`
- Finalization spec/plan (superseded, six-asset version, five contract
  adjustments, 2026-07-15, kept for history):
  `docs/superpowers/specs/2026-07-15-lot-01-contract-finalization-design.md`,
  `docs/superpowers/plans/2026-07-15-lot-01-contract-finalization.md`

## Folders

- `source/` — working files (layered PSD/Krita/etc.) used to cut the five
  assets out of the master. Never referenced by the game.
- `exports/` — candidate exports awaiting validation. Never referenced by the
  game.
- `review/` — captured review images. `review/slots/` holds the slot-guide
  captures at the three reference formats (360×640, 480×720, 768×1024).
  The `environment-slots-{WxH}-final.png` set is the **final production
  checkpoint** (includes the `minimumBoardTopGap` clamp on the cutting-board
  slot); the suffix-less set is the earlier pre-finalization capture, kept
  for history.
- Final validated files ship to `public/assets/battle/environment/…` at the
  exact paths listed in the contract (mirrored by the TypeScript manifest
  `src/assets/battleEnvironmentAssets.ts`).

## Reviewing the placements

The future placements are computed at runtime by
`src/scenes/battleEnvironmentLayout.ts` (pure, derived from the validated
`BattleLayout` — no coordinate is copied from the image). To see them overlaid
on the master image with real gameplay:

```
http://localhost:5173/?seed=1&artReview=combatBackground&assetSlots=1
```

Each of the five slots is drawn as a semi-transparent colored rectangle with its
Phaser key as label. The overlay recomputes on every resize. It is a
diagnostic mode only and does not exist in normal play.

## Workflow

1. Cut/paint the asset in `source/`.
2. Export to `exports/` per the contract (format, transparency, bleed).
3. Compare against `review/slots/` captures and the live `assetSlots=1` mode.
4. Once validated, move the export to its final `public/assets/...` path and
   only then wire loading (a later lot — loading is out of scope for Lot 1).
