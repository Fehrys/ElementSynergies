// Pure, Phaser-free and DOM-free derivation of the puzzle's own lower-band
// footprint (see docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md).
// `lowerBand` is always the caller's `layout.table` rect — already the full
// [0, viewport.width] x [table.y, viewport.height] band (battleLayout.ts).
// This module never reads gameplayColumn: the puzzle is no longer capped by
// the chrome column width.
import type { Rect, SafeInsets } from './battleLayout';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// A single clamp-based margin rule (not three per-format constants): modest
// on small phones, capped so it never becomes decorative on large tablets.
export const BOARD_MARGIN_FRACTION = 0.04;
export const BOARD_MARGIN_MIN = 10;
export const BOARD_MARGIN_MAX = 28;

// Derives the responsive interactive rect inside the lower band: enough
// clearance for touch safety, drag/selection-ring effects, and never under a
// safe-area inset. Left/right/bottom margins widen to at least the matching
// safe-area inset (the top edge needs no such term: table.y is already
// derived from safeRect.y, so lowerBand's top is already inset-safe).
export function computeAvailableBoardRect(lowerBand: Rect, insets: SafeInsets): Rect {
  const minDim = Math.min(lowerBand.width, lowerBand.height);
  const baseMargin = clamp(minDim * BOARD_MARGIN_FRACTION, BOARD_MARGIN_MIN, BOARD_MARGIN_MAX);
  const marginLeft = Math.max(baseMargin, insets.left);
  const marginRight = Math.max(baseMargin, insets.right);
  const marginBottom = Math.max(baseMargin, insets.bottom);
  const marginTop = baseMargin;
  return {
    x: lowerBand.x + marginLeft,
    y: lowerBand.y + marginTop,
    width: Math.max(0, lowerBand.width - marginLeft - marginRight),
    height: Math.max(0, lowerBand.height - marginTop - marginBottom),
  };
}

const BOARD_FRAME_PADDING_FRACTION = 0.02;
const BOARD_FRAME_PADDING_MIN = 6;
const BOARD_FRAME_PADDING_MAX = 16;

// The temporary responsive frame's bounds: tileBounds expanded by a modest
// padding, clamped so it can never spill outside lowerBand (and therefore
// never overlaps the upper composition).
export function computeBoardFrameBounds(tileBounds: Rect, lowerBand: Rect): Rect {
  const minDim = Math.min(lowerBand.width, lowerBand.height);
  const padding = clamp(minDim * BOARD_FRAME_PADDING_FRACTION, BOARD_FRAME_PADDING_MIN, BOARD_FRAME_PADDING_MAX);
  const x = Math.max(lowerBand.x, tileBounds.x - padding);
  const y = Math.max(lowerBand.y, tileBounds.y - padding);
  const right = Math.min(lowerBand.x + lowerBand.width, tileBounds.x + tileBounds.width + padding);
  const bottom = Math.min(lowerBand.y + lowerBand.height, tileBounds.y + tileBounds.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}
