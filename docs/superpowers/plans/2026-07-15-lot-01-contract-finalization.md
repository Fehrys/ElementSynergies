# Lot 1 contract finalization — plan

Spec: `docs/superpowers/specs/2026-07-15-lot-01-contract-finalization-design.md`
Branch: `design/lot-01-environment-production-setup` (still unmerged).

## Task 1 — docs: finalize lot 1 environment asset contract
- `git mv design/VISUAL_COMPSITION.md design/VISUAL_COMPOSITION.md`; fix the
  stale spellings in `ASSET_CONTRACT.md` and
  `design/implementation/BATTLE_SCENE_AUDIT.md`.
- ASSET_CONTRACT.md: Asset 1 gains the high-peripheral-props inclusion (with
  HUD/boss-safe-area constraints); Assets 3/4 gain the "not responsible for
  ceiling-level accessories" split; new shared **Production source
  dimensions** section; Asset 5 gains the logical-slot-boundary vs
  optional-future-render-overlap note; Asset 6 documents the
  `minimumBoardTopGap` clamp.
- Add this spec + plan.

## Task 2 — feat: add production dimensions and cutting board gap policy
- `battleEnvironmentAssets.ts`: `ProductionSize` type + documentary
  `productionSize` on the six entries.
- `battleEnvironmentLayout.ts`: `minimumBoardTopGap: 8` in
  `EnvironmentSlotPolicy`/default; clamp the cutting-board top to
  `table.y + gap` by shifting only `y`.
- `BattleScene.drawAssetSlots()`: also serialize the active policy to
  `data-asset-slots-policy` (same lifecycle as `data-asset-slots-layout`).

## Task 3 — test: cover final environment slot constraints
- Adapt the cutting-board derivation test to the clamped top; add gap
  assertions per viewport (incl. 768 natural placement untouched); add a
  clamp-isolation test (custom gap ⇒ only `cuttingBoard.y` differs); add an
  explicit 32-cell-positions-unchanged test; add productionSize tests; pin
  `clusterMaxWidth = 220`.
- E2e: assert `data-asset-slots-policy` in the active-mode test and its
  absence in the inert-mode tests.

## Task 4 — docs: add final environment slot review captures
- Re-export the three captures as `environment-slots-{WxH}-final.png`
  (previous captures kept); note them in the production README.

## Validation gate (every task lands green)
`npx tsc --noEmit` · `npm test` · `npm run test:e2e` (baselines untouched) ·
`npm run build`. No baseline regeneration, no asset file created.
