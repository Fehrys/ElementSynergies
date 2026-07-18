// Named depth values for BattleScene's top-level containers, translating the
// "Phaser Display Hierarchy" section of
// design/implementation/BATTLE_SCENE_BLUEPRINT.md into constants. Higher
// values render on top. Not every entry is instantiated in every milestone;
// this is the canonical reference table so container order is never guessed.
// TABLE sits below BACKGROUND (2026-07-19 review fix): battleBackgroundLower
// must render strictly BEHIND battleBackgroundUpper, not in front of it — the
// two are confined to disjoint bands by their own GeometryMasks, but any
// sub-pixel mask-edge imprecision at their shared seam must fall harmlessly
// behind the upper painting rather than paint over it. TABLE also still stays
// below MONSTER/HERO/BOARD (2026-07-18 fix) so it can never cover the
// heroes/boss/tiles either.
export const DEPTH = {
  TABLE: -10,
  BACKGROUND: 0,
  ENVIRONMENT: 10,
  MONSTER: 21,
  HERO: 31,
  BOARD: 50,
  PUZZLE_FEEDBACK: 60,
  HUD: 80,
  TRANSIENT_UI: 90,
  DEBUG: 100,
} as const;
