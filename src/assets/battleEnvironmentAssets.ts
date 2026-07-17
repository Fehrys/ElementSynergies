// Central manifest of the five Lot 1 combat-environment assets (mirrored 1:1
// by design/production/combat/lot-01-environment/ASSET_CONTRACT.md). Three of
// the five are produced and live at their final `path` under
// public/assets/battle/environment/ (see `status: 'available'`); the two prop
// clusters are still awaiting production (`status: 'pending'`) and MUST NOT be
// fed to this.load.image() — see environmentAssetByRole()'s callers. Never
// scatter these paths into BattleScene.ts.
//
// Placement geometry deliberately does NOT live here: it is computed at
// runtime from the validated BattleLayout by scenes/battleEnvironmentLayout.ts
// (whose placements' origins must match each definition's `anchor` — unit-
// tested in tests/scenes/battleEnvironmentLayout.test.ts).
import { DEPTH } from '../scenes/depth';

export type BattleEnvironmentRole =
  | 'battleBackgroundUpper'
  | 'prepTableBase'
  | 'cuttingBoard'
  | 'leftHearth'
  | 'rightLarder';

// Whether the produced file already exists at `path` and has been validated
// (see tests/assets/environmentAssetFiles.test.ts), or is still awaiting
// production. Deliberately a plain two-value status, not a bigger asset-
// pipeline model: this manifest only ever needs to answer "is it there yet?".
export type BattleEnvironmentAssetStatus = 'available' | 'pending';

// How the asset follows the viewport (see ASSET_CONTRACT.md for the prose):
// - viewportCover: single isotropic cover fit of a viewport-wide band; may
//   overflow/crop laterally, never stretched (the upper background+floor).
// - viewportBand: full viewport width, height bound to a semantic band of the
//   layout (preparation base).
// - edgeCluster: anchored to a viewport edge, uniform scale, compresses/crops
//   before ever influencing the gameplay column (hearth, larder).
// - gameplayColumnObject: centered on the gameplay column, sized from the
//   board's tile bounds + margins, uniform scale only (cutting board).
export type EnvironmentResponsivePolicy = 'viewportCover' | 'viewportBand' | 'edgeCluster' | 'gameplayColumnObject';

// For `available` assets: the file's REAL measured dimensions (see
// ASSET_CONTRACT.md "Production source dimensions" — measured from the actual
// PNG/WebP header, never a fictional target). For `pending` assets: the
// recommended target dimensions for the future export. Purely documentary and
// testable — never a runtime coordinate, never a reason to load anything.
// `aspectRatio` is the contract's rounded width/height (consistency unit-tested).
export interface ProductionSize {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface BattleEnvironmentAssetDefinition {
  key: string; // future Phaser texture key
  path: string; // final public URL path the produced file ships at (or will ship at)
  role: BattleEnvironmentRole;
  format: 'webp' | 'png';
  alphaRequired: boolean; // png ⇔ true (true transparency), webp ⇔ false (opaque)
  anchor: { x: number; y: number }; // Phaser origin the future sprite will use
  responsivePolicy: EnvironmentResponsivePolicy;
  depth: number; // conceptual layer from scenes/depth.ts (ties within a depth: manifest order = draw order)
  productionSize: ProductionSize;
  status: BattleEnvironmentAssetStatus;
}

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
    // Real measured dimensions (see tests/assets/environmentAssetFiles.test.ts).
    productionSize: { width: 1536, height: 1024, aspectRatio: 1.5 },
    status: 'available',
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
    // Real measured dimensions (see tests/assets/environmentAssetFiles.test.ts).
    productionSize: { width: 1374, height: 1145, aspectRatio: 1.2 },
    status: 'available',
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
    // Real measured dimensions (see tests/assets/environmentAssetFiles.test.ts).
    productionSize: { width: 1064, height: 1044, aspectRatio: 1064 / 1044 },
    status: 'available',
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
    // Recommended target dimensions — not yet produced.
    productionSize: { width: 640, height: 1200, aspectRatio: 0.533 },
    status: 'pending',
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
    // Recommended target dimensions — not yet produced.
    productionSize: { width: 640, height: 1200, aspectRatio: 0.533 },
    status: 'pending',
  },
];

export function environmentAssetByRole(role: BattleEnvironmentRole): BattleEnvironmentAssetDefinition {
  const def = BATTLE_ENVIRONMENT_ASSETS.find((a) => a.role === role);
  if (!def) throw new Error(`No battle environment asset defined for role "${role}"`);
  return def;
}
