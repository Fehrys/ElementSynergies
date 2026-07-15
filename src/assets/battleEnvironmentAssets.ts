// Central manifest of the six Lot 1 combat-environment assets. The files DO
// NOT EXIST yet — this is inert data (single source of truth for keys/paths,
// mirrored 1:1 by design/production/combat/lot-01-environment/ASSET_CONTRACT.md)
// and must NOT be fed to this.load.image() until the exports are produced and
// validated. Never scatter these paths into BattleScene.ts.
//
// Placement geometry deliberately does NOT live here: it is computed at
// runtime from the validated BattleLayout by scenes/battleEnvironmentLayout.ts
// (whose placements' origins must match each definition's `anchor` — unit-
// tested in tests/scenes/battleEnvironmentLayout.test.ts).
import { DEPTH } from '../scenes/depth';

export type BattleEnvironmentRole =
  | 'upperArchitecture'
  | 'stoneFloor'
  | 'leftHearth'
  | 'rightLarder'
  | 'prepTableBase'
  | 'cuttingBoard';

// How the asset follows the viewport (see ASSET_CONTRACT.md for the prose):
// - viewportCover: single isotropic cover fit of a viewport-wide band; may
//   overflow/crop laterally, never stretched (upper architecture).
// - viewportBand: full viewport width, height bound to a semantic band of the
//   layout (stone floor, preparation base).
// - edgeCluster: anchored to a viewport edge, uniform scale, compresses/crops
//   before ever influencing the gameplay column (hearth, larder).
// - gameplayColumnObject: centered on the gameplay column, sized from the
//   board's tile bounds + margins, uniform scale only (cutting board).
export type EnvironmentResponsivePolicy = 'viewportCover' | 'viewportBand' | 'edgeCluster' | 'gameplayColumnObject';

// Recommended dimensions of the PRODUCTION MASTER file (see ASSET_CONTRACT.md
// "Production source dimensions"). Purely documentary and testable — never a
// runtime coordinate, never a reason to load anything. `aspectRatio` is the
// contract's rounded width/height (consistency unit-tested).
export interface ProductionSize {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface BattleEnvironmentAssetDefinition {
  key: string; // future Phaser texture key
  path: string; // final public URL path the produced file will ship at
  role: BattleEnvironmentRole;
  format: 'webp' | 'png';
  alphaRequired: boolean; // png ⇔ true (true transparency), webp ⇔ false (opaque)
  anchor: { x: number; y: number }; // Phaser origin the future sprite will use
  responsivePolicy: EnvironmentResponsivePolicy;
  depth: number; // conceptual layer from scenes/depth.ts (ties within a depth: manifest order = draw order)
  productionSize: ProductionSize;
}

const ENVIRONMENT_ROOT = '/assets/battle/environment';

export const BATTLE_ENVIRONMENT_ASSETS: readonly BattleEnvironmentAssetDefinition[] = [
  {
    key: 'battle-env-arch-upper',
    path: `${ENVIRONMENT_ROOT}/architecture/battle_bg_arch_upper.webp`,
    role: 'upperArchitecture',
    format: 'webp',
    alphaRequired: false,
    anchor: { x: 0.5, y: 0 },
    responsivePolicy: 'viewportCover',
    depth: DEPTH.BACKGROUND,
    productionSize: { width: 1536, height: 1024, aspectRatio: 1.5 },
  },
  {
    key: 'battle-env-floor-stone',
    path: `${ENVIRONMENT_ROOT}/floor/battle_floor_stone.webp`,
    role: 'stoneFloor',
    format: 'webp',
    alphaRequired: false,
    anchor: { x: 0.5, y: 0 },
    responsivePolicy: 'viewportBand',
    depth: DEPTH.BACKGROUND,
    productionSize: { width: 1536, height: 512, aspectRatio: 3 },
  },
  {
    key: 'battle-env-left-hearth',
    path: `${ENVIRONMENT_ROOT}/props/left/battle_left_hearth_cluster.png`,
    role: 'leftHearth',
    format: 'png',
    alphaRequired: true,
    anchor: { x: 0, y: 1 },
    responsivePolicy: 'edgeCluster',
    depth: DEPTH.ENVIRONMENT,
    productionSize: { width: 640, height: 1200, aspectRatio: 0.533 },
  },
  {
    key: 'battle-env-right-larder',
    path: `${ENVIRONMENT_ROOT}/props/right/battle_right_larder_cluster.png`,
    role: 'rightLarder',
    format: 'png',
    alphaRequired: true,
    anchor: { x: 1, y: 1 },
    responsivePolicy: 'edgeCluster',
    depth: DEPTH.ENVIRONMENT,
    productionSize: { width: 640, height: 1200, aspectRatio: 0.533 },
  },
  {
    key: 'battle-env-prep-table-base',
    path: `${ENVIRONMENT_ROOT}/preparation/battle_prep_table_base.webp`,
    role: 'prepTableBase',
    format: 'webp',
    alphaRequired: false,
    anchor: { x: 0, y: 0 },
    responsivePolicy: 'viewportBand',
    depth: DEPTH.TABLE,
    productionSize: { width: 1536, height: 1280, aspectRatio: 1.2 },
  },
  {
    key: 'battle-env-cutting-board',
    path: `${ENVIRONMENT_ROOT}/preparation/battle_prep_cutting_board.png`,
    role: 'cuttingBoard',
    format: 'png',
    alphaRequired: true,
    anchor: { x: 0.5, y: 0.5 },
    responsivePolicy: 'gameplayColumnObject',
    depth: DEPTH.TABLE,
    productionSize: { width: 1434, height: 1000, aspectRatio: 1.434 },
  },
];

export function environmentAssetByRole(role: BattleEnvironmentRole): BattleEnvironmentAssetDefinition {
  const def = BATTLE_ENVIRONMENT_ASSETS.find((a) => a.role === role);
  if (!def) throw new Error(`No battle environment asset defined for role "${role}"`);
  return def;
}
