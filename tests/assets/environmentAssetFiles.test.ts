import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BATTLE_ENVIRONMENT_ASSETS } from '../../src/assets/battleEnvironmentAssets';
import type { AvailableBattleEnvironmentAsset } from '../../src/assets/battleEnvironmentAssets';
import { readWebpHeader } from './webpHeader';

// Validates the two Lot 1 environment background assets against the
// manifest: existence at the declared path, real WebP signature, and
// dimensions matching `productionSize` — but ONLY for entries whose `status`
// is 'available'. A 'pending' asset's draft file (if one happens to sit at
// its path, e.g. the current battle_bg_upper.webp) is never treated as a
// final, validated asset — only a human flipping the manifest's `status` to
// 'available' (with the file's real measured productionSize) does that. See
// design/production/combat/lot-01-environment/README.md.
const PUBLIC_ROOT = path.resolve(__dirname, '../../public');

const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');

function isWebp(buf: Buffer): boolean {
  return buf.subarray(0, 4).equals(RIFF_SIGNATURE);
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

  it('currently has zero available assets — both backgrounds are still pending', () => {
    // This assertion documents today's true state; it is expected to change
    // (and must be updated) the day a human marks a background 'available'.
    expect(BATTLE_ENVIRONMENT_ASSETS.filter(isAvailable)).toHaveLength(0);
  });

  for (const asset of BATTLE_ENVIRONMENT_ASSETS.filter(isAvailable)) {
    describe(`${asset.role} (${asset.path})`, () => {
      const filePath = path.join(PUBLIC_ROOT, asset.path.replace(/^\//, ''));

      it('exists on disk at the manifest path', () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it('is a real WebP file with the declared production dimensions', () => {
        const buf = fs.readFileSync(filePath);
        expect(isWebp(buf), `${asset.path} must be a real WebP file.`).toBe(true);
        const { width, height } = readWebpHeader(buf);
        expect(width).toBe(asset.productionSize.width);
        expect(height).toBe(asset.productionSize.height);
      });
    });
  }
});
