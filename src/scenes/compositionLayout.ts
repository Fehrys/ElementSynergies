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

// Vertical composition band ranges as [fromPct, toPct] pairs. Kept as a
// parameter (below) so battleLayout can supply the policy's ranges; these
// defaults reproduce today's fixed composition. TEMPORARY second copy — removed
// in M2 once BattleScene reads its layout through battleLayout instead of
// calling here directly, leaving BattleLayoutPolicy the sole source.
export interface BandRanges {
  topHud: [number, number];
  monster: [number, number];
  hero: [number, number];
  board: [number, number];
  safeBottom: [number, number];
}

const DEFAULT_BAND_RANGES: BandRanges = {
  topHud: [0, 8],
  monster: [8, 34],
  hero: [34, 46],
  board: [46, 93],
  safeBottom: [93, 100],
};

// Blueprint: "the board should normally use at least 88% of the safe width."
const DEFAULT_TABLE_WIDTH_FRACTION = 0.88;

export interface PlaceholderLayout {
  monster: Rect;
  heroes: Rect[];
}

export interface BossHudLayout {
  text: { x: number; y: number };
  bar: Rect;
}

export function computeLayoutRegions(
  width: number,
  height: number,
  bands: BandRanges = DEFAULT_BAND_RANGES,
  tableWidthFraction: number = DEFAULT_TABLE_WIDTH_FRACTION,
): LayoutRegions {
  const band = (fromPct: number, toPct: number): Band => {
    const top = height * (fromPct / 100);
    const bottom = height * (toPct / 100);
    return { top, bottom, height: bottom - top };
  };

  const boardWidth = width * tableWidthFraction;
  const left = (width - boardWidth) / 2;

  return {
    topHud: band(bands.topHud[0], bands.topHud[1]),
    monster: band(bands.monster[0], bands.monster[1]),
    hero: band(bands.hero[0], bands.hero[1]),
    board: band(bands.board[0], bands.board[1]),
    safeBottom: band(bands.safeBottom[0], bands.safeBottom[1]),
    boardWidthBand: { left, right: left + boardWidth, width: boardWidth },
  };
}

const MONSTER_WIDTH = 180;
const MONSTER_HEIGHT = 140; // ~2x hero height — blueprint's "1.5 to 2x taller than a hero"
const HERO_WIDTH = 50;
const HERO_HEIGHT = 70;
const HERO_COUNT = 4;
const HERO_TABLE_OVERLAP = 8; // px each hero's lower edge sinks behind the table rear edge

export function computePlaceholderLayout(regions: LayoutRegions): PlaceholderLayout {
  const monsterCenterX = (regions.boardWidthBand.left + regions.boardWidthBand.right) / 2;
  const monsterCenterY = regions.monster.top + regions.monster.height / 2;
  const monster: Rect = {
    x: monsterCenterX - MONSTER_WIDTH / 2,
    y: monsterCenterY - MONSTER_HEIGHT / 2,
    width: MONSTER_WIDTH,
    height: MONSTER_HEIGHT,
  };

  // Ground the brigade: each hero's lower edge sinks HERO_TABLE_OVERLAP px past
  // the table's rear edge. Because the table is drawn at a higher depth, its lip
  // masks those bottom pixels, so the heroes read as standing behind the
  // preparation surface rather than floating above it. Placement is derived
  // from the table span, never a hard-coded y inside the scene.
  const heroBottom = computeTableSpan(regions).top + HERO_TABLE_OVERLAP;
  const heroY = heroBottom - HERO_HEIGHT;
  const { left, width } = regions.boardWidthBand;
  const heroes: Rect[] = [];
  for (let i = 0; i < HERO_COUNT; i++) {
    const centerX = left + (width * (i + 0.5)) / HERO_COUNT;
    heroes.push({
      x: centerX - HERO_WIDTH / 2,
      y: heroY,
      width: HERO_WIDTH,
      height: HERO_HEIGHT,
    });
  }

  return { monster, heroes };
}

const MIN_TILE_TOP_PADDING = 20; // min px of clearance above the tile bbox
const TABLE_REAR_OVERLAP = 8; // px the table rear edge rises into the hero band
const TABLE_BOTTOM_MARGIN = 8; // px from the safe-area bottom the table front edge ends

// The table's connecting vertical span, derived from the composition bands
// alone (rear edge rises into the hero band; front edge sits above the safe
// bottom). Kept separate from computeTableBounds — which grows the surface to
// enclose the tiles — so boardLayout can center the tiles inside this span
// without a circular tileBounds dependency, and computePlaceholderLayout can
// ground the heroes on the same rear edge.
export function computeTableSpan(regions: LayoutRegions): { top: number; bottom: number } {
  return {
    top: regions.hero.bottom - TABLE_REAR_OVERLAP,
    bottom: regions.safeBottom.bottom - TABLE_BOTTOM_MARGIN,
  };
}

export function computeTableBounds(
  regions: LayoutRegions,
  tileBounds: { left: number; right: number; top: number; bottom: number },
): Rect {
  const span = computeTableSpan(regions);
  // The rear edge rises to whichever is HIGHER on screen: a minimum clearance
  // above the tiles, or just into the hero band — so the surface visually
  // connects the brigade to the board with no empty gap. Both the top and the
  // bottom are derived from the composition bands, never a canvas constant.
  const y = Math.min(tileBounds.top - MIN_TILE_TOP_PADDING, span.top);
  return {
    x: regions.boardWidthBand.left,
    y,
    width: regions.boardWidthBand.width,
    height: span.bottom - y,
  };
}

const BOSS_BAR_WIDTH_PADDING = 60; // bar extends this far beyond the monster footprint total
const BOSS_BAR_HEIGHT = 12;
const BOSS_TEXT_TOP_MARGIN = 8; // px below the topHud band's top edge
const BOSS_BAR_TOP_MARGIN = 36; // px below the topHud band's top edge

// Temporary boss-HP presentation, centered horizontally above the monster and
// kept inside the topHud band. The bar width is derived from the monster
// footprint (monster.width + padding) rather than a fixed pixel width, and the
// text is centered on the same axis — so the HUD no longer pulls the upper
// composition to the left. Placeholder footprint only (no final HUD art).
export function computeBossHudLayout(regions: LayoutRegions): BossHudLayout {
  const { monster } = computePlaceholderLayout(regions);
  const centerX = monster.x + monster.width / 2;
  const barWidth = monster.width + BOSS_BAR_WIDTH_PADDING;
  return {
    text: { x: centerX, y: regions.topHud.top + BOSS_TEXT_TOP_MARGIN },
    bar: {
      x: centerX - barWidth / 2,
      y: regions.topHud.top + BOSS_BAR_TOP_MARGIN,
      width: barWidth,
      height: BOSS_BAR_HEIGHT,
    },
  };
}
