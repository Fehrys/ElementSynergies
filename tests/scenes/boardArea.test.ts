import { describe, it, expect } from 'vitest';
import {
  computeAvailableBoardRect,
  computeBoardFrameBounds,
  BOARD_MARGIN_MIN,
  BOARD_MARGIN_MAX,
} from '../../src/scenes/boardArea';

const none = { top: 0, right: 0, bottom: 0, left: 0 };

describe('computeAvailableBoardRect', () => {
  it('stays strictly inside the lowerBand on every side', () => {
    const lowerBand = { x: 0, y: 300, width: 480, height: 400 };
    const r = computeAvailableBoardRect(lowerBand, none);
    expect(r.x).toBeGreaterThan(lowerBand.x);
    expect(r.y).toBeGreaterThan(lowerBand.y);
    expect(r.x + r.width).toBeLessThan(lowerBand.x + lowerBand.width);
    expect(r.y + r.height).toBeLessThan(lowerBand.y + lowerBand.height);
  });

  it('saturates the margin at BOARD_MARGIN_MIN on a tiny band', () => {
    const lowerBand = { x: 0, y: 0, width: 100, height: 100 };
    const r = computeAvailableBoardRect(lowerBand, none);
    expect(r.x).toBeCloseTo(BOARD_MARGIN_MIN, 9);
    expect(r.width).toBeCloseTo(100 - 2 * BOARD_MARGIN_MIN, 9);
  });

  it('saturates the margin at BOARD_MARGIN_MAX on a huge band', () => {
    const lowerBand = { x: 0, y: 0, width: 4000, height: 4000 };
    const r = computeAvailableBoardRect(lowerBand, none);
    expect(r.x).toBeCloseTo(BOARD_MARGIN_MAX, 9);
  });

  it('widens the left/right/bottom margin to at least the safe-area inset', () => {
    const lowerBand = { x: 0, y: 300, width: 480, height: 400 };
    const insets = { top: 0, right: 40, bottom: 30, left: 25 };
    const r = computeAvailableBoardRect(lowerBand, insets);
    expect(r.x).toBeGreaterThanOrEqual(lowerBand.x + insets.left);
    expect(r.x + r.width).toBeLessThanOrEqual(lowerBand.x + lowerBand.width - insets.right);
    expect(r.y + r.height).toBeLessThanOrEqual(lowerBand.y + lowerBand.height - insets.bottom);
  });

  it('never produces a negative size on a degenerate band', () => {
    const r = computeAvailableBoardRect({ x: 0, y: 0, width: 5, height: 5 }, none);
    expect(r.width).toBeGreaterThanOrEqual(0);
    expect(r.height).toBeGreaterThanOrEqual(0);
  });
});

describe('computeBoardFrameBounds', () => {
  const lowerBand = { x: 0, y: 300, width: 480, height: 400 };
  const tileBounds = { x: 60, y: 350, width: 360, height: 200 };

  it('fully encloses tileBounds', () => {
    const frame = computeBoardFrameBounds(tileBounds, lowerBand);
    expect(frame.x).toBeLessThanOrEqual(tileBounds.x);
    expect(frame.y).toBeLessThanOrEqual(tileBounds.y);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(tileBounds.x + tileBounds.width);
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(tileBounds.y + tileBounds.height);
  });

  it('never exceeds lowerBand even when padding would overflow it', () => {
    const wideTiles = { x: 5, y: 305, width: 470, height: 390 };
    const frame = computeBoardFrameBounds(wideTiles, lowerBand);
    expect(frame.x).toBeGreaterThanOrEqual(lowerBand.x);
    expect(frame.y).toBeGreaterThanOrEqual(lowerBand.y);
    expect(frame.x + frame.width).toBeLessThanOrEqual(lowerBand.x + lowerBand.width);
    expect(frame.y + frame.height).toBeLessThanOrEqual(lowerBand.y + lowerBand.height);
  });
});
