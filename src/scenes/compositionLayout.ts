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

// Vertical composition band ranges as [fromPct, toPct] pairs. Supplied by the
// caller (battleLayout, from BattleLayoutPolicy) so this module holds no copy of
// any responsive value — BattleLayoutPolicy is the single source of truth.
export interface BandRanges {
  topHud: [number, number];
  monster: [number, number];
  hero: [number, number];
  board: [number, number];
  safeBottom: [number, number];
}

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
  bands: BandRanges,
  tableWidthFraction: number,
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
// px kept between the boss footprint's bottom edge and the hero row's top
// edge (2026-07-18 Lot 2 review fix). Heroes were previously grounded on the
// hero/table composition bands, which grow proportionally taller than the
// FIXED-pixel boss/hero placeholder shapes as viewport height increases — the
// boss stayed roughly centered in an increasingly tall monster band while the
// heroes stayed pinned to the (also growing) bottom of the hero band, so the
// visual gap between them widened from ~12px at 360x640 to over 100px at
// 768x1024. Anchoring the hero row directly to the boss's own rect keeps that
// gap constant across every viewport instead.
const BOSS_HERO_GAP = 12;
// Legacy grounding constant, now used only as a safety ceiling (see below) —
// the fixed-pixel boss+gap+hero footprint (140 + 12 + 70 = 222px) can exceed
// the ENTIRE available height on an extreme short/landscape viewport, where
// the compressed composition bands would otherwise leave more headroom.
const HERO_TABLE_OVERLAP = 8;

export function computePlaceholderLayout(regions: LayoutRegions): PlaceholderLayout {
  const monsterCenterX = (regions.boardWidthBand.left + regions.boardWidthBand.right) / 2;
  const monsterCenterY = regions.monster.top + regions.monster.height / 2;
  const monster: Rect = {
    x: monsterCenterX - MONSTER_WIDTH / 2,
    y: monsterCenterY - MONSTER_HEIGHT / 2,
    width: MONSTER_WIDTH,
    height: MONSTER_HEIGHT,
  };

  // Heroes are anchored to the boss's own footprint (not to the hero/table
  // composition bands) so the boss/hero visual relationship stays constant
  // across viewports — see BOSS_HERO_GAP above. But never LOWER (larger y)
  // than the legacy band-grounded position: on an extreme short/landscape
  // viewport the compressed hero/board bands still guarantee enough room for
  // the board below the heroes, while the fixed-pixel boss anchor alone does
  // not — so the smaller (higher-up) of the two always wins. At every
  // reference format (360x640/480x720/768x1024) the boss anchor is already
  // the smaller value, so this ceiling is a no-op there.
  const heroYFromBoss = monster.y + monster.height + BOSS_HERO_GAP;
  const heroYFromBands = computeTableSpan(regions).top + HERO_TABLE_OVERLAP - HERO_HEIGHT;
  const heroY = Math.min(heroYFromBoss, heroYFromBands);
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
