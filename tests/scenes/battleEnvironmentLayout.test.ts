import { describe, it, expect } from 'vitest';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';
import type { BattleLayout } from '../../src/scenes/battleLayout';
import {
  computeBattleEnvironmentLayout,
  DEFAULT_ENVIRONMENT_SLOT_POLICY,
  placementToRect,
  ENVIRONMENT_ROLES,
} from '../../src/scenes/battleEnvironmentLayout';
import { BATTLE_ENVIRONMENT_ASSETS, environmentAssetByRole } from '../../src/assets/battleEnvironmentAssets';
import { cellToPixel } from '../../src/scenes/boardGeometry';
import { getAllCells } from '../../src/core/grid';

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// The three validated review formats (phone / composition baseline / tablet).
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
] as const;

function layoutAt(width: number, height: number): BattleLayout {
  return computeBattleLayout({ width, height, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
}

describe.each(VIEWPORTS)('computeBattleEnvironmentLayout at $width x $height', ({ width, height }) => {
  const layout = layoutAt(width, height);
  const env = computeBattleEnvironmentLayout(layout);

  it('computes all six placements', () => {
    for (const role of ENVIRONMENT_ROLES) {
      expect(env[role]).toBeDefined();
    }
    expect(Object.keys(env).sort()).toEqual([...ENVIRONMENT_ROLES].sort());
  });

  it('contains no NaN or Infinity anywhere', () => {
    for (const role of ENVIRONMENT_ROLES) {
      const p = env[role];
      for (const v of [p.x, p.y, p.width, p.height, p.originX, p.originY]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('has strictly positive sizes for every slot', () => {
    for (const role of ENVIRONMENT_ROLES) {
      expect(env[role].width).toBeGreaterThan(0);
      expect(env[role].height).toBeGreaterThan(0);
    }
  });

  it('prepTableBase matches layout.table exactly', () => {
    expect(placementToRect(env.prepTableBase)).toEqual(layout.table);
  });

  it('keeps the cutting board centered on the gameplay column', () => {
    const rect = placementToRect(env.cuttingBoard);
    const columnCenter = layout.gameplayColumn.x + layout.gameplayColumn.width / 2;
    expect(rect.x + rect.width / 2).toBeCloseTo(columnCenter, 9);
  });

  it('derives the cutting board from tileBounds plus the policy margins', () => {
    const tiles = layout.board.tileBounds;
    const p = DEFAULT_ENVIRONMENT_SLOT_POLICY;
    const rect = placementToRect(env.cuttingBoard);
    expect(rect.width).toBeCloseTo(tiles.width * (1 + 2 * p.cuttingBoardSideMarginFraction), 9);
    expect(rect.height).toBeCloseTo(
      tiles.height * (1 + p.cuttingBoardTopMarginFraction + p.cuttingBoardBottomMarginFraction),
      9,
    );
    // Natural top, then the Y-only minimumBoardTopGap clamp below the seam.
    const naturalTop = tiles.y - tiles.height * p.cuttingBoardTopMarginFraction;
    expect(rect.y).toBeCloseTo(Math.max(naturalTop, layout.table.y + p.minimumBoardTopGap), 9);
    // The margins fully enclose the tiles.
    expect(rect.x).toBeLessThan(tiles.x);
    expect(rect.x + rect.width).toBeGreaterThan(tiles.x + tiles.width);
    expect(rect.y).toBeLessThan(tiles.y);
    expect(rect.y + rect.height).toBeGreaterThan(tiles.y + tiles.height);
  });

  it('anchors the clusters flush to the viewport edges', () => {
    const left = placementToRect(env.leftHearth);
    const right = placementToRect(env.rightLarder);
    expect(left.x).toBe(0);
    expect(right.x + right.width).toBeCloseTo(width, 9);
    // Same vertical span, standing on the stone/wood separation.
    expect(left.y).toBeCloseTo(right.y, 9);
    expect(left.y + left.height).toBeCloseTo(layout.table.y, 9);
    expect(right.y + right.height).toBeCloseTo(layout.table.y, 9);
  });

  it('ends the stone floor exactly where the preparation zone begins', () => {
    const floor = placementToRect(env.stoneFloor);
    expect(floor.y).toBeCloseTo(layout.environment.horizonY, 9);
    expect(floor.y + floor.height).toBeCloseTo(layout.table.y, 9);
    expect(floor.width).toBe(width);
  });

  it('covers the upper band with the architecture slot, viewport-centered', () => {
    const arch = placementToRect(env.upperArchitecture);
    expect(arch).toEqual({ x: 0, y: 0, width, height: layout.environment.horizonY });
    expect(env.upperArchitecture.originX).toBe(0.5);
  });

  it('keeps the cutting board top at least minimumBoardTopGap below the seam', () => {
    const rect = placementToRect(env.cuttingBoard);
    expect(rect.y).toBeGreaterThanOrEqual(layout.table.y + DEFAULT_ENVIRONMENT_SLOT_POLICY.minimumBoardTopGap);
    // The shifted frame still fully encloses the tiles and stays inside the
    // preparation band (no bottom overflow at the reference formats).
    const tiles = layout.board.tileBounds;
    expect(rect.y).toBeLessThan(tiles.y);
    expect(rect.y + rect.height).toBeGreaterThan(tiles.y + tiles.height);
    expect(rect.y + rect.height).toBeLessThanOrEqual(layout.table.y + layout.table.height);
  });

  it('lets the clamp change only the cutting board Y, nothing else', () => {
    const unclamped = computeBattleEnvironmentLayout(layoutAt(width, height), {
      ...DEFAULT_ENVIRONMENT_SLOT_POLICY,
      minimumBoardTopGap: -Infinity,
    });
    // The five other slots are byte-identical with or without the clamp.
    for (const role of ENVIRONMENT_ROLES) {
      if (role === 'cuttingBoard') continue;
      expect(env[role]).toEqual(unclamped[role]);
    }
    // On the board itself, every field except y is untouched.
    expect(env.cuttingBoard.x).toBe(unclamped.cuttingBoard.x);
    expect(env.cuttingBoard.width).toBe(unclamped.cuttingBoard.width);
    expect(env.cuttingBoard.height).toBe(unclamped.cuttingBoard.height);
    expect(env.cuttingBoard.originX).toBe(unclamped.cuttingBoard.originX);
    expect(env.cuttingBoard.originY).toBe(unclamped.cuttingBoard.originY);
    expect(env.cuttingBoard.y).toBeGreaterThanOrEqual(unclamped.cuttingBoard.y);
  });

  it('leaves the 32 cell positions and tileBounds untouched by the clamp', () => {
    const fresh = layoutAt(width, height);
    const cellsBefore = getAllCells().map((c) => cellToPixel(fresh.board, c.row, c.col));
    const tileBoundsBefore = { ...fresh.board.tileBounds };
    computeBattleEnvironmentLayout(fresh);
    const cellsAfter = getAllCells().map((c) => cellToPixel(fresh.board, c.row, c.col));
    expect(cellsAfter).toHaveLength(32);
    expect(cellsAfter).toEqual(cellsBefore);
    expect(fresh.board.tileBounds).toEqual(tileBoundsBefore);
  });

  it('never mutates the BattleLayout it reads (gameplay is untouched)', () => {
    const fresh = layoutAt(width, height);
    const snapshot = JSON.parse(JSON.stringify(fresh));
    computeBattleEnvironmentLayout(fresh);
    expect(fresh).toEqual(snapshot);
  });

  it('is deterministic across two identical computations', () => {
    const a = computeBattleEnvironmentLayout(layoutAt(width, height));
    const b = computeBattleEnvironmentLayout(layoutAt(width, height));
    expect(a).toEqual(b);
  });

  it('uses the exact origin each manifest entry declares as its anchor', () => {
    for (const role of ENVIRONMENT_ROLES) {
      const def = environmentAssetByRole(role);
      expect({ x: env[role].originX, y: env[role].originY }).toEqual(def.anchor);
    }
  });
});

describe('tablet-specific constraints (768 x 1024)', () => {
  const layout = layoutAt(768, 1024);
  const env = computeBattleEnvironmentLayout(layout);

  it('never stretches the cutting board to the viewport or table width', () => {
    const rect = placementToRect(env.cuttingBoard);
    expect(rect.width).toBeLessThan(768);
    expect(rect.width).toBeLessThan(layout.table.width);
    // It stays inside the gameplay column.
    expect(rect.x).toBeGreaterThanOrEqual(layout.gameplayColumn.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(layout.gameplayColumn.x + layout.gameplayColumn.width);
  });

  it('caps the cluster width by policy instead of growing with the viewport', () => {
    const p = DEFAULT_ENVIRONMENT_SLOT_POLICY;
    const expected = Math.min(768 * p.clusterWidthFraction, p.clusterMaxWidth);
    expect(env.leftHearth.width).toBeCloseTo(expected, 9);
    expect(env.rightLarder.width).toBeCloseTo(expected, 9);
  });

  it('does not move the cutting board when the natural gap is already sufficient', () => {
    // On tablet the natural top sits well below table.y + gap, so the clamp
    // must not alter the validated placement at all.
    const tiles = layout.board.tileBounds;
    const naturalTop = tiles.y - tiles.height * DEFAULT_ENVIRONMENT_SLOT_POLICY.cuttingBoardTopMarginFraction;
    expect(naturalTop).toBeGreaterThan(layout.table.y + DEFAULT_ENVIRONMENT_SLOT_POLICY.minimumBoardTopGap);
    expect(placementToRect(env.cuttingBoard).y).toBeCloseTo(naturalTop, 9);
  });
});

describe('slot policy contract values', () => {
  it('pins the validated cluster cap and board top gap', () => {
    expect(DEFAULT_ENVIRONMENT_SLOT_POLICY.clusterMaxWidth).toBe(220);
    expect(DEFAULT_ENVIRONMENT_SLOT_POLICY.minimumBoardTopGap).toBe(8);
  });
});

describe('manifest consistency', () => {
  it('defines exactly six assets with unique keys, paths, and roles', () => {
    expect(BATTLE_ENVIRONMENT_ASSETS).toHaveLength(6);
    expect(new Set(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.key)).size).toBe(6);
    expect(new Set(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.path)).size).toBe(6);
    expect(new Set(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role)).size).toBe(6);
    expect([...BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role)].sort()).toEqual([...ENVIRONMENT_ROLES].sort());
  });

  it('roots every path under the environment production tree with the matching extension', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.path.startsWith('/assets/battle/environment/')).toBe(true);
      expect(a.path.endsWith(`.${a.format}`)).toBe(true);
    }
  });

  it('requires alpha exactly for the png clusters/board and never for opaque webp layers', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.alphaRequired).toBe(a.format === 'png');
    }
  });

  it('declares strictly positive production dimensions for all six assets', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.productionSize).toBeDefined();
      expect(a.productionSize.width).toBeGreaterThan(0);
      expect(a.productionSize.height).toBeGreaterThan(0);
      expect(a.productionSize.aspectRatio).toBeGreaterThan(0);
      expect(Number.isInteger(a.productionSize.width)).toBe(true);
      expect(Number.isInteger(a.productionSize.height)).toBe(true);
    }
  });

  it('keeps every declared aspect ratio consistent with its dimensions', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      const { width, height, aspectRatio } = a.productionSize;
      expect(Math.abs(aspectRatio - width / height)).toBeLessThan(0.005);
    }
    // The cutting board's ratio drives its uniform slot fit: high precision.
    const board = environmentAssetByRole('cuttingBoard').productionSize;
    expect(board.aspectRatio).toBeCloseTo(board.width / board.height, 9);
  });
});
