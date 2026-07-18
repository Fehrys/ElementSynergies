// Named depth values for BattleScene's top-level containers, translating the
// "Phaser Display Hierarchy" section of
// design/implementation/BATTLE_SCENE_BLUEPRINT.md into constants. Higher
// values render on top. Not every entry is instantiated in every milestone;
// this is the canonical reference table so container order is never guessed.
// TABLE sits below MONSTER/HERO (2026-07-18 Lot 2 review fix): the lower
// battle-environment background now renders a full opaque painting across
// the whole prep band, not a thin table-edge lip — so it must never be able
// to render in front of the heroes/boss even if one of their placeholder
// footprints temporarily extends into that band. It still stays below BOARD
// so tiles always draw over it.
export const DEPTH = {
  BACKGROUND: 0,
  ENVIRONMENT: 10,
  TABLE: 15,
  MONSTER: 21,
  HERO: 31,
  BOARD: 50,
  PUZZLE_FEEDBACK: 60,
  HUD: 80,
  TRANSIENT_UI: 90,
  DEBUG: 100,
} as const;
