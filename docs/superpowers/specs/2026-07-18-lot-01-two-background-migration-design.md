# Lot 1 — Two-background migration — design

Date: 2026-07-18
Status: approved (locked art decision, direct continuation of the five-asset contract)

## Goal

Replace the five-asset Lot 1 environment contract with a two-background
contract: one opaque painting for the upper scene (architecture + combat
floor + cooking station + food reserve, all baked in), one opaque painting
for the lower scene (table + cutting board, baked in). No asset is produced,
resized, cropped, re-encoded or renamed by this change — only the contract,
manifest, placement model, `assetSlots=1` overlay, tests, and documentation
move to the two-background shape. The two final illustrations are produced
and deposited separately by the user.

## Why

- Better artistic coherence: one perspective/light pass per band instead of
  reconciling five separately-lit layers.
- Removes the visible seams between architecture and the prop clusters, and
  between the table and the cutting board.
- Removes almost all alpha-channel cutout work (both new assets are opaque
  WebP; the retired cutting board and two prop clusters were the only assets
  that needed true alpha).
- Simpler production (two exports instead of five) and simpler runtime (two
  placements, two depths, two future `this.load.image()` calls).
- The combat scene is mostly static for Lot 1's purposes; small animated
  overlays (flames, embers, smoke, steam, glow) can be added later on top of
  these two backgrounds if needed — explicitly out of scope here.

## What changes

1. `BattleEnvironmentRole` shrinks to `'battleBackgroundUpper' |
   'battleBackgroundLower'`; `prepTableBase`, `cuttingBoard`, `leftHearth`,
   `rightLarder` are removed from the active runtime contract (their
   historic files are not deleted — see "What does not change").
2. The manifest (`src/assets/battleEnvironmentAssets.ts`) becomes a
   discriminated union on `status`: an `'available'` entry carries a real,
   measured `productionSize`; a `'pending'` entry carries a recommended
   `targetSize` — so a draft file sitting at a pending asset's path is never
   mistaken for a validated final asset.
3. `computeBattleEnvironmentLayout` (`src/scenes/battleEnvironmentLayout.ts`)
   now derives exactly two placements from the single remaining semantic
   frontier, `layout.table.y`:
   - `battleBackgroundUpper`: `x ∈ [0, viewport.width]`, `y ∈ [0, table.y]`.
   - `battleBackgroundLower`: `x ∈ [0, viewport.width]`, `y ∈ [table.y,
     viewport.height]`.
   All cluster/cutting-board-specific policy (`clusterWidthFraction`,
   `clusterMaxWidth`, the three cutting-board margin fractions,
   `minimumBoardTopGap`, and the `EnvironmentSlotPolicy` type itself) is
   removed — nothing is left to tune once both placements are pure functions
   of `layout.background` and `layout.table.y`.
4. The `assetSlots=1` overlay in `BattleScene.ts` draws two rects/labels
   instead of five (3 review objects total: 1 `Graphics` + 2 labels).
5. Tests (unit + e2e + asset-file validation) are rewritten for the
   two-background shape; `tests/assets/pngHeader.ts` is deleted (both
   remaining assets are WebP; confirmed unused anywhere else in the repo
   once removed from the one test that used it).
6. `ASSET_CONTRACT.md` and `README.md` under
   `design/production/combat/lot-01-environment/` are rewritten for the
   two-background contract, with a supersession note and the rationale above.

## What does not change

- Gameplay layout: `layout.table.y`, the combat/prep separation, boss/hero/HUD
  positions, the 32-cell grid, `tileBounds`, the responsive policies for
  360×640, 480×720, 768×1024.
- `src/scenes/depth.ts`.
- Any binary asset file under `public/assets/battle/environment/` — none is
  created, resized, cropped, re-encoded, or deleted. The old separate-asset
  files remain on disk as possible source material; deleting them is a
  deferred cleanup task once the two new backgrounds are produced and
  validated (tracked in the lot's `README.md`).
- `src/scenes/combatBackgroundReview.ts` — it holds no role-specific logic
  (`computeCoverFit`, `parseArtReviewMode`, `parseArtGuides`,
  `parseAssetSlots` are all role-agnostic), so nothing in it needs to change.

## Historical documents

`docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md`,
`docs/superpowers/plans/2026-07-14-lot-01-environment-production-setup.md`,
`docs/superpowers/specs/2026-07-15-lot-01-contract-finalization-design.md`,
`docs/superpowers/plans/2026-07-15-lot-01-contract-finalization.md` already
carry supersession notices pointing at `ASSET_CONTRACT.md` as the current,
binding contract — since that pointer doesn't hardcode an asset count, no
edit to those four files is needed; `ASSET_CONTRACT.md` itself now describes
the two-background contract they point to.
