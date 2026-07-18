import { describe, it, expect } from 'vitest';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';
import type { BattleLayout } from '../../src/scenes/battleLayout';
import { computeBattleEnvironmentLayout, placementToRect, ENVIRONMENT_ROLES } from '../../src/scenes/battleEnvironmentLayout';
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

  it('computes exactly two placements', () => {
    for (const role of ENVIRONMENT_ROLES) {
      expect(env[role]).toBeDefined();
    }
    expect(Object.keys(env).sort()).toEqual([...ENVIRONMENT_ROLES].sort());
    expect(Object.keys(env)).toHaveLength(2);
  });

  it('no longer defines any of the five retired roles', () => {
    const retired = ['upperArchitecture', 'stoneFloor', 'prepTableBase', 'cuttingBoard', 'leftHearth', 'rightLarder'];
    for (const role of retired) {
      expect(ENVIRONMENT_ROLES as readonly string[]).not.toContain(role);
      expect(Object.keys(env)).not.toContain(role);
    }
    expect(ENVIRONMENT_ROLES).toContain('battleBackgroundUpper');
    expect(ENVIRONMENT_ROLES).toContain('battleBackgroundLower');
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

  it('covers the upper band from the viewport top down to layout.table.y, viewport-centered', () => {
    const bg = placementToRect(env.battleBackgroundUpper);
    expect(bg).toEqual({ x: 0, y: 0, width, height: layout.table.y });
    expect(env.battleBackgroundUpper.originX).toBe(0.5);
    expect(env.battleBackgroundUpper.originY).toBe(0);
    expect(env.battleBackgroundUpper.x).toBe(width / 2);
    expect(env.battleBackgroundUpper.width).toBe(layout.background.width);
    expect(env.battleBackgroundUpper.height).toBe(layout.table.y);
  });

  it('covers the lower band from layout.table.y down to the viewport bottom, viewport-centered', () => {
    const bg = placementToRect(env.battleBackgroundLower);
    expect(bg).toEqual({
      x: 0,
      y: layout.table.y,
      width,
      height: layout.background.height - layout.table.y,
    });
    expect(env.battleBackgroundLower.originX).toBe(0.5);
    expect(env.battleBackgroundLower.originY).toBe(0);
    expect(env.battleBackgroundLower.x).toBe(width / 2);
    expect(env.battleBackgroundLower.y).toBe(layout.table.y);
  });

  it('shares the exact seam: upper bottom edge === lower top edge === layout.table.y', () => {
    const upper = placementToRect(env.battleBackgroundUpper);
    const lower = placementToRect(env.battleBackgroundLower);
    expect(upper.y + upper.height).toBe(layout.table.y);
    expect(lower.y).toBe(layout.table.y);
    expect(upper.y + upper.height).toBe(lower.y);
  });

  it('leaves the 32 cell positions and tileBounds untouched', () => {
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

describe('manifest consistency', () => {
  it('defines exactly two assets with unique keys, paths, and roles', () => {
    expect(BATTLE_ENVIRONMENT_ASSETS).toHaveLength(2);
    expect(new Set(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.key)).size).toBe(2);
    expect(new Set(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.path)).size).toBe(2);
    expect(new Set(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role)).size).toBe(2);
    expect([...BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role)].sort()).toEqual([...ENVIRONMENT_ROLES].sort());
  });

  it('no longer declares any of the five retired roles', () => {
    const roles = BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role);
    const retired = ['upperArchitecture', 'stoneFloor', 'prepTableBase', 'cuttingBoard', 'leftHearth', 'rightLarder'];
    for (const role of retired) {
      expect(roles).not.toContain(role);
    }
    expect(roles).toContain('battleBackgroundUpper');
    expect(roles).toContain('battleBackgroundLower');
  });

  it('roots every path under the environment production tree with the .webp extension', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.path.startsWith('/assets/battle/environment/')).toBe(true);
      expect(a.path.endsWith('.webp')).toBe(true);
      expect(a.format).toBe('webp');
    }
  });

  it('uses the exact contract paths for each role', () => {
    expect(environmentAssetByRole('battleBackgroundUpper').path).toBe(
      '/assets/battle/environment/background/battle_bg_upper.webp',
    );
    expect(environmentAssetByRole('battleBackgroundLower').path).toBe(
      '/assets/battle/environment/background/battle_bg_lower.webp',
    );
  });

  it('never requires alpha for either opaque webp background', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.alphaRequired).toBe(false);
    }
  });

  it('marks both backgrounds as available (both final illustrations are deposited)', () => {
    expect(BATTLE_ENVIRONMENT_ASSETS.every((a) => a.status === 'available')).toBe(true);
  });

  it('declares strictly positive production dimensions for both available assets', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.status).toBe('available');
      if (a.status !== 'available') continue; // narrows for TS
      expect(a.productionSize.width).toBeGreaterThan(0);
      expect(a.productionSize.height).toBeGreaterThan(0);
      expect(a.productionSize.aspectRatio).toBeGreaterThan(0);
      expect(Number.isInteger(a.productionSize.width)).toBe(true);
      expect(Number.isInteger(a.productionSize.height)).toBe(true);
    }
  });

  it('keeps each declared aspect ratio consistent with its production dimensions', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      if (a.status !== 'available') continue;
      const { width, height, aspectRatio } = a.productionSize;
      expect(Math.abs(aspectRatio - width / height)).toBeLessThan(0.005);
    }
  });
});
