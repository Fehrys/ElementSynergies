# Lot 1 — Combat Environment Production

This folder drives the production of the **six modular environment assets** that
will replace the single master reference image
`design/references/combat-background-target.png` in the combat scene.

The master image stays the qualitative art target (see
`design/references/ART_TARGET.md`); this lot decomposes its *environment* into
integrable layers. Characters, tiles, HUD and effects are NOT part of Lot 1.

## Status

**Contract + slot-review stage.** No final asset exists yet. Do not commit any
image to the `public/assets/battle/environment/` tree until its export has been
validated against the slot guides described below.

## Documents

- `ASSET_CONTRACT.md` — the binding production contract for each of the six
  assets (naming, transparency, anchor, depth, target rect, responsive and
  crop behavior, inclusion/exclusion lists, validation criteria).
- Spec: `docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md`
- Plan: `docs/superpowers/plans/2026-07-14-lot-01-environment-production-setup.md`

## Folders

- `source/` — working files (layered PSD/Krita/etc.) used to cut the six
  assets out of the master. Never referenced by the game.
- `exports/` — candidate exports awaiting validation. Never referenced by the
  game.
- `review/` — captured review images. `review/slots/` holds the slot-guide
  captures at the three reference formats (360×640, 480×720, 768×1024).
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

Each of the six slots is drawn as a semi-transparent colored rectangle with its
Phaser key as label. The overlay recomputes on every resize. It is a
diagnostic mode only and does not exist in normal play.

## Workflow

1. Cut/paint the asset in `source/`.
2. Export to `exports/` per the contract (format, transparency, bleed).
3. Compare against `review/slots/` captures and the live `assetSlots=1` mode.
4. Once validated, move the export to its final `public/assets/...` path and
   only then wire loading (a later lot — loading is out of scope for Lot 1).
