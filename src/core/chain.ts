import { CellCoord, HexGrid, ElementColor } from './grid';

// One scored segment of a validated chain. Normally there's exactly one
// SubChain per drag; each portal in the path splits it into one more (one
// sub-chain per color the drag passes through).
export interface SubChain {
  color: ElementColor;
  stoneCells: CellCoord[]; // colored stones that deal damage (count = stoneCells.length)
  specialTileCells: CellCoord[]; // colorless tiles riding along; cleared, but queued for wave 2
}

export interface ChainValidationResult {
  valid: boolean;
  subChains: SubChain[];
  // Every portal cell the path passed through (0 or more entries) — each
  // one is shared between the two sub-chains it bridges, so portals are
  // tracked separately rather than inside either sub-chain's own cells.
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
  const portalIndices: number[] = [];
  // The index of the one portal (if any) that led the chain — encountered
  // before any color had been decided, so it's a colorless passthrough
  // like a special tile, not a bridge, and counts toward its segment's
  // minimum length. Only the very first portal in a path can ever be
  // "leading": the cell right after any portal is forced to be a stone,
  // which immediately decides a color, so every portal after the first is
  // necessarily a bridge. A bridging portal stays excluded from both
  // sides' counts, as today — tracking this by specific index (rather
  // than a plain boolean) is what keeps a later bridging portal from
  // being miscounted as the leading one when both fall inside the same
  // segment's cell range.
  let leadingPortalIndex = -1;

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
      const next = path[i + 1];
      if (!next) return invalid('portal cannot be the last cell');
      const nextContent = grid.get(next.row, next.col);
      if (nextContent.type !== 'stone') return invalid('cell after portal must be a stone');
      portalIndices.push(i);
      if (activeColor === null) {
        leadingPortalIndex = i;
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
      else if (content.type === 'portal' && i === leadingPortalIndex) specialTileCells.push(path[i]);
    }
    if (stoneCells.length + specialTileCells.length >= MIN_CHAIN_LENGTH) {
      subChains.push({ color: segment.color, stoneCells, specialTileCells });
    }
  }

  if (subChains.length === 0) return invalid('no segment reaches minimum chain length');

  const portalCells = portalIndices.map((i) => path[i]);
  return { valid: true, subChains, portalCells };
}

// Replays a path (assumed already legal so far) to recover the state a
// live per-step check needs: the color decided so far (null if none
// yet). Mirrors validateChain's own color/portal bookkeeping so the
// rule lives in one place; canExtendChain is the only other consumer.
function replayState(grid: HexGrid, path: CellCoord[]): { activeColor: ElementColor | null } {
  let activeColor: ElementColor | null = null;
  let awaitingPortalReset = false;
  for (const cell of path) {
    const content = grid.get(cell.row, cell.col);
    if (content.type === 'stone') {
      if (activeColor === null || awaitingPortalReset) {
        activeColor = content.color;
        awaitingPortalReset = false;
      }
    } else if (content.type === 'portal') {
      awaitingPortalReset = true;
    }
  }
  return { activeColor };
}

// Whether `candidate` may legally extend `path` during an in-progress
// drag — the same color/special/portal rules validateChain enforces
// for a completed path, minus the minimum-length/segment-splitting
// concerns (irrelevant to a single step). Assumes `path` is non-empty
// and already legal so far. Used by BattleScene to decide, live,
// whether a newly touched cell extends the current drag or is ignored.
export function canExtendChain(grid: HexGrid, path: CellCoord[], candidate: CellCoord): boolean {
  if (path.some((cell) => sameCell(cell, candidate))) return false;

  const last = path[path.length - 1];
  if (!isAdjacent(grid, last, candidate)) return false;

  const lastContent = grid.get(last.row, last.col);
  const content = grid.get(candidate.row, candidate.col);

  // A portal must be immediately followed by a stone (matches
  // validateChain's release-time lookahead) — enforcing it live means a
  // path that passes every canExtendChain check can never be rejected
  // at release for this reason.
  if (lastContent.type === 'portal') {
    return content.type === 'stone';
  }

  if (content.type === 'stone') {
    const { activeColor } = replayState(grid, path);
    return activeColor === null || content.color === activeColor;
  }
  if (content.type === 'special') {
    return true;
  }
  if (content.type === 'portal') {
    return true;
  }
  return false;
}
