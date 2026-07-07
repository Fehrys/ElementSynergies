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

  // The chain's color is whatever the drag started on; a drag must start
  // on a stone (special tiles/portal can only be picked up mid-drag).
  const first = grid.get(path[0].row, path[0].col);
  if (first.type !== 'stone') return invalid('path must start on a stone');

  let activeColor: ElementColor = first.color;
  let portalIndex = -1;

  // Walk the rest of the path enforcing the pickup rules:
  // - matching-color stones extend the chain
  // - special tiles are colorless and always allowed, without changing color
  // - a portal (at most one) switches the active color to whatever follows it
  // - anything else (wrong color, empty cell) invalidates the whole path
  for (let i = 1; i < path.length; i++) {
    const content = grid.get(path[i].row, path[i].col);
    if (content.type === 'stone') {
      if (content.color !== activeColor) return invalid(`color mismatch at index ${i}`);
    } else if (content.type === 'special') {
      continue;
    } else if (content.type === 'portal') {
      if (portalIndex !== -1) return invalid('path uses more than one portal');
      const next = path[i + 1];
      if (!next) return invalid('portal cannot be the last cell');
      const nextContent = grid.get(next.row, next.col);
      if (nextContent.type !== 'stone') return invalid('cell after portal must be a stone');
      portalIndex = i;
      activeColor = nextContent.color;
    } else {
      return invalid(`path touches empty cell at index ${i}`);
    }
  }

  // Split the path into 1 segment (no portal) or 2 segments (portal
  // present), each spanning from its start to the portal (inclusive) and
  // from the portal (inclusive) onward — the portal cell is shared by
  // both segments, matching "portal counts toward both" in the spec.
  const segments: { color: ElementColor; start: number; end: number }[] = [];
  if (portalIndex === -1) {
    segments.push({ color: first.color, start: 0, end: path.length - 1 });
  } else {
    const afterPortal = grid.get(path[portalIndex + 1].row, path[portalIndex + 1].col);
    if (afterPortal.type !== 'stone') return invalid('cell after portal must be a stone');
    segments.push({ color: first.color, start: 0, end: portalIndex });
    segments.push({ color: afterPortal.color, start: portalIndex, end: path.length - 1 });
  }

  // Build a SubChain per segment, but only keep segments that reach the
  // minimum length — a portal side that falls short simply contributes
  // no sub-chain (design decision: it doesn't invalidate the other side).
  const subChains: SubChain[] = [];
  for (const segment of segments) {
    const stoneCells: CellCoord[] = [];
    const specialTileCells: CellCoord[] = [];
    for (let i = segment.start; i <= segment.end; i++) {
      const content = grid.get(path[i].row, path[i].col);
      if (content.type === 'stone') stoneCells.push(path[i]);
      else if (content.type === 'special') specialTileCells.push(path[i]);
    }
    if (stoneCells.length >= MIN_CHAIN_LENGTH) {
      subChains.push({ color: segment.color, stoneCells, specialTileCells });
    }
  }

  if (subChains.length === 0) return invalid('no segment reaches minimum chain length');

  const portalCells = portalIndex === -1 ? [] : [path[portalIndex]];
  return { valid: true, subChains, portalCells };
}
