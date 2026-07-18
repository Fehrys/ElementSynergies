import { describe, it, expect } from 'vitest';
import {
  parseArtReviewMode,
  parseArtGuides,
  parseAssetSlots,
  computeCoverFit,
  computeOverscaledCoverFit,
  LOWER_BACKGROUND_REFERENCE_SCALE,
  LOWER_BACKGROUND_MAX_OVERSCALE,
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

// 2026-07-18 Lot 2 review fix: battleBackgroundLower's cover scale alone
// shrinks the visible cutting board on narrow phones (a plain cover fit's
// scale is bound by whichever axis needs it most, and a narrow tall band can
// end up needing barely any scale-up at all). computeOverscaledCoverFit boosts
// the scale toward LOWER_BACKGROUND_REFERENCE_SCALE, using the real Lot 1
// asset ratio (1536x1280) and representative band dimensions for the three
// mandatory reference formats.
describe('computeOverscaledCoverFit', () => {
  const SRC_W = 1536;
  const SRC_H = 1280;
  // Representative lower-band dimensions at the three reference formats
  // (from computeBattleEnvironmentLayout at 360x640/480x720/768x1024).
  const NARROW_BAND = { width: 360, height: 299.93 };
  const MID_BAND = { width: 480, height: 325 };
  const WIDE_BAND = { width: 768, height: 477 };

  it('never scales anisotropically — a single isotropic factor drives both axes', () => {
    for (const band of [NARROW_BAND, MID_BAND, WIDE_BAND]) {
      const fit = computeOverscaledCoverFit(
        SRC_W,
        SRC_H,
        band.width,
        band.height,
        LOWER_BACKGROUND_REFERENCE_SCALE,
        LOWER_BACKGROUND_MAX_OVERSCALE,
      );
      expect(fit.displayWidth / SRC_W).toBeCloseTo(fit.displayHeight / SRC_H, 9);
      expect(fit.displayWidth / SRC_W).toBeCloseTo(fit.scale, 9);
    }
  });

  it('is never below the plain cover scale (only ever boosts, never de-zooms)', () => {
    for (const band of [NARROW_BAND, MID_BAND, WIDE_BAND]) {
      const base = computeCoverFit(SRC_W, SRC_H, band.width, band.height);
      const boosted = computeOverscaledCoverFit(
        SRC_W,
        SRC_H,
        band.width,
        band.height,
        LOWER_BACKGROUND_REFERENCE_SCALE,
        LOWER_BACKGROUND_MAX_OVERSCALE,
      );
      expect(boosted.scale).toBeGreaterThanOrEqual(base.scale - 1e-9);
    }
  });

  it('applies a strictly larger overscale on a narrow format than on a wider one', () => {
    const fitNarrow = computeOverscaledCoverFit(
      SRC_W,
      SRC_H,
      NARROW_BAND.width,
      NARROW_BAND.height,
      LOWER_BACKGROUND_REFERENCE_SCALE,
      LOWER_BACKGROUND_MAX_OVERSCALE,
    );
    const fitMid = computeOverscaledCoverFit(
      SRC_W,
      SRC_H,
      MID_BAND.width,
      MID_BAND.height,
      LOWER_BACKGROUND_REFERENCE_SCALE,
      LOWER_BACKGROUND_MAX_OVERSCALE,
    );
    const fitWide = computeOverscaledCoverFit(
      SRC_W,
      SRC_H,
      WIDE_BAND.width,
      WIDE_BAND.height,
      LOWER_BACKGROUND_REFERENCE_SCALE,
      LOWER_BACKGROUND_MAX_OVERSCALE,
    );
    const baseNarrow = computeCoverFit(SRC_W, SRC_H, NARROW_BAND.width, NARROW_BAND.height);
    const baseMid = computeCoverFit(SRC_W, SRC_H, MID_BAND.width, MID_BAND.height);
    const baseWide = computeCoverFit(SRC_W, SRC_H, WIDE_BAND.width, WIDE_BAND.height);
    const overscaleOf = (fit: { scale: number }, base: { scale: number }): number => fit.scale / base.scale;
    expect(overscaleOf(fitNarrow, baseNarrow)).toBeGreaterThan(overscaleOf(fitMid, baseMid));
    expect(overscaleOf(fitMid, baseMid)).toBeGreaterThanOrEqual(overscaleOf(fitWide, baseWide) - 1e-9);
  });

  it('stays confined to (fully covers) its band on every axis, even after the boost', () => {
    for (const band of [NARROW_BAND, MID_BAND, WIDE_BAND]) {
      const fit = computeOverscaledCoverFit(
        SRC_W,
        SRC_H,
        band.width,
        band.height,
        LOWER_BACKGROUND_REFERENCE_SCALE,
        LOWER_BACKGROUND_MAX_OVERSCALE,
      );
      expect(fit.displayWidth).toBeGreaterThanOrEqual(band.width - 1e-6);
      expect(fit.displayHeight).toBeGreaterThanOrEqual(band.height - 1e-6);
    }
  });

  it('never exceeds maxOverscale, and degrades gracefully for a degenerate (zero) source', () => {
    const fit = computeOverscaledCoverFit(SRC_W, SRC_H, 50, 40, 100, 3);
    const base = computeCoverFit(SRC_W, SRC_H, 50, 40);
    expect(fit.scale).toBeLessThanOrEqual(base.scale * 3 + 1e-9);
    const degenerate = computeOverscaledCoverFit(0, 0, 480, 720, 0.5, 2.5);
    expect(Number.isFinite(degenerate.scale)).toBe(true);
  });

  it('contains no NaN or Infinity across the three reference bands', () => {
    for (const band of [NARROW_BAND, MID_BAND, WIDE_BAND]) {
      const fit = computeOverscaledCoverFit(
        SRC_W,
        SRC_H,
        band.width,
        band.height,
        LOWER_BACKGROUND_REFERENCE_SCALE,
        LOWER_BACKGROUND_MAX_OVERSCALE,
      );
      for (const v of [fit.scale, fit.displayWidth, fit.displayHeight, fit.x, fit.y, fit.cropX, fit.cropY]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
