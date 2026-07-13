// Pure responsive layout model. Phaser-free and DOM-free: it never touches
// `window`/`document`/`getComputedStyle` (all DOM measurement lives in the
// browserViewport adapter). It OWNS the policy and is the single source of
// truth for every responsive value; compositionLayout.ts holds no copy of any
// of them. It resolves the policy into a plain BoardGeometryInput and calls
// computeBoardGeometry — the only runtime edge, battleLayout -> boardGeometry —
// so boardGeometry imports no runtime symbol back (no cycle).
import { computeBoardGeometry, type BoardGeometry, type BoardGeometryInput } from './boardGeometry';
import {
  computeLayoutRegions,
  computePlaceholderLayout,
  computeTableBounds,
  computeTableSpan,
  computeBossHudLayout,
} from './compositionLayout';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Band {
  top: number;
  bottom: number;
  height: number;
}
export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportInput {
  width: number; // game units (== CSS px under RESIZE, scale 1)
  height: number;
  safeInsets: SafeInsets; // measured by browserViewport, already in game units
}

export interface BattleLayoutPolicy {
  // BattleLayoutPolicy is the SINGLE source of truth for every responsive value
  // below. compositionLayout.ts holds no copy of any of these — it receives them
  // (or already-resolved Rect/Band values) as parameters.
  maxGameplayColumnWidth: number; // 560 (initial; compare 520/560/600 in M6)
  legacyBoardWidthAt480: number; // 380 — the ONE canonical anchor for baseline tile width;
  //                                baseTileWidthFraction is DERIVED from it, never stored.
  maxTileWidthFraction: number; // 0.94 — upper cap when widening on narrow viewports (M6)
  narrowWidthThreshold: number; // 480 — at/below this safeRect width, widening is allowed (M6)
  boardHeightFraction: number; // fraction of the table span the board bbox may fill (single source)
  tableWidthFraction: number; // 0.88 — table/board band as a share of the column (single source)
  targetMinVisualRadius: number; // 16 — a policy TARGET, not a floor
  targetMinHitRadius: number; // 20
  maxBoardScale: number; // 1.4 — cap on upscale (desktop); baseline still binds at 1
  bands: {
    // vertical composition ranges (percent of safeRect height) — single source
    topHud: [number, number]; // [0, 8]
    monster: [number, number]; // [8, 34]
    hero: [number, number]; // [34, 46]
    board: [number, number]; // [46, 93]
    safeBottom: [number, number]; // [93, 100]
  };
}

export interface LayoutBands {
  topHud: Band;
  monster: Band;
  hero: Band;
  board: Band;
  safeBottom: Band;
}
export interface BossHudLayout {
  text: { x: number; y: number };
  bar: Rect;
}
export interface EnvironmentAnchors {
  viewport: Rect; // full viewport (background/env may span this)
  horizonY: number; // hero-band top, where the background zones meet
  archCenter: { x: number; y: number };
}

export interface BattleLayout {
  input: ViewportInput;
  safeRect: Rect;
  gameplayColumn: Rect;
  background: Rect; // full viewport
  bands: LayoutBands; // proportional to safeRect.height, offset by safeRect.y
  board: BoardGeometry;
  table: Rect;
  boss: Rect; // monster placeholder footprint
  heroes: Rect[];
  bossHud: BossHudLayout;
  environment: EnvironmentAnchors;
}

export const DEFAULT_BATTLE_LAYOUT_POLICY: BattleLayoutPolicy = {
  maxGameplayColumnWidth: 560,
  legacyBoardWidthAt480: 380, // baseTileWidthFraction is derived: 380/480 (see baseTileWidthFraction())
  maxTileWidthFraction: 0.94,
  narrowWidthThreshold: 480,
  boardHeightFraction: 0.85, // > 0.607 so horizontal binds at 480 -> scale 1
  tableWidthFraction: 0.88,
  targetMinVisualRadius: 16,
  targetMinHitRadius: 20,
  maxBoardScale: 1.4,
  bands: {
    topHud: [0, 8],
    monster: [8, 34],
    hero: [34, 46],
    board: [46, 93],
    safeBottom: [93, 100],
  },
};

