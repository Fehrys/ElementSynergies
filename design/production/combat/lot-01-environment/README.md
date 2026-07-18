# Lot 1 — Combat Environment Production

This folder documents the production of the **two background assets** that
replace the single master reference image
`design/references/combat-background-target.png` in the combat scene.

> **History: six assets → five assets → two backgrounds.** The original
> contract split the scene into six, then five, separately-placed layers
> (architecture/floor, table, cutting board, two edge prop clusters). On
> 2026-07-18 that was replaced by two full-band paintings:
> `battleBackgroundUpper` (baking in the cooking station and food reserve)
> and `battleBackgroundLower` (baking in the table and cutting board).
> `ASSET_CONTRACT.md` documents the current, binding two-background contract
> and its rationale; the linked specs/plans below describe the superseded
> six- and five-asset versions and are kept for history only.

The master image stays the qualitative art target (see
`design/references/ART_TARGET.md`); this lot decomposes its *environment* into
two integrable layers. Characters, tiles, HUD and effects are NOT part of
Lot 1.

## Status

**Lot 1 production contract complete: two backgrounds finalized out of two.**
Both `battleBackgroundUpper` and `battleBackgroundLower` are
`status: 'available'` in `src/assets/battleEnvironmentAssets.ts`, with their
real, measured `productionSize`. The final files are deposited at:

- `public/assets/battle/environment/background/battle_bg_upper.webp` —
  1536×1024, real WebP (VP8L), opaque.
- `public/assets/battle/environment/background/battle_bg_lower.webp` —
  1536×1280, real WebP (VP8L), opaque.

`tests/assets/environmentAssetFiles.test.ts` validates both files: existence,
real WebP container, decoded dimensions against the manifest, and a
header-level opacity check. The superseded five-asset intermediate sources
(`preparation/battle_prep_table_base.webp`, `preparation/battle_prep_cutting_board.png`,
the `props/left/` and `props/right/` placeholder folders) have been removed
from the tree — the runtime folder now contains only the two final
backgrounds. Loading these assets into Phaser (`this.load.image()`) remains
out of scope for Lot 1 — visual integration into the normal combat scene is a
separate, later lot.

## Lot 2 update (2026-07-18)

`battleBackgroundLower`'s sprite is now hidden (`setVisible(false)`) in
normal gameplay — the puzzle board's size no longer aligns to this
artwork; see
`docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md`.
The file, manifest entry, and loading are all unchanged and it remains
fully available to both `?artReview=combatBackground` review modes.

## Documents

- `ASSET_CONTRACT.md` — the binding production contract for each of the two
  backgrounds (naming, transparency, anchor, depth, target rect, responsive
  and crop behavior, inclusion/exclusion lists, validation criteria).
- Spec (superseded, six-asset version, kept for history):
  `docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md`
- Plan (superseded, six-asset version, kept for history):
  `docs/superpowers/plans/2026-07-14-lot-01-environment-production-setup.md`
- Finalization spec/plan (superseded, five-asset version, kept for history):
  `docs/superpowers/specs/2026-07-15-lot-01-contract-finalization-design.md`,
  `docs/superpowers/plans/2026-07-15-lot-01-contract-finalization.md`

## Folders

- `source/` — working files (layered PSD/Krita/etc.) used to paint the two
  backgrounds. Never referenced by the game.
- `exports/` — candidate exports awaiting validation. Never referenced by the
  game.
- `review/` — captured review images from the superseded five-asset contract,
  kept for history. `review/slots/` holds the slot-guide captures; fresh
  captures against the two produced backgrounds are optional follow-up, not
  a blocker for this Lot's contract.
- Final validated files ship to `public/assets/battle/environment/…` at the
  exact paths listed in the contract (mirrored by the TypeScript manifest
  `src/assets/battleEnvironmentAssets.ts`).

## Reviewing the placements

The future placements are computed at runtime by
`src/scenes/battleEnvironmentLayout.ts` (pure, derived from the validated
`BattleLayout` — no coordinate is copied from the image). To see them
overlaid on the master image with real gameplay:

```
http://localhost:5173/?seed=1&artReview=combatBackground&assetSlots=1
```

Each of the two slots is drawn as a semi-transparent colored rectangle with
its Phaser key as label. The overlay recomputes on every resize. It is a
diagnostic mode only and does not exist in normal play.

## Workflow

1. Paint the asset in `source/`.
2. Export to `exports/` per the contract (format, opacity, bleed).
3. Compare against the live `assetSlots=1` mode.
4. Once validated, move the export to its final `public/assets/...` path,
   flip its manifest `status` to `'available'` with the file's real measured
   `productionSize`, and only then wire loading (a later lot — loading is out
   of scope for Lot 1).
