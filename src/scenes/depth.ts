// Named depth values for BattleScene's top-level containers, translating the
// "Phaser Display Hierarchy" section of
// design/implementation/BATTLE_SCENE_BLUEPRINT.md into constants. Higher
// values render on top. Not every entry is instantiated in every milestone;
// this is the canonical reference table so container order is never guessed.
// BACKGROUND sits below TABLE/LOWER_SURFACE/BOARD_FRAME (2026-07-18 Lot 2
// review fix — reverses the 2026-07-19 ordering): now that the puzzle board
// defines the lower band and battleBackgroundLower is hidden behind the
// temporary lower surface/frame in normal gameplay, the lower band is the
// visually dominant element — any sub-pixel mask-edge imprecision at the
// battleBackgroundUpper/table.y seam must fall harmlessly BEHIND the lower
// band's own visuals rather than paint over them. TABLE still stays below
// MONSTER/HERO/BOARD (2026-07-18 fix) so it can never cover the heroes/boss/
// tiles either.
export const DEPTH = {
  BACKGROUND: -20,
  TABLE: -10,
  LOWER_SURFACE: -9, // Lot 2 temporary plain surface standing in for the hidden battleBackgroundLower
  BOARD_FRAME: -8, // Lot 2 temporary responsive frame around the puzzle's own bounds
  ENVIRONMENT: 10,
  MONSTER: 21,
  HERO: 31,
  BOARD: 50,
  PUZZLE_FEEDBACK: 60,
  HUD: 80,
  TRANSIENT_UI: 90,
  DEBUG: 100,
} as const;
