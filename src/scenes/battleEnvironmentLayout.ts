// Pure, Phaser-free and DOM-free placement model for the two Lot 1 combat
// environment background assets (see design/production/combat/lot-01-environment/
// ASSET_CONTRACT.md). It CONSUMES an already-computed BattleLayout and derives
// two placements from its only remaining semantic frontier — it never feeds
// anything back into battleLayout/boardGeometry/compositionLayout (gameplay
// math is strictly upstream of this module), and no coordinate here is
// copied from the reference image. Consumed today only by the &assetSlots=1
// diagnostic overlay in BattleScene; the future asset-integration lot will
// reuse the exact same placements.
import type { BattleLayout, Rect } from './battleLayout';

// Anchor-point convention (matches Phaser): `x`/`y` locate the point of the
// future sprite designated by (originX, originY). placementToRect() recovers
// the plain axis-aligned rect when needed (tests, guide drawing).
export interface AssetPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export const ENVIRONMENT_ROLES = ['battleBackgroundUpper', 'battleBackgroundLower'] as const;

export type BattleEnvironmentLayout = Record<(typeof ENVIRONMENT_ROLES)[number], AssetPlacement>;

export function placementToRect(p: AssetPlacement): Rect {
  return {
    x: p.x - p.width * p.originX,
    y: p.y - p.height * p.originY,
    width: p.width,
    height: p.height,
  };
}

// Derives the two full-viewport-width background slots from the layout's
// only remaining semantic frontier: the stone/wood seam (`layout.table.y`).
// - battleBackgroundUpper spans y ∈ [0, table.y]: vault, walls, arches, the
//   stone combat floor, and (now baked in) the cooking station and food
//   reserve that used to be separate edge clusters.
// - battleBackgroundLower spans y ∈ [table.y, viewport bottom]: the full
//   wooden preparation surface with the cutting board painted directly into
//   it, replacing the former separate table + cutting-board assets.
// Read-only over `layout`; deterministic (no RNG, no DOM, no time); no
// tunable policy remains once both placements are pure functions of
// layout.background and layout.table.y.
export function computeBattleEnvironmentLayout(layout: BattleLayout): BattleEnvironmentLayout {
  const viewport = layout.background;
  const seamY = layout.table.y;

  return {
    battleBackgroundUpper: {
      x: viewport.width / 2,
      y: 0,
      width: viewport.width,
      height: seamY,
      originX: 0.5,
      originY: 0,
    },
    battleBackgroundLower: {
      x: viewport.width / 2,
      y: seamY,
      width: viewport.width,
      height: viewport.height - seamY,
      originX: 0.5,
      originY: 0,
    },
  };
}