// Structural constant describing the legacy baseline — NOT tunable policy.
export const LEGACY_VIEWPORT_WIDTH = 480;

// Minimum safeRect span kept per axis when the viewport allows it.
export const MIN_SAFE_DIMENSION = 1; // game units

// baseTileWidthFraction is DERIVED, so it can never drift from
// legacyBoardWidthAt480: === policy.legacyBoardWidthAt480 / LEGACY_VIEWPORT_WIDTH (380/480).
export function baseTileWidthFraction(policy: BattleLayoutPolicy): number {
  return policy.legacyBoardWidthAt480 / LEGACY_VIEWPORT_WIDTH;
}

// The ONLY place a column width becomes a tile-width fraction. M6 tunes just this
// resolver; M1 returns baseTileWidthFraction(policy) unconditionally.
export function resolveTileWidthFraction(_columnWidth: number, policy: BattleLayoutPolicy): number {
  return baseTileWidthFraction(policy);
}

// battleLayout owns the policy and resolves it into the plain, already-computed
// values that boardGeometry consumes — so boardGeometry imports NO runtime
// symbol from battleLayout.
export function resolveBoardGeometryInput(
  column: Rect,
  tableSpan: { top: number; bottom: number },
  policy: BattleLayoutPolicy,
): BoardGeometryInput {
  return {
    column,
    tableSpan,
    tileWidthFraction: resolveTileWidthFraction(column.width, policy),
    boardHeightFraction: policy.boardHeightFraction,
    targetMinVisualRadius: policy.targetMinVisualRadius,
    targetMinHitRadius: policy.targetMinHitRadius,
    maxBoardScale: policy.maxBoardScale,
  };
}

// --- pure inset helpers (used by BattleScene's thin adapter; DOM-free here) ---

// Non-finite / negative insets collapse to 0.
export function sanitizeInsets(raw: SafeInsets): SafeInsets {
  const clean = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
  return { top: clean(raw.top), right: clean(raw.right), bottom: clean(raw.bottom), left: clean(raw.left) };
}

// Convert CSS-px insets to game units. Under RESIZE (gameSize == canvasRect)
// this is the identity; the factor only matters when the canvas is presented at
// a different CSS size than the game measured. Guards a 0 / non-finite canvas.
export function cssInsetsToGame(
  css: SafeInsets,
  gameSize: { width: number; height: number },
  canvasRect: { width: number; height: number },
): SafeInsets {
  const factor = (game: number, canvas: number): number =>
    Number.isFinite(canvas) && canvas > 0 ? game / canvas : 1;
  const fx = factor(gameSize.width, canvasRect.width);
  const fy = factor(gameSize.height, canvasRect.height);
  return { top: css.top * fy, right: css.right * fx, bottom: css.bottom * fy, left: css.left * fx };
}

// Guarantees a non-negative safeRect: if left+right (or top+bottom) would leave
// < MIN_SAFE_DIMENSION on an axis, both insets on that axis are scaled down
// proportionally (deterministic). If a dimension is 0 / negative / non-finite,
// that axis's insets clamp to 0, so safeRect becomes the degenerate viewport
// itself — never negative, never NaN.
export function clampInsetsToViewport(insets: SafeInsets, width: number, height: number): SafeInsets {
  const clampAxis = (near: number, far: number, dim: number): [number, number] => {
    if (!Number.isFinite(dim) || dim <= 0) return [0, 0];
    const budget = dim - MIN_SAFE_DIMENSION;
    const sum = near + far;
    if (sum > budget && sum > 0) {
      const factor = budget / sum;
      return [near * factor, far * factor];
    }
    return [near, far];
  };
  const [top, bottom] = clampAxis(insets.top, insets.bottom, height);
  const [left, right] = clampAxis(insets.left, insets.right, width);
  return { top, right, bottom, left };
}

// --- the composition itself -------------------------------------------------

