import { CellCoord, HexGrid, ElementColor } from './grid';

// One scored segment of a validated chain. Normally there's exactly one
// SubChain per drag; a portal splits a drag into two (one per color).
export interface SubChain {
  color: ElementColor;
  stoneCells: CellCoord[]; // colored stones that deal damage (count = stoneCells.length)
  specialTileCells: CellCoord[]; // colorless tiles riding along; cleared, but queued for wave 2
}

export interface ChainValidationResult {
  valid: boolean;
  subChains: SubChain[];
  // The portal cell itself (0 or 1 entries) — shared by both sub-chains
  // when present, so it's tracked separately rather than inside either one.
  portalCells: CellCoord[];
  reason?: string;
}

const MIN_CHAIN_LENGTH = 3;

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.row === b.row && a.col === b.col;
}

function isAdjacent(grid: HexGrid, a: CellCoord, b: CellCoord): boolean {
  return grid.getNeighbors(a.row, a.col).some((n) => sameCell(n, b));
}

// Small helper so every rejection path returns the same shape without
// repeating `{ valid: false, subChains: [], portalCells: [] }` everywhere.
function invalid(reason: string): ChainValidationResult {
  return { valid: false, subChains: [], portalCells: [], reason };
}

// Validates a full dragged path and, if valid, splits it into scored
// sub-chains. Called once per completed drag (resolution.ts's wave 1);
// the caller is expected to already have stopped extending the path at
// the last legal cell, so any invalid path here fails the whole chain
// rather than being silently trimmed.
export function validateChain(grid: HexGrid, path: CellCoord[]): ChainValidationResult {
  if (path.length === 0) return invalid('empty path');

  // Rule: no revisiting/crossing a cell already in this drag.
  const seen = new Set<string>();
  for (const cell of path) {
    const key = `${cell.row},${cell.col}`;
    if (seen.has(key)) return invalid('path revisits a cell');
    seen.add(key);
  }

  // Rule: every consecutive pair of cells must be hex-adjacent.
  for (let i = 1; i < path.length; i++) {
    if (!isAdjacent(grid, path[i - 1], path[i])) return invalid('path is not contiguous');
  }

  // Walk the whole path from the start, deciding the active color from
  // whichever stone comes first. A chain may start on a stone (color
  // decided immediately) or on an uncolored tile — a special tile or a
  // portal — in which case the color stays undetermined until the first
  // stone is reached, same rule either way.
  const segments: { color: ElementColor; start: number; end: number }[] = [];
  let activeColor: ElementColor | null = null;
  let segmentStart = 0;
  let portalIndex = -1;
  // True only when the path's single portal led the chain (no color had
  // been decided yet when it was reached) — in that case it's a colorless
  // passthrough like a special tile, not a bridge, and counts toward the
  // segment's minimum length. A portal that bridges an already-decided
  // color into a new one stays excluded from both sides' counts, as today.
  let portalCountsTowardLength = false;

  for (let i = 0; i < path.length; i++) {
    const content = grid.get(path[i].row, path[i].col);
    if (content.type === 'stone') {
      if (activeColor === null) {
        activeColor = content.color;
      } else if (content.color !== activeColor) {
        return invalid(`color mismatch at index ${i}`);
      }
    } else if (content.type === 'special') {
      continue;
    } else if (content.type === 'portal') {
      if (portalIndex !== -1) return invalid('path uses more than one portal');
      const next = path[i + 1];
      if (!next) return invalid('portal cannot be the last cell');
      const nextContent = grid.get(next.row, next.col);
      if (nextContent.type !== 'stone') return invalid('cell after portal must be a stone');
      portalIndex = i;
      if (activeColor === null) {
        portalCountsTowardLength = true;
      } else {
        segments.push({ color: activeColor, start: segmentStart, end: i });
        segmentStart = i;
      }
      activeColor = nextContent.color;
    } else {
      return invalid(`path touches empty cell at index ${i}`);
    }
  }

  if (activeColor === null) return invalid('chain contains no colored stone');

  segments.push({ color: activeColor, start: segmentStart, end: path.length - 1 });

  // Build a SubChain per segment, but only keep segments that reach the
  // minimum length — a portal side that falls short simply contributes
  // no sub-chain (design decision: it doesn't invalidate the other side).
  // Special tiles (and a leading, non-bridging portal) count toward the
  // minimum alongside stones; a bridging portal does not.
  const subChains: SubChain[] = [];
  for (const segment of segments) {
    const stoneCells: CellCoord[] = [];
    const specialTileCells: CellCoord[] = [];
    for (let i = segment.start; i <= segment.end; i++) {
      const content = grid.get(path[i].row, path[i].col);
      if (content.type === 'stone') stoneCells.push(path[i]);
      else if (content.type === 'special') specialTileCells.push(path[i]);
      else if (content.type === 'portal' && portalCountsTowardLength) specialTileCells.push(path[i]);
    }
    if (stoneCells.length + specialTileCells.length >= MIN_CHAIN_LENGTH) {
      subChains.push({ color: segment.color, stoneCells, specialTileCells });
    }
  }

  if (subChains.length === 0) return invalid('no segment reaches minimum chain length');

  const portalCells = portalIndex === -1 ? [] : [path[portalIndex]];
  return { valid: true, subChains, portalCells };
}
