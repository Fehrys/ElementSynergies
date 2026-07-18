import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BATTLE_ENVIRONMENT_ASSETS } from '../../src/assets/battleEnvironmentAssets';
import type { AvailableBattleEnvironmentAsset } from '../../src/assets/battleEnvironmentAssets';
import { readWebpHeader } from './webpHeader';

// Validates the two Lot 1 environment background assets against the
// manifest: existence at the declared path, a real WebP container, decoded
// dimensions matching `productionSize`, and a header-level opacity check —
// but ONLY for entries whose `status` is 'available' (both are, today). A
// hypothetical future 'pending' entry's draft file (if one happened to sit
// at its path) would never be treated as final by this suite — only a human
// flipping the manifest's `status` to 'available' (with the file's real
// measured productionSize) does that. See
// design/production/combat/lot-01-environment/README.md.
const PUBLIC_ROOT = path.resolve(__dirname, '../../public');

const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'ascii');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectContainer(buf: Buffer): 'webp' | 'png' | 'unknown' {
  if (buf.length >= 12 && buf.subarray(0, 4).equals(RIFF_SIGNATURE) && buf.subarray(8, 12).equals(WEBP_SIGNATURE)) {
    return 'webp';
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'png';
  }
  return 'unknown';
}

function isAvailable(a: (typeof BATTLE_ENVIRONMENT_ASSETS)[number]): a is AvailableBattleEnvironmentAsset {
  return a.status === 'available';
}

describe('environment asset files', () => {
  it('defines exactly the two background roles', () => {
    expect(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role).sort()).toEqual(
      ['battleBackgroundLower', 'battleBackgroundUpper'].sort(),
    );
  });

  it('has exactly two available assets — both backgrounds are finalized', () => {
    expect(BATTLE_ENVIRONMENT_ASSETS.filter(isAvailable).map((a) => a.role).sort()).toEqual(
      ['battleBackgroundLower', 'battleBackgroundUpper'].sort(),
    );
    // Guard against a regression that silently leaves a final asset
    // un-promoted: this suite is only ever a real check for 'available'
    // entries, so a background stuck at 'pending' would pass validation by
    // never being looked at — this assertion is what actually catches that.
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.status, `${a.role} must be 'available' — this Lot's contract has no pending asset left.`).toBe(
        'available',
      );
    }
  });

  for (const asset of BATTLE_ENVIRONMENT_ASSETS.filter(isAvailable)) {
    describe(`${asset.role} (${asset.path})`, () => {
      const filePath = path.join(PUBLIC_ROOT, asset.path.replace(/^\//, ''));

      it('exists on disk at the manifest path', () => {
        expect(fs.existsSync(filePath), `Missing file: ${filePath}`).toBe(true);
      });

      it('is a real WebP container matching the declared format', () => {
        const buf = fs.readFileSync(filePath);
        const container = detectContainer(buf);
        expect(
          container,
          `${asset.path} must be a real ${asset.format} file, but its magic bytes decode as "${container}".`,
        ).toBe('webp');
        expect(asset.format).toBe('webp');
      });

      it('decodes a valid, non-truncated WebP header with the declared production dimensions', () => {
        const buf = fs.readFileSync(filePath);
        const { width, height } = readWebpHeader(buf);
        expect(width, `${asset.path}: decoded width ${width} !== manifest productionSize.width ${asset.productionSize.width}`).toBe(
          asset.productionSize.width,
        );
        expect(
          height,
          `${asset.path}: decoded height ${height} !== manifest productionSize.height ${asset.productionSize.height}`,
        ).toBe(asset.productionSize.height);
      });

      it('never requires alpha, and its header does not flag an alpha channel', () => {
        expect(asset.alphaRequired).toBe(false);
        const buf = fs.readFileSync(filePath);
        const { hasAlpha } = readWebpHeader(buf);
        // Header-level signal only (see webpHeader.ts's WebpHeaderInfo doc):
        // a VP8L stream's alpha_is_used bit is a reliable "no alpha channel
        // was encoded" guarantee when false, which is what this asserts. It
        // is not a full per-pixel decode — confirming every pixel is opaque
        // beyond this header bit would require decoding the whole image,
        // which this minimal reader deliberately does not do.
        expect(
          hasAlpha,
          `${asset.path} must be opaque (no alpha channel) per ASSET_CONTRACT.md, but its WebP header flags one.`,
        ).toBe(false);
      });
    });
  }
});
