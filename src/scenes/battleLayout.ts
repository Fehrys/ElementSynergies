// Pure responsive layout model. Phaser-free and DOM-free: it never touches
// `window`/`document`/`getComputedStyle` (all DOM measurement lives in the
// browserViewport adapter). It OWNS the policy and is the single source of
// truth for every responsive value; compositionLayout.ts holds no copy of any
// of them. It resolves the policy into a plain BoardGeometryInput and calls
// computeBoardGeometry — the only runtime edge, battleLayout -> boardGeometry —
// so boardGeometry imports no runtime symbol back (no cycle).
import { computeBoardGeometry, computeResponsiveBoardGeometry, type BoardGeometry, type BoardGeometryInput } from './boardGeometry';
import { computeAvailableBoardRect, computeBoardFrameBounds } from './boardArea';
import {
  computeLayoutRegions,
  computePlaceholderLayout,
  computeTableSpan,
  computeBossHudLayout,
} from './compositionLayout';
import type { BandRanges } from './compositionLayout';

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
  minimumTablePadding: number; // min game-units gap between the tile bbox and the table edge, each side
  targetMinVisualRadius: number; // 16 — a policy TARGET, not a floor
  targetMinHitRadius: number; // 20
  maxBoardScale: number; // 1.4 — cap on upscale (desktop); baseline still binds at 1
  // Where the board sits inside its vertical tableSpan: 0 = span's top, 0.5 = centered
  // (pre-2026-07-14 behavior), 1 = span's bottom. Applied strictly after scale
  // selection — see boardGeometry.computeBoardGeometry.
  boardVerticalBias: number; // 0.62 — nudges the board down inside its span
  // Game units (480-reference frame, scaled like everything else) shaved off the
  // column pitch (colWidth) after scale selection — tile size/hitRadius untouched.
  columnSpacingReduction: number; // 3
  // Game units (480-reference frame, scaled like columnSpacingReduction) the tile
  // grid is nudged UP after boardVerticalBias. Fine-tuning only — never affects
  // scale selection/tile size.
  boardVerticalOffset: number; // 0
  // Fraction of safeRect.height where the combat/prep visual separation sits
  // (the `table` rect's top edge — also the exact seam between
  // battleBackgroundUpper and battleBackgroundLower). ABSOLUTE RULE (product
  // decision, 2026-07-19): this ratio must be IDENTICAL at every viewport
  // size — safe-area insets aside — so the upper/lower background split never
  // looks proportionally different between a phone and a tablet. It is a pure
  // fraction of safeRect.height, entirely independent of bands.hero.bottom
  // (which shifts under vertical-degradation compression on short viewports)
  // and of any fixed-pixel gap — either of those would make the ratio drift
  // with viewport size, which is exactly the bug this constant fixes.
  // Recalibrated 2026-07-19 (review fix): 0.5486 gave the upper combat scene
  // too much of the screen and compressed the prep band; 0.51 gives the lower
  // background/cutting board meaningfully more height while still leaving
  // comfortable room for the HUD/boss/heroes above it.
  tableYFraction: number; // 0.51
  bands: {
    // vertical composition ranges (percent of safeRect height) — single source
    topHud: [number, number]; // [4, 12]
    monster: [number, number]; // [12, 38]
    hero: [number, number]; // [38, 50]
    board: [number, number]; // [50, 93]
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
  table: Rect; // == lowerBand: {x:0, y:table.y, width:viewport.width, height:viewport.height-table.y}
  availableBoardRect: Rect; // lowerBand inset by the responsive margin (see boardArea.ts)
  boardFrame: Rect; // tileBounds + a modest padding, clamped inside lowerBand
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
  minimumTablePadding: 8, // narrow viewports: keep >= 8 game units of table around the tiles each side
  targetMinVisualRadius: 16,
  targetMinHitRadius: 20,
  maxBoardScale: 1.4,
  // Recalibrated 2026-07-18 (Lot 2 review fix) against the real
  // battleBackgroundLower art integrated in Lot 2: the previous 0.58/14 pair
  // (tuned for the pre-Lot-1 placeholder) left the tile grid sitting close to
  // the top of the cutting board across all three reference formats, with a
  // visibly larger margin below than above. 0.62/0 lowers the grid so the
  // margins read as roughly balanced at 360x640/480x720/768x1024 — see
  // docs/superpowers/specs/2026-07-18-battle-environment-runtime-integration-design.md.
  boardVerticalBias: 0.62,
  columnSpacingReduction: 3,
  boardVerticalOffset: 0,
  tableYFraction: 0.51,
  bands: {
    // 2026-07-14: shifted +4pts vs. the original [0,8]/[8,34]/[34,46]/[46,93] baseline
    // to align the composition with design/references/combat-background-target.png —
    // see docs/superpowers/specs/2026-07-14-align-layout-to-combat-background-design.md.
    topHud: [4, 12],
    monster: [12, 38],
    hero: [38, 50],
    board: [50, 93],
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

// Width (game units) at/below which the widening saturates at maxTileWidthFraction.
// Structural constant tied to the smallest supported viewport (see the decisions
// doc), NOT tunable per-run policy.
const MAX_FRACTION_AT_WIDTH = 320;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// The ONLY place a column width becomes a tile-width fraction. Horizontal width
// policy (audit order): at/above narrowWidthThreshold the puzzle keeps its exact
// 480 baseline share; below it the share grows linearly toward maxTileWidthFraction
// as width shrinks, reaching it at MAX_FRACTION_AT_WIDTH. Because the fraction stays
// < 1 and the scaled bbox is centered in the column (⊆ safeRect), tileBounds can
// never overflow the safeRect — the widening is overflow-safe by construction.
export function resolveTileWidthFraction(columnWidth: number, policy: BattleLayoutPolicy): number {
  const base = baseTileWidthFraction(policy);
  if (columnWidth >= policy.narrowWidthThreshold) return base; // 480+ → exact baseline
  const t = clamp01(
    (policy.narrowWidthThreshold - columnWidth) / (policy.narrowWidthThreshold - MAX_FRACTION_AT_WIDTH),
  );
  return base + (policy.maxTileWidthFraction - base) * t;
}

// Structural verticals tied to the 480x720 baseline (NOT tunable policy): at/above
// the reference safeRect height the bands are the exact baseline proportions (so
// 480x720 stays pixel-neutral); at/below the floor the compression saturates.
const VERTICAL_REFERENCE_HEIGHT = 720;
const VERTICAL_COMPRESSION_FLOOR = 480;
// Percentage points the chrome bands cede to the board at full compression.
const MAX_TOPHUD_COMPRESSION = 3; // topHud 8 → 5
const MAX_HERO_COMPRESSION = 4; //  hero  12 → 8  (board gains 7 → 54)

// Vertical degradation order (audit): when vertical space is scarce, the chrome
// bands (topHud, hero) give up height to the board — the board is reduced LAST.
// Derived from policy.bands (single source) apart from the compression amounts.
// At/above the reference height (incl. 480x720) the exact baseline ranges are
// returned unchanged, so the baseline composition never moves.
export function resolveBandRanges(policy: BattleLayoutPolicy, safeHeight: number): BandRanges {
  const t = clamp01(
    (VERTICAL_REFERENCE_HEIGHT - safeHeight) / (VERTICAL_REFERENCE_HEIGHT - VERTICAL_COMPRESSION_FLOOR),
  );
  if (t === 0) return policy.bands;
  const dTop = MAX_TOPHUD_COMPRESSION * t;
  const dHero = MAX_HERO_COMPRESSION * t;
  const monsterHeight = policy.bands.monster[1] - policy.bands.monster[0];
  const heroHeight = policy.bands.hero[1] - policy.bands.hero[0];
  const [topHudTop, topHudNominalBottom] = policy.bands.topHud;
  const [safeTop, safeBottom] = policy.bands.safeBottom;
  const topHudBottom = topHudNominalBottom - dTop;
  const monsterBottom = topHudBottom + monsterHeight;
  const heroBottom = monsterBottom + (heroHeight - dHero);
  return {
    topHud: [topHudTop, topHudBottom],
    monster: [topHudBottom, monsterBottom],
    hero: [monsterBottom, heroBottom],
    board: [heroBottom, safeTop], // board grows upward: chrome ceded height, board reduced last
    safeBottom: [safeTop, safeBottom],
  };
}

// battleLayout owns the policy and resolves it into the plain, already-computed
// values that boardGeometry consumes — so boardGeometry imports NO runtime
// symbol from battleLayout.
export function resolveBoardGeometryInput(
  column: Rect,
  tableSpan: { top: number; bottom: number },
  heroBottom: number,
  policy: BattleLayoutPolicy,
): BoardGeometryInput {
  return {
    column,
    tableSpan,
    heroBottom,
    tileWidthFraction: resolveTileWidthFraction(column.width, policy),
    boardHeightFraction: policy.boardHeightFraction,
    targetMinVisualRadius: policy.targetMinVisualRadius,
    targetMinHitRadius: policy.targetMinHitRadius,
    maxBoardScale: policy.maxBoardScale,
    boardVerticalBias: policy.boardVerticalBias,
    columnSpacingReduction: policy.columnSpacingReduction,
    boardVerticalOffset: policy.boardVerticalOffset,
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

  // `table.y` (the combat/prep visual separation, also the exact seam between
  // battleBackgroundUpper and battleBackgroundLower) is computed FIRST and
  // GLOBALLY: a fixed fraction of safeRect.height, independent of every band/
  // board/placeholder computation below — see policy.tableYFraction's doc
  // comment (absolute rule, 2026-07-19). Computing it this early lets the
  // combat-group placement below use the real table.y directly instead of a
  // band-boundary proxy.
  const tableY = safeRect.y + policy.tableYFraction * safeRect.height;
  const table: Rect = {
    x: 0,
    y: tableY,
    width,
    height: height - tableY,
  };

  // Composition in LOCAL space: horizontal extent = column width, vertical
  // extent = safeRect height. Band ranges come from the vertical-degradation
  // resolver (baseline-neutral at/above the reference height).
  const bandRanges = resolveBandRanges(policy, safeRect.height);

  // The vertical bands and the table span are independent of the table WIDTH
  // fraction, so size the board from a provisional regions first; then derive the
  // table width from the actual board so the table always encloses the puzzle with
  // at least minimumTablePadding on each side (while never exceeding the column).
  const provisionalRegions = computeLayoutRegions(
    gameplayColumn.width,
    safeRect.height,
    bandRanges,
    policy.tableWidthFraction,
  );
  const tableSpanLocal = computeTableSpan(provisionalRegions);
  const tableSpanGlobal = { top: tableSpanLocal.top + vOff, bottom: tableSpanLocal.bottom + vOff };
  // The board's upward nudge must never rise above the heroes' ACTUAL feet
  // (2026-07-18 Lot 2 review fix): heroes are now boss-anchored (see
  // compositionLayout.ts's BOSS_HERO_GAP), not grounded on the hero band's
  // boundary, so that abstract band boundary can no longer stand in for their
  // real position — on a heavily compressed viewport the two can diverge.
  // Uses combatScale 1 (baseline, unscaled) here deliberately: the REAL
  // combat-group scale is resolved from `board` below (circular — board isn't
  // known yet), and this provisional value only matters as a floor-clamp
  // input on extreme-compression viewports, where the real scale floors to 1
  // anyway. Safe to compute from provisionalRegions (not the board-width-
  // refined regionsLocal below): hero verticals depend only on the monster/
  // hero bands, never on tableWidthFraction — see computeLayoutRegions. All
  // four heroes share the same y, so [0] is the real grounding line.
  const provisionalHero = computePlaceholderLayout(provisionalRegions, 1, tableY).heroes[0];
  const heroBottomGlobal = provisionalHero.y + provisionalHero.height + vOff;
  // Board geometry works entirely in GLOBAL space (global column + global table
  // span), so board.tileBounds/origin are already global.
  // RENAMED (Lot 2): this is now `legacyBoard` — kept alive solely to derive
  // combatScale/minBoardWidthBand below so the boss/hero footprint and the
  // hero-centering band stay byte-identical to before the refactor. It is
  // NEVER exposed as the public `board` anymore (see availableBoardRect below).
  const legacyBoard = computeBoardGeometry(
    resolveBoardGeometryInput(gameplayColumn, tableSpanGlobal, heroBottomGlobal, policy),
  );

  // boardWidthBand (drives heroes/monster centering below) encloses the board bbox +
  // a minimum padding each side. Below the policy fraction (wide/desktop) the 0.88
  // baseline dominates (neutral at 480, where the padding requirement is already
  // satisfied); on narrow viewports the padding requirement dominates but is capped
  // at the full column width. Independent of the `table` composition rect below.
  const minBoardWidthBand = legacyBoard.tileBounds.width + 2 * policy.minimumTablePadding;
  const paddedFraction =
    gameplayColumn.width > 0 ? minBoardWidthBand / gameplayColumn.width : policy.tableWidthFraction;
  const tableWidthFraction = Math.min(1, Math.max(policy.tableWidthFraction, paddedFraction));
  const regionsLocal = computeLayoutRegions(gameplayColumn.width, safeRect.height, bandRanges, tableWidthFraction);

  const bands: LayoutBands = {
    topHud: liftBand(regionsLocal.topHud),
    monster: liftBand(regionsLocal.monster),
    hero: liftBand(regionsLocal.hero),
    board: liftBand(regionsLocal.board),
    safeBottom: liftBand(regionsLocal.safeBottom),
  };

  // combatScale (2026-07-19 review fix) reuses the board's own isotropic
  // scale — "the responsive scale the composition already uses", derived from
  // both the gameplay column's width and the table span's height, already
  // bounded by policy.maxBoardScale — floored at 1 so the boss/heroes never
  // shrink below their long-standing baseline footprint on narrow/short
  // viewports, only ever growing on larger ones. board.rowHeight / 48
  // recovers the scale (48 = boardGeometry.ts's unscaled ROW_HEIGHT, the same
  // recovery already used in tests, e.g. battleLayout.test.ts).
  const combatScale = Math.min(policy.maxBoardScale, Math.max(1, legacyBoard.rowHeight / 48));
  const placeholders = computePlaceholderLayout(regionsLocal, combatScale, tableY);
  const boss = liftRect(placeholders.monster);
  const heroes = placeholders.heroes.map(liftRect);

  const hudLocal = computeBossHudLayout(regionsLocal, combatScale, tableY);
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

  // The REAL rendered/hit-tested board (Lot 2): fit to the puzzle's own
  // available space inside the lower band (== `table`), completely
  // independent of gameplayColumn/legacyBoard. See
  // docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md.
  const availableBoardRect = computeAvailableBoardRect(table, insets);
  const board = computeResponsiveBoardGeometry(availableBoardRect, policy.targetMinHitRadius);
  const boardFrame = computeBoardFrameBounds(board.tileBounds, table);

  return {
    input,
    safeRect,
    gameplayColumn,
    background,
    bands,
    board,
    table,
    availableBoardRect,
    boardFrame,
    boss,
    heroes,
    bossHud,
    environment,
  };
}