// compositionLayout works in LOCAL coordinates; computeBattleLayout is the SOLE
// place that lifts locals into global game coordinates — horizontally by
// gameplayColumn.x, vertically by safeRect.y. Every Rect / anchor returned in
// BattleLayout is therefore already global; BattleScene applies no further
// translation and adds no camera/Container offset.
export function computeBattleLayout(input: ViewportInput, policy: BattleLayoutPolicy): BattleLayout {
  const width = Math.max(0, input.width);
  const height = Math.max(0, input.height);
  const insets = clampInsetsToViewport(sanitizeInsets(input.safeInsets), width, height);

  const safeRect: Rect = {
    x: insets.left,
    y: insets.top,
    width: Math.max(0, width - insets.left - insets.right),
    height: Math.max(0, height - insets.top - insets.bottom),
  };

  const columnWidth = Math.min(safeRect.width, policy.maxGameplayColumnWidth);
  const gameplayColumn: Rect = {
    x: safeRect.x + (safeRect.width - columnWidth) / 2,
    y: safeRect.y,
    width: columnWidth,
    height: safeRect.height,
  };

  const hOff = gameplayColumn.x;
  const vOff = safeRect.y;
  const liftRect = (r: Rect): Rect => ({ x: r.x + hOff, y: r.y + vOff, width: r.width, height: r.height });
  const liftBand = (b: Band): Band => ({ top: b.top + vOff, bottom: b.bottom + vOff, height: b.height });

  // Composition in LOCAL space: horizontal extent = column width, vertical
  // extent = safeRect height. computeLayoutRegions gets the policy's band ranges
  // and tableWidthFraction so no composition value is duplicated here.
  const regionsLocal = computeLayoutRegions(gameplayColumn.width, safeRect.height, policy.bands, policy.tableWidthFraction);

  const bands: LayoutBands = {
    topHud: liftBand(regionsLocal.topHud),
    monster: liftBand(regionsLocal.monster),
    hero: liftBand(regionsLocal.hero),
    board: liftBand(regionsLocal.board),
    safeBottom: liftBand(regionsLocal.safeBottom),
  };

  // Board geometry works entirely in GLOBAL space (global column + global table
  // span), so board.tileBounds/origin are already global.
  const tableSpanLocal = computeTableSpan(regionsLocal);
  const tableSpanGlobal = { top: tableSpanLocal.top + vOff, bottom: tableSpanLocal.bottom + vOff };
  const board = computeBoardGeometry(resolveBoardGeometryInput(gameplayColumn, tableSpanGlobal, policy));

  // computeTableBounds encloses the tiles, so feed it the board bounds back in
  // LOCAL coords, then lift the result.
  const tileBoundsLocal = {
    left: board.tileBounds.x - hOff,
    right: board.tileBounds.x + board.tileBounds.width - hOff,
    top: board.tileBounds.y - vOff,
    bottom: board.tileBounds.y + board.tileBounds.height - vOff,
  };
  const table = liftRect(computeTableBounds(regionsLocal, tileBoundsLocal));

  const placeholders = computePlaceholderLayout(regionsLocal);
  const boss = liftRect(placeholders.monster);
  const heroes = placeholders.heroes.map(liftRect);

  const hudLocal = computeBossHudLayout(regionsLocal);
  const bossHud: BossHudLayout = {
    text: { x: hudLocal.text.x + hOff, y: hudLocal.text.y + vOff },
    bar: liftRect(hudLocal.bar),
  };

  const background: Rect = { x: 0, y: 0, width, height };
  const environment: EnvironmentAnchors = {
    viewport: background,
    horizonY: bands.hero.top, // matches drawBackground's regions.hero.top horizon
    archCenter: {
      x: gameplayColumn.x + gameplayColumn.width / 2,
      y: bands.monster.top + bands.monster.height / 2,
    },
  };

  return {
    input,
    safeRect,
    gameplayColumn,
    background,
    bands,
    board,
    table,
    boss,
    heroes,
    bossHud,
    environment,
  };
}
