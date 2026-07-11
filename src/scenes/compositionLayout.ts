// Centralized composition layout, Phaser-free by the same convention as
// boardLayout.ts (importable from plain Node). Translates the percentage
// composition ranges in design/implementation/BATTLE_SCENE_BLUEPRINT.md into
// pixel regions for a fixed canvas, and derives the flat placeholders'
// footprints. This is NOT responsive-scaling support: the canvas stays a
// fixed 480x720; the function takes (width, height) only so the math is
// expressed proportionally in one place.

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 720;

export interface Band {
  top: number;
  bottom: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutRegions {
  topHud: Band;
  monster: Band;
  hero: Band;
  board: Band;
  safeBottom: Band;
  boardWidthBand: { left: number; right: number; width: number };
}

export interface PlaceholderLayout {
  monster: Rect;
  heroes: Rect[];
}

export function computeLayoutRegions(width: number, height: number): LayoutRegions {
  const band = (fromPct: number, toPct: number): Band => {
    const top = height * (fromPct / 100);
    const bottom = height * (toPct / 100);
    return { top, bottom, height: bottom - top };
  };

  // Blueprint: "the board should normally use at least 88% of the safe width."
  const boardWidth = width * 0.88;
  const left = (width - boardWidth) / 2;

  return {
    topHud: band(0, 8),
    monster: band(8, 34),
    hero: band(34, 46),
    board: band(46, 93),
    safeBottom: band(93, 100),
    boardWidthBand: { left, right: left + boardWidth, width: boardWidth },
  };
}

const MONSTER_WIDTH = 180;
const MONSTER_HEIGHT = 140; // ~2x hero height — blueprint's "1.5 to 2x taller than a hero"
const HERO_WIDTH = 50;
const HERO_HEIGHT = 70;
const HERO_COUNT = 4;

export function computePlaceholderLayout(regions: LayoutRegions): PlaceholderLayout {
  const monsterCenterX = (regions.boardWidthBand.left + regions.boardWidthBand.right) / 2;
  const monsterCenterY = regions.monster.top + regions.monster.height / 2;
  const monster: Rect = {
    x: monsterCenterX - MONSTER_WIDTH / 2,
    y: monsterCenterY - MONSTER_HEIGHT / 2,
    width: MONSTER_WIDTH,
    height: MONSTER_HEIGHT,
  };

  const heroCenterY = regions.hero.top + regions.hero.height / 2;
  const { left, width } = regions.boardWidthBand;
  const heroes: Rect[] = [];
  for (let i = 0; i < HERO_COUNT; i++) {
    const centerX = left + (width * (i + 0.5)) / HERO_COUNT;
    heroes.push({
      x: centerX - HERO_WIDTH / 2,
      y: heroCenterY - HERO_HEIGHT / 2,
      width: HERO_WIDTH,
      height: HERO_HEIGHT,
    });
  }

  return { monster, heroes };
}

const MIN_TILE_TOP_PADDING = 20; // min px of clearance above the tile bbox
const TABLE_REAR_OVERLAP = 8; // px the table rear edge rises into the hero band
const TABLE_BOTTOM_MARGIN = 8; // px from the safe-area bottom the table front edge ends

export function computeTableBounds(
  regions: LayoutRegions,
  tileBounds: { left: number; right: number; top: number; bottom: number },
): Rect {
  // The rear edge rises to whichever is HIGHER on screen: a minimum clearance
  // above the tiles, or just into the hero band — so the surface visually
  // connects the brigade to the board with no empty gap. Both the top and the
  // bottom are derived from the arguments (hero/safe-area bands), never a
  // canvas constant.
  const y = Math.min(
    tileBounds.top - MIN_TILE_TOP_PADDING,
    regions.hero.bottom - TABLE_REAR_OVERLAP,
  );
  return {
    x: regions.boardWidthBand.left,
    y,
    width: regions.boardWidthBand.width,
    height: regions.safeBottom.bottom - TABLE_BOTTOM_MARGIN - y,
  };
}
