import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BATTLE_ENVIRONMENT_ASSETS } from '../../src/assets/battleEnvironmentAssets';
import { readPngHeader } from './pngHeader';

// Validates the produced Lot 1 environment assets against the manifest:
// existence at the declared path, decodability, real production dimensions
// matching `productionSize`, and (where `alphaRequired`) a true PNG alpha
// channel. Deliberately skips `status: 'pending'` assets (leftHearth,
// rightLarder) — they are not produced yet, see
// design/production/combat/lot-01-environment/README.md.
const PUBLIC_ROOT = path.resolve(__dirname, '../../public');

const AVAILABLE_ASSETS = BATTLE_ENVIRONMENT_ASSETS.filter((a) => a.status === 'available');

describe('environment asset files (available assets only)', () => {
  it('has exactly the three produced assets marked available', () => {
    expect(AVAILABLE_ASSETS.map((a) => a.role).sort()).toEqual(
      ['battleBackgroundUpper', 'cuttingBoard', 'prepTableBase'].sort(),
    );
  });

  for (const asset of AVAILABLE_ASSETS) {
    describe(`${asset.role} (${asset.path})`, () => {
      const filePath = path.join(PUBLIC_ROOT, asset.path.replace(/^\//, ''));

      it('exists on disk at the manifest path', () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it('is a decodable PNG with the declared production dimensions', () => {
        // Every currently-produced file is PNG-encoded on disk, including the
        // two declared `format: 'webp'` (see the manifest's per-asset
        // comments for the container/extension mismatch this uncovered).
        const buf = fs.readFileSync(filePath);
        const header = readPngHeader(buf);
        expect(header.width).toBe(asset.productionSize.width);
        expect(header.height).toBe(asset.productionSize.height);
      });

      if (asset.alphaRequired) {
        it('has a real alpha channel (not a baked-in checkerboard)', () => {
          const buf = fs.readFileSync(filePath);
          const header = readPngHeader(buf);
          expect(
            header.hasAlpha,
            `${asset.path} must be a PNG with a true alpha channel (colorType 4 or 6) for role "${asset.role}", ` +
              `but decoded as colorType ${header.colorType} (${
                header.colorType === 2 ? 'truecolor RGB, no alpha' : 'no alpha'
              }). The file must be re-exported from its source as PNG RGBA — this cannot be fixed at runtime.`,
          ).toBe(true);
        });
      }
    });
  }
});
