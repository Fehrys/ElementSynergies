# Lot 1 — Combat Environment Production

This folder drives the production of the **two background assets** that will
replace the single master reference image
`design/references/combat-background-target.png` in the combat scene.

> **Five-to-two migration (2026-07-18).** The five-asset contract
> (`battleBackgroundUpper`, `prepTableBase`, `cuttingBoard`, `leftHearth`,
> `rightLarder`) is replaced by two full-band paintings: `battleBackgroundUpper`
> (now also baking in the cooking station and food reserve) and
> `battleBackgroundLower` (now also baking in the table and cutting board).
> `ASSET_CONTRACT.md` documents the current, binding two-background contract
> and its rationale; the linked specs/plans below describe the superseded
> six- and five-asset versions and are kept for history only.

The master image stays the qualitative art target (see
`design/references/ART_TARGET.md`); this lot decomposes its *environment* into
two integrable layers. Characters, tiles, HUD and effects are NOT part of
Lot 1.

## Status

**Zero of two backgrounds finalized.** Both `battleBackgroundUpper` and
`battleBackgroundLower` are `status: 'pending'` in
`src/assets/battleEnvironmentAssets.ts`. A draft `battle_bg_upper.webp`
already sits at its final path from the superseded five-asset contract, but
it does not yet integrate the left/right decor this contract requires, so it
is not marked `available`. `battle_bg_lower.webp` does not exist yet. See
`tests/assets/environmentAssetFiles.test.ts` for the automated check that
only validates `available` assets and never promotes a `pending` draft.
Loading these assets into Phaser (`this.load.image()`) is still out of scope
for Lot 1 — a later integration lot wires that up.

## Superseded intermediate sources

These files were produced under the earlier six-/five-asset contracts. They
are **not referenced by the active manifest** and are kept only as possible
source material for painting the two new backgrounds:

- `public/assets/battle/environment/preparation/battle_prep_table_base.webp`
- `public/assets/battle/environment/preparation/battle_prep_cutting_board.png`
- `public/assets/battle/environment/background/battle_bg_upper.webp` (draft —
  reusable as a starting point for the new `battleBackgroundUpper`, but needs
  the left/right decor integrated before it can be marked `available`)

`public/assets/battle/environment/props/left/` and
`public/assets/battle/environment/props/right/` hold only `.gitkeep` — the
`leftHearth`/`rightLarder` roles they were reserved for no longer exist.

## Deferred cleanup

Do not delete any of the above until both new backgrounds are produced,
deposited at their final paths, and validated. Once that happens:

- remove the superseded files listed above;
- remove the now-empty `props/left/`, `props/right/` and `preparation/`
  folders under `public/assets/battle/environment/`;
- remove this section and the "Superseded intermediate sources" section
  above.

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
  kept for history. `review/slots/` holds the slot-guide captures; the
  two-background overlay will need fresh captures once produced.
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
