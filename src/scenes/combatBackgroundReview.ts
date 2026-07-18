// Pure, Phaser-free and DOM-free helpers for the temporary combat-background
// art review mode (?artReview=combatBackground[&artGuides=1]). This is a
// diagnostic overlay tool only: it never computes, reads, or influences
// gameplay coordinates (battleLayout.ts / boardGeometry.ts / compositionLayout.ts
// are the sole source of truth for those). See
// docs/superpowers/specs/2026-07-14-combat-background-art-review-design.md.

export type ArtReviewMode = 'none' | 'combatBackground';

// Deterministic, single-pass parse of window.location.search (passed in by the
// caller so this stays DOM-free and unit-testable in Node).
export function parseArtReviewMode(search: string): ArtReviewMode {
  const params = new URLSearchParams(search);
  return params.get('artReview') === 'combatBackground' ? 'combatBackground' : 'none';
}

export function parseArtGuides(search: string): boolean {
  return new URLSearchParams(search).get('artGuides') === '1';
}

// Lot 1 environment asset-slot overlay flag (&assetSlots=1). Parsed on its
// own here; it only takes effect when the combatBackground review mode is ALSO
// active — BattleScene enforces that conjunction, so the flag alone can never
// draw anything in normal play. See
// docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md.
export function parseAssetSlots(search: string): boolean {
  return new URLSearchParams(search).get('assetSlots') === '1';
}

export interface CoverFit {
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  displayWidth: number;
  displayHeight: number;
  x: number; // horizontal center, origin (0.5, 0.5)
  y: number; // vertical center, origin (0.5, 0.5)
  cropX: number; // total horizontal overflow cropped by the viewport (>= 0)
  cropY: number; // total vertical overflow cropped by the viewport (>= 0)
}

// `cover` placement: a single isotropic scale (never stretched) that makes the
// source fully cover the viewport, centered, with a symmetric crop on whichever
// axis overflows.
//   scale = max(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
export function computeCoverFit(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CoverFit {
  const scale =
    sourceWidth > 0 && sourceHeight > 0
      ? Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
      : 1;
  const displayWidth = sourceWidth * scale;
  const displayHeight = sourceHeight * scale;
  return {
    sourceWidth,
    sourceHeight,
    viewportWidth,
    viewportHeight,
    scale,
    displayWidth,
    displayHeight,
    x: viewportWidth / 2,
    y: viewportHeight / 2,
    cropX: Math.max(0, displayWidth - viewportWidth),
    cropY: Math.max(0, displayHeight - viewportHeight),
  };
}

// Calibration for battleBackgroundLower's overscale (2026-07-18 Lot 2 review
// fix — see docs/superpowers/specs/2026-07-18-battle-environment-runtime-integration-design.md).
// A plain cover fit's scale grows WITH the band's own size (bandWidth/bandHeight
// vs the source's fixed aspect ratio), so on a narrow phone — whose lower band
// happens to be nearly the same aspect ratio as the source image — cover barely
// scales up at all, showing almost the WHOLE painting (including all the
// peripheral wood/accessories) at a tiny size instead of a legible cutting
// board. REFERENCE_SCALE is the natural cover scale at the 768x1024 reference
// tablet format (the format the review confirmed already reads well, "proche
// du cover actuel"); every other format's scale is boosted toward it.
export const LOWER_BACKGROUND_REFERENCE_SCALE = 0.5;
// Hard ceiling on the boost so an extreme viewport (very short/narrow) can
// never zoom in absurdly far.
export const LOWER_BACKGROUND_MAX_OVERSCALE = 2.5;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// A cover fit with an additional, geometry-driven "overscale" layered on top
// of the plain isotropic cover — used for battleBackgroundLower so its
// cutting board stays comparably legible across viewport sizes instead of
// shrinking on narrow phones (see LOWER_BACKGROUND_REFERENCE_SCALE above).
// The overscale factor is derived purely from comparing THIS band's own cover
// scale to `referenceScale` (no per-viewport table), is always >= 1 (never
// de-zooms below plain cover), and is capped by `maxOverscale`. Still a
// single isotropic scale — width and height are never stretched separately.
export function computeOverscaledCoverFit(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  referenceScale: number,
  maxOverscale: number,
): CoverFit {
  const base = computeCoverFit(sourceWidth, sourceHeight, viewportWidth, viewportHeight);
  const overscale = base.scale > 0 ? clamp(referenceScale / base.scale, 1, maxOverscale) : 1;
  const scale = base.scale * overscale;
  const displayWidth = sourceWidth * scale;
  const displayHeight = sourceHeight * scale;
  return {
    sourceWidth,
    sourceHeight,
    viewportWidth,
    viewportHeight,
    scale,
    displayWidth,
    displayHeight,
    x: viewportWidth / 2,
    y: viewportHeight / 2,
    cropX: Math.max(0, displayWidth - viewportWidth),
    cropY: Math.max(0, displayHeight - viewportHeight),
  };
}
