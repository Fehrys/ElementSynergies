// Pure board geometry. Phaser-free and DOM-free by the same convention as the
// legacy boardLayout.ts (the Playwright specs import it in a plain Node context
// to compute click coordinates). It takes a FULLY-RESOLVED BoardGeometryInput —
// battleLayout has already turned the policy into plain numbers — so this module
// imports NO runtime symbol from battleLayout and the single runtime edge stays
// battleLayout.ts -> boardGeometry.ts. No 480/380 magic lives here.
import type { CellCoord } from '../core/grid';
import type { Rect } from './battleLayout';

// The legacy base tile metrics (from today's boardLayout.ts). These are the
// UNSCALED honeycomb constants; every rendered dimension is one of them times
// the single isotropic `scale` computed below.
const COL_WIDTH = 56;
const ROW_HEIGHT = 48;
const STONE_RADIUS = 22;

// Grid bounding box at scale 1 (COLS=7, tallest column 5 rows): 380px wide,
// 236px tall including radius padding.
const BBOX_WIDTH = 6 * COL_WIDTH + 2 * STONE_RADIUS; // 380
const BBOX_HEIGHT = 4 * ROW_HEIGHT + 2 * STONE_RADIUS; // 236

// Smallest gap between two admissible hit points, so a real tie point can never
// be within hitRadius of two cells at once.
const EPSILON = 1e-6;

export interface BoardGeometry {
  originX: number;
  originY: number;
  colWidth: number;
  rowHeight: number;
  visualRadius: number; // drawing only — ALWAYS STONE_RADIUS * scale (never floored independently)
  hitRadius: number; // pointer acquisition only (separate; may exceed visualRadius, capped)
  tileBounds: Rect;
  // Optional diagnostics (never fed back into geometry; useful for tests + M6 tuning):
  horizontalFitScale?: number; // targetTileWidth / BBOX_WIDTH
  verticalFitScale?: number; // (tableSpanHeight * boardHeightFraction) / BBOX_HEIGHT
  targetVisualRadiusSatisfied?: boolean; // visualRadius >= input.targetMinVisualRadius
}

// Fully-resolved input — battleLayout has already turned the policy into plain
// numbers, so boardGeometry never sees the policy.
export interface BoardGeometryInput {
  column: Rect;
  tableSpan: { top: number; bottom: number };
  tileWidthFraction: number; // resolved by battleLayout.resolveTileWidthFraction (M6 tunes it there)
  boardHeightFraction: number;
  targetMinVisualRadius: number;
  targetMinHitRadius: number;
  maxBoardScale: number;
  // 0 = hugs the top of tableSpan, 0.5 = centered (the historical behavior), 1 = hugs
  // the bottom. Applied AFTER scale selection — never influences horizontalFit/
  // verticalFit/scale, only where the already-sized bbox sits inside its span.
  boardVerticalBias: number;
  // Game units (480-reference frame) shaved off colWidth AFTER scale selection, then
  // scaled by the same isotropic `scale` as everything else. Purely tightens the
  // honeycomb's horizontal pitch — rowHeight/visualRadius/hitRadius (and therefore tile
  // size and the scale-selection math itself) are never touched by this value.
  columnSpacingReduction: number;
}

// Derives the single isotropic scale that fits the honeycomb inside the column
// (horizontally) and the table span (vertically), reproducing today's 480
// baseline exactly. visualRadius is ONLY EVER STONE_RADIUS * scale — never
// floored or grown independently — so it can never break isotropy or push the
// scaled bbox past the horizontal fit.
export function computeBoardGeometry(input: BoardGeometryInput): BoardGeometry {
  const targetTileWidth = input.column.width * input.tileWidthFraction;
  const horizontalFit = targetTileWidth / BBOX_WIDTH;
  const tableSpanHeight = input.tableSpan.bottom - input.tableSpan.top;
  const verticalFit = (tableSpanHeight * input.boardHeightFraction) / BBOX_HEIGHT;
  const scale = Math.min(horizontalFit, verticalFit, input.maxBoardScale); // never anisotropic

  // Column pitch is tightened AFTER scale selection, so it never feeds back into
  // horizontalFit/verticalFit/scale — rowHeight and visualRadius stay exactly the
  // isotropic scale, only the horizontal step between columns shrinks.
  const colWidth = COL_WIDTH * scale - input.columnSpacingReduction * scale;
  const rowHeight = ROW_HEIGHT * scale;
  const visualRadius = STONE_RADIUS * scale; // SAME isotropic factor — NEVER floored independently
  const scaledBboxW = 6 * colWidth + 2 * visualRadius;
  const scaledBboxH = 4 * rowHeight + 2 * visualRadius;

  const originX = Math.round(input.column.x + (input.column.width - scaledBboxW) / 2 + visualRadius);
  const originY = Math.round(
    input.tableSpan.top + (tableSpanHeight - scaledBboxH) * input.boardVerticalBias + visualRadius,
  );

  const minCenterDistance = rowHeight; // proven min for this honeycomb (vertical same-column)
  const maximumHitRadius = minCenterDistance / 2 - EPSILON;
  const hitRadius = Math.min(maximumHitRadius, Math.max(visualRadius, input.targetMinHitRadius));

  const tileBounds: Rect = {
    x: originX - visualRadius,
    y: originY - visualRadius,
    width: scaledBboxW,
    height: scaledBboxH,
  };

  return {
    originX,
    originY,
    colWidth,
    rowHeight,
    visualRadius,
    hitRadius,
    tileBounds,
    horizontalFitScale: horizontalFit,
    verticalFitScale: verticalFit,
    targetVisualRadiusSatisfied: visualRadius >= input.targetMinVisualRadius,
  };
}

// Converts a logical (row, col) cell into the ABSOLUTE stage-space position of
// its center. Columns render as straight vertical lines (x depends only on col);
// alternating (odd) columns shift down by half a cell so they interlock into a
// honeycomb. Mirrors the legacy boardLayout.ts:42-48.
export function cellToPixel(geometry: BoardGeometry, row: number, col: number): { x: number; y: number } {
  const shift = col % 2 === 1 ? geometry.rowHeight / 2 : 0;
  return {
    x: geometry.originX + col * geometry.colWidth,
    y: geometry.originY + row * geometry.rowHeight + shift,
  };
}

// Nearest admissible cell center within hitRadius, else null. Tie-break (locked,
// order-independent): among cells with distance <= hitRadius, pick strictly the
// smallest distance; on a tie within EPSILON, pick the smaller col, then smaller
// row. Never depends on the iteration order of `cells`.
export function cellAtPixel(
  point: { x: number; y: number },
  cells: readonly CellCoord[],
  geometry: BoardGeometry,
): CellCoord | null {
  let best: CellCoord | null = null;
  let bestDist = Infinity;
  for (const cell of cells) {
    const p = cellToPixel(geometry, cell.row, cell.col);
    const dist = Math.hypot(p.x - point.x, p.y - point.y);
    if (dist > geometry.hitRadius) continue;
    if (best === null) {
      best = cell;
      bestDist = dist;
      continue;
    }
    if (Math.abs(dist - bestDist) <= EPSILON) {
      // Genuine tie: deterministic, order-independent choice.
      if (cell.col < best.col || (cell.col === best.col && cell.row < best.row)) {
        best = cell;
        bestDist = Math.min(bestDist, dist);
      }
    } else if (dist < bestDist) {
      best = cell;
      bestDist = dist;
    }
  }
  return best;
}
