// Pure, Phaser-free and DOM-free placement model for the six Lot 1 combat
// environment assets (see design/production/combat/lot-01-environment/
// ASSET_CONTRACT.md). It CONSUMES an already-computed BattleLayout and derives
// six placements from its semantic frontiers — it never feeds anything back
// into battleLayout/boardGeometry/compositionLayout (gameplay math is strictly
// upstream of this module), and no coordinate here is copied from the
// reference image. Consumed today only by the &assetSlots=1 diagnostic overlay
// in BattleScene; the future asset-integration lot will reuse the exact same
// placements.
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

export const ENVIRONMENT_ROLES = [
  'upperArchitecture',
  'stoneFloor',
  'leftHearth',
  'rightLarder',
  'prepTableBase',
  'cuttingBoard',
] as const;

export type BattleEnvironmentLayout = Record<(typeof ENVIRONMENT_ROLES)[number], AssetPlacement>;

// Every tunable of the slot model lives HERE (single readable policy — never
// scattered magic numbers). These are art-direction placeholders to be tuned
// against the produced assets, not gameplay values.
export interface EnvironmentSlotPolicy {
  // Side clusters (hearth / larder): width = min(fraction × viewport width, cap),
  // so phones compress/crop the clusters and tablets never let them balloon
  // toward the gameplay column.
  clusterWidthFraction: number; // 0.30
  clusterMaxWidth: number; // 220 game units
  // Cutting board visual margins around board.tileBounds, expressed as
  // FRACTIONS OF tileBounds so the wooden frame follows the board's own
  // responsive scale at every format (uniform scaling by construction).
  cuttingBoardSideMarginFraction: number; // 0.07 of tileBounds.width, each side
  cuttingBoardTopMarginFraction: number; // 0.09 of tileBounds.height
  cuttingBoardBottomMarginFraction: number; // 0.13 of tileBounds.height (groove/lip side)
}

export const DEFAULT_ENVIRONMENT_SLOT_POLICY: EnvironmentSlotPolicy = {
  clusterWidthFraction: 0.3,
  clusterMaxWidth: 220,
  cuttingBoardSideMarginFraction: 0.07,
  cuttingBoardTopMarginFraction: 0.09,
  cuttingBoardBottomMarginFraction: 0.13,
};

export function placementToRect(p: AssetPlacement): Rect {
  return {
    x: p.x - p.width * p.originX,
    y: p.y - p.height * p.originY,
    width: p.width,
    height: p.height,
  };
}

// Derives the six slots from the layout's SEMANTIC frontiers only:
// - viewport            = layout.background
// - wall/floor seam     = layout.environment.horizonY (bands.hero.top)
// - stone/wood seam     = layout.table.y (bands.hero.bottom + tableTopGap)
// - preparation band    = layout.table (full-bleed, validated)
// - cluster upper bound = layout.bands.monster.top
// - puzzle support      = layout.board.tileBounds (+ policy margins)
// Read-only over `layout`; deterministic (no RNG, no DOM, no time).
export function computeBattleEnvironmentLayout(
  layout: BattleLayout,
  policy: EnvironmentSlotPolicy = DEFAULT_ENVIRONMENT_SLOT_POLICY,
): BattleEnvironmentLayout {
  const viewport = layout.background;
  const horizonY = layout.environment.horizonY;
  const prepTopY = layout.table.y; // stone/wood separation
  const clusterTopY = layout.bands.monster.top;
  const clusterWidth = Math.min(viewport.width * policy.clusterWidthFraction, policy.clusterMaxWidth);

  const tiles = layout.board.tileBounds;
  const columnCenterX = layout.gameplayColumn.x + layout.gameplayColumn.width / 2;
  const sideMargin = tiles.width * policy.cuttingBoardSideMarginFraction;
  const topMargin = tiles.height * policy.cuttingBoardTopMarginFraction;
  const bottomMargin = tiles.height * policy.cuttingBoardBottomMarginFraction;
  const boardWidth = tiles.width + 2 * sideMargin;
  const boardHeight = tiles.height + topMargin + bottomMargin;

  return {
    // Vault / wall / boss alcove: viewport-wide band from the top edge down to
    // the wall/floor seam; the future asset cover-fits this band (may crop
    // laterally on phones, extends on tablets — never stretched).
    upperArchitecture: {
      x: viewport.width / 2,
      y: 0,
      width: viewport.width,
      height: horizonY,
      originX: 0.5,
      originY: 0,
    },
    // Stone ground plane between the two seams. Deliberately derived from the
    // band frontiers, never from the hero rects — the validated hero↔table
    // clearance lives inside this band.
    stoneFloor: {
      x: viewport.width / 2,
      y: horizonY,
      width: viewport.width,
      height: prepTopY - horizonY,
      originX: 0.5,
      originY: 0,
    },
    // Side prop clusters: edge-anchored, standing on the stone/wood seam,
    // rising to the monster band's top. They compress/crop at the edges and
    // can never influence the gameplay column (pure read of the layout).
    leftHearth: {
      x: 0,
      y: prepTopY,
      width: clusterWidth,
      height: prepTopY - clusterTopY,
      originX: 0,
      originY: 1,
    },
    rightLarder: {
      x: viewport.width,
      y: prepTopY,
      width: clusterWidth,
      height: prepTopY - clusterTopY,
      originX: 1,
      originY: 1,
    },
    // The wooden preparation band IS layout.table, 1:1.
    prepTableBase: {
      x: layout.table.x,
      y: layout.table.y,
      width: layout.table.width,
      height: layout.table.height,
      originX: 0,
      originY: 0,
    },
    // Puzzle support: tileBounds grown by the margin policy, centered on the
    // gameplay column. Never follows layout.table's full-bleed width.
    cuttingBoard: {
      x: columnCenterX,
      y: tiles.y - topMargin + boardHeight / 2,
      width: boardWidth,
      height: boardHeight,
      originX: 0.5,
      originY: 0.5,
    },
  };
}
