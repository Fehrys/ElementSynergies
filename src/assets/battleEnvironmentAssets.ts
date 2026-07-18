// Central manifest of the two Lot 1 combat-environment background assets
// (mirrored 1:1 by design/production/combat/lot-01-environment/ASSET_CONTRACT.md).
// Both are `status: 'available'` — the final illustrations are deposited at
// `path` and validated by tests/assets/environmentAssetFiles.test.ts — but
// MUST STILL NOT be fed to this.load.image() from BattleScene.ts: loading
// them into the normal Phaser scene is a separate, later integration lot.
//
// Placement geometry deliberately does NOT live here: it is computed at
// runtime from the validated BattleLayout by scenes/battleEnvironmentLayout.ts
// (whose placements' origins must match each definition's `anchor` — unit-
// tested in tests/scenes/battleEnvironmentLayout.test.ts).
import { DEPTH } from '../scenes/depth';

export type BattleEnvironmentRole = 'battleBackgroundUpper' | 'battleBackgroundLower';

// How the asset follows the viewport (see ASSET_CONTRACT.md for the prose):
// both backgrounds cover-fit their full-width band with a single isotropic
// scale, never stretched — the only responsive policy left once the
// separately-placed table, cutting board and two prop clusters were folded
// into these two full-band paintings.
export type EnvironmentResponsivePolicy = 'viewportCover';

export interface ProductionSize {
  width: number;
  height: number;
  aspectRatio: number;
}

interface BattleEnvironmentAssetBase {
  key: string; // future Phaser texture key
  path: string; // final public URL path the produced file ships at (or will ship at)
  role: BattleEnvironmentRole;
  format: 'webp';
  alphaRequired: false; // both backgrounds are opaque paintings
  anchor: { x: number; y: number }; // Phaser origin the future sprite will use
  responsivePolicy: EnvironmentResponsivePolicy;
  depth: number; // conceptual layer from scenes/depth.ts (ties within a depth: manifest order = draw order)
}

// A draft file may already sit at a 'pending' asset's `path` (see
// ASSET_CONTRACT.md) — that alone never promotes it. Only changing `status`
// to 'available' together with the file's real, measured `productionSize`
// marks a background as final; tests/assets/environmentAssetFiles.test.ts
// validates the shipped file against `productionSize` for 'available'
// entries only.
export interface AvailableBattleEnvironmentAsset extends BattleEnvironmentAssetBase {
  status: 'available';
  productionSize: ProductionSize; // real, measured dimensions
}

export interface PendingBattleEnvironmentAsset extends BattleEnvironmentAssetBase {
  status: 'pending';
  targetSize: ProductionSize; // recommended target — not yet measured or validated
}

export type BattleEnvironmentAssetDefinition = AvailableBattleEnvironmentAsset | PendingBattleEnvironmentAsset;

const ENVIRONMENT_ROOT = '/assets/battle/environment';

export const BATTLE_ENVIRONMENT_ASSETS: readonly BattleEnvironmentAssetDefinition[] = [
  {
    key: 'battle-env-bg-upper',
    path: `${ENVIRONMENT_ROOT}/background/battle_bg_upper.webp`,
    role: 'battleBackgroundUpper',
    format: 'webp',
    alphaRequired: false,
    anchor: { x: 0.5, y: 0 },
    responsivePolicy: 'viewportCover',
    depth: DEPTH.BACKGROUND,
    status: 'available',
    // Real, measured dimensions (VP8L header) — see ASSET_CONTRACT.md Asset 1
    // and tests/assets/environmentAssetFiles.test.ts.
    productionSize: { width: 1536, height: 1024, aspectRatio: 1.5 },
  },
  {
    key: 'battle-env-bg-lower',
    path: `${ENVIRONMENT_ROOT}/background/battle_bg_lower.webp`,
    role: 'battleBackgroundLower',
    format: 'webp',
    alphaRequired: false,
    anchor: { x: 0.5, y: 0 },
    responsivePolicy: 'viewportCover',
    depth: DEPTH.TABLE,
    status: 'available',
    // Real, measured dimensions (VP8L header) — see ASSET_CONTRACT.md Asset 2
    // and tests/assets/environmentAssetFiles.test.ts.
    productionSize: { width: 1536, height: 1280, aspectRatio: 1.2 },
  },
];

export function environmentAssetByRole(role: BattleEnvironmentRole): BattleEnvironmentAssetDefinition {
  const def = BATTLE_ENVIRONMENT_ASSETS.find((a) => a.role === role);
  if (!def) throw new Error(`No battle environment asset defined for role "${role}"`);
  return def;
}
