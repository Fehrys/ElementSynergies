import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BATTLE_ENVIRONMENT_ASSETS } from '../../src/assets/battleEnvironmentAssets';
import { readPngHeader } from './pngHeader';
import { readWebpHeader } from './webpHeader';

// Validates the produced Lot 1 environment assets against the manifest:
// existence at the declared path, decodability, real production dimensions
// matching `productionSize`, and (where `alphaRequired`) a true PNG alpha
// channel. Deliberately skips `status: 'pending'` assets (leftHearth,
// rightLarder) — they are not produced yet, see
// design/production/combat/lot-01-environment/README.md.
const PUBLIC_ROOT = path.resolve(__dirname, '../../public');

const AVAILABLE_ASSETS = BATTLE_ENVIRONMENT_ASSETS.filter((a) => a.status === 'available');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');

// Detected from the file's own magic bytes, independent of the manifest's
// declared `format` — this is what previously caught the container/extension
// mismatch on the two `.webp`-declared assets (see ASSET_CONTRACT.md "Known
// issues"), so it stays a real assertion rather than a trusted assumption.
function detectContainer(buf: Buffer): 'png' | 'webp' {
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.subarray(0, 4).equals(RIFF_SIGNATURE)) return 'webp';
  throw new Error('File is neither a decodable PNG nor a decodable WebP (unrecognized magic bytes).');
}

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

      it('is encoded in its declared format with the declared production dimensions', () => {
        const buf = fs.readFileSync(filePath);
        const container = detectContainer(buf);
        expect(container, `${asset.path} must be a real ${asset.format} file, but decoded as ${container}.`).toBe(
          asset.format,
        );
        const { width, height } = container === 'png' ? readPngHeader(buf) : readWebpHeader(buf);
        expect(width).toBe(asset.productionSize.width);
        expect(height).toBe(asset.productionSize.height);
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
