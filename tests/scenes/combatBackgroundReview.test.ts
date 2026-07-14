import { describe, it, expect } from 'vitest';
import {
  parseArtReviewMode,
  parseArtGuides,
  parseAssetSlots,
  computeCoverFit,
} from '../../src/scenes/combatBackgroundReview';

describe('parseArtReviewMode', () => {
  it('activates combatBackground mode from the exact query value', () => {
    expect(parseArtReviewMode('?artReview=combatBackground')).toBe('combatBackground');
    expect(parseArtReviewMode('?seed=1&artReview=combatBackground')).toBe('combatBackground');
    expect(parseArtReviewMode('?seed=1&artReview=combatBackground&artGuides=1')).toBe('combatBackground');
  });

  it('defaults to none for absent, empty, or unrecognized values', () => {
    expect(parseArtReviewMode('')).toBe('none');
    expect(parseArtReviewMode('?seed=1')).toBe('none');
    expect(parseArtReviewMode('?artReview=foo')).toBe('none');
    expect(parseArtReviewMode('?artReview=')).toBe('none');
  });

  it('is case-sensitive', () => {
    expect(parseArtReviewMode('?artReview=CombatBackground')).toBe('none');
    expect(parseArtReviewMode('?artreview=combatBackground')).toBe('none');
  });
});

describe('parseArtGuides', () => {
  it('is true only for the exact value "1"', () => {
    expect(parseArtGuides('?artGuides=1')).toBe(true);
    expect(parseArtGuides('?seed=1&artReview=combatBackground&artGuides=1')).toBe(true);
  });

  it('is false for absent, empty, or other values', () => {
    expect(parseArtGuides('')).toBe(false);
    expect(parseArtGuides('?artGuides=0')).toBe(false);
    expect(parseArtGuides('?artGuides=true')).toBe(false);
    expect(parseArtGuides('?artReview=combatBackground')).toBe(false);
  });
});

describe('parseAssetSlots', () => {
  it('is true only for the exact value "1"', () => {
    expect(parseAssetSlots('?assetSlots=1')).toBe(true);
    expect(parseAssetSlots('?seed=1&artReview=combatBackground&assetSlots=1')).toBe(true);
  });

  it('is false for absent, empty, or other values', () => {
    expect(parseAssetSlots('')).toBe(false);
    expect(parseAssetSlots('?assetSlots=0')).toBe(false);
    expect(parseAssetSlots('?assetSlots=true')).toBe(false);
    expect(parseAssetSlots('?artReview=combatBackground')).toBe(false);
  });
});

describe('computeCoverFit', () => {
  it('covers a taller viewport (crop on width) — source 3:4 to 480x720', () => {
    const fit = computeCoverFit(300, 400, 480, 720);
    expect(fit.scale).toBeCloseTo(1.8, 10);
    expect(fit.displayWidth).toBeCloseTo(540, 10);
    expect(fit.displayHeight).toBeCloseTo(720, 10);
    expect(fit.cropX).toBeCloseTo(60, 10);
    expect(fit.cropY).toBeCloseTo(0, 10);
    expect(fit.x).toBe(240);
    expect(fit.y).toBe(360);
  });

  it('covers a shorter, narrower viewport — source 3:4 to 360x640', () => {
    const fit = computeCoverFit(300, 400, 360, 640);
    expect(fit.scale).toBeCloseTo(1.6, 10);
    expect(fit.displayWidth).toBeCloseTo(480, 10);
    expect(fit.displayHeight).toBeCloseTo(640, 10);
    expect(fit.cropX).toBeCloseTo(120, 10);
    expect(fit.cropY).toBeCloseTo(0, 10);
  });

  it('covers a large viewport whose ratio happens to match the source — 3:4 to 768x1024', () => {
    const fit = computeCoverFit(300, 400, 768, 1024);
    expect(fit.scale).toBeCloseTo(2.56, 10);
    expect(fit.displayWidth).toBeCloseTo(768, 10);
    expect(fit.displayHeight).toBeCloseTo(1024, 10);
    expect(fit.cropX).toBeCloseTo(0, 6);
    expect(fit.cropY).toBeCloseTo(0, 6);
  });

  it('never crops when source and viewport share the exact same ratio', () => {
    const fit = computeCoverFit(200, 300, 400, 600);
    expect(fit.scale).toBeCloseTo(2, 10);
    expect(fit.displayWidth).toBeCloseTo(400, 10);
    expect(fit.displayHeight).toBeCloseTo(600, 10);
    expect(fit.cropX).toBe(0);
    expect(fit.cropY).toBe(0);
  });

  it('always centers the display rect on the viewport center', () => {
    const fit = computeCoverFit(1084, 1451, 480, 720);
    expect(fit.x).toBe(240);
    expect(fit.y).toBe(360);
    expect(fit.displayWidth).toBeGreaterThanOrEqual(480);
    expect(fit.displayHeight).toBeCloseTo(720, 6);
  });

  it('reports the resolved source and viewport dimensions unchanged', () => {
    const fit = computeCoverFit(1084, 1451, 480, 720);
    expect(fit.sourceWidth).toBe(1084);
    expect(fit.sourceHeight).toBe(1451);
    expect(fit.viewportWidth).toBe(480);
    expect(fit.viewportHeight).toBe(720);
  });
});
