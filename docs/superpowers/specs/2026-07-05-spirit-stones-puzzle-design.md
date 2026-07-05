# Spirit Stones Puzzle Mechanic Remake — Design

**Date:** 2026-07-05
**Status:** Approved for planning

## Goal

Build a vertical-slice prototype of the core puzzle mechanic from the mobile gacha game *Spirit Stones*: a free-form same-color chain-connect puzzle (as opposed to swap-based match-3), wired to a minimal RPG combat outcome — clearing chains damages a monster until it dies. Character/gacha/meta systems beyond the minimum needed to make the puzzle feel connected to "killing a monster" are explicitly deferred.

## Reference

`spirit_stone.png` (in repo root) shows the original game's honeycomb board, character portraits, monster row, and special orb icons (bomb, lightning, arrow, sword). This prototype reproduces the honeycomb board and the chain-connect feel, but scopes down the RPG/meta layer significantly (see Out of Scope).

## Tech Stack

- **Phaser 3 + TypeScript** for rendering and input (touch + mouse), targeting web with mobile-compatible touch handling.
- **Vitest** for unit-testing the core puzzle/combat logic in isolation (no browser).
- **Playwright** for e2e tests of the actual drag interaction and battle flow in-browser.

## Architecture

Pure logic is fully decoupled from rendering so the puzzle engine — the risky, novel part of this project — is fast to test and reason about independently of Phaser.

```
src/
  core/          # pure TS, no Phaser dependency
    grid.ts        # hex grid state, axial coordinates, neighbor lookup
    chain.ts       # chain-path validation, portal split logic
    match.ts       # resolves a finished chain/cascade into clear + damage events
    refill.ts      # gravity/fall + spawn logic, cascade detection loop
    combat.ts      # character roster, damage formula, monster HP, dead-color handling
  scenes/        # Phaser 3 scenes — rendering + input only
    TeamSelectScene.ts # pre-battle 4-of-5 character picker
    BattleScene.ts     # renders grid + monster + characters, forwards pointer events to core
  main.ts        # Phaser game bootstrap
tests/
  core/*.test.ts   # Vitest unit tests for all core logic
  e2e/*.spec.ts    # Playwright drag-interaction and flow tests
```

## Grid

- Honeycomb (hex-packed) layout, staggered rows alternating 4/5 columns, 7 rows total (~38 cells), matching the reference screenshot's proportions.
- Internally represented with **axial coordinates** (q, r) for clean hex neighbor math (up to 6 neighbors per cell). A single axial→pixel conversion function handles the visual 4/5 row stagger at render time; the data model itself doesn't encode the offset.
- Each cell holds either a colored stone (one of 5 elements: Fire/Red, Water/Blue, Nature/Green, Light/Yellow, Dark/Purple) or the rainbow portal orb.

## Chain Mechanic

- Player presses a stone, drags across hex-adjacent same-color stones, releases to commit the chain.
- **Minimum chain length: 3.** Path cannot revisit or cross a cell already used in the current chain.
- No loop-bonus mechanic (considered and explicitly rejected — see Rejected Ideas).

## Rainbow Portal Orb

- A special tile that bridges a chain between two different colors in one continuous drag.
- Resolves as **two independently-scored sub-chains** sharing the portal cell: e.g. 3 blue stones + portal + 2 red stones = a length-4 blue sub-chain and a length-3 red sub-chain (portal counts toward both), each scored and cleared independently, both triggering their respective character's damage.
- Applies only to **manually-drawn chains**. Portal cells are ignored during automatic cascade detection (see below) to keep that logic unambiguous.
- Visual: animated multicolor vortex sprite — a rendering detail (shader/tween effect), not a game-rule concern.

## Board Refill & Cascades

- After a chain clears, cells above each gap fall toward the bottom along the hex grid's natural down-neighbor direction; new random stones (weighted across the 5 base colors, with the portal orb spawning rarely) fill the emptied top cells.
- After each fall, the engine checks for **incidental groups of 3+ adjacent same-color stones** formed purely by the fall (no player input) and auto-clears them.
- Automatic cascade matches deal damage using the same formula as manual chains, but scaled by a **damping multiplier that shrinks with cascade depth**: depth 1 → ×0.25, depth 2 → ×0.125, depth 3 → ×0.0625 (halving each further step). This guarantees a manually-drawn chain always outscores an equivalent-length cascade, while still rewarding setups that trigger chain reactions.
- After an auto-clear, the board refalls and the cascade check repeats (incrementing depth) until no further auto-matches are found, then control returns to the player.

## Combat Layer

**Roster:** 5 fixed characters, one per color/element, each with only an **ATK** stat (no skills — see Out of Scope). No gacha, no leveling.

**Team Select:** Before a battle, a simple screen shows all 5 characters; the player picks exactly **4** to bring into the fight (tap to select, confirm with a "Start Battle" button — no drag, no ordering).

**Dead color rule:** The one color whose character was *not* picked becomes that battle's dead color. Its stones still appear, chain (min length 3), and cascade normally, but any damage calculation for that color always resolves to **0** — the player must still clear/manage it, but scores nothing from it. This rule lives in exactly one place (character lookup by color returns null → damage 0 in `combat.ts`), applied uniformly to manual chains, portal sub-chains, and cascades.

**Damage formula:**
```
damage = character.ATK × chainLength × cascadeDamping
```
- `cascadeDamping` is 1.0 for manual chains; for automatic cascades it's the depth-based multiplier described above (0.25 / 0.125 / 0.0625...).
- A portal-bridged chain doesn't need a separate combo multiplier: it already yields two independently-scored damage instances (one per sub-chain), which is itself the reward for bridging.
- If the color has no assigned character this battle (dead color), damage is 0 regardless of the other terms.

**Battle flow:**
- Single scene, single monster with an HP bar. No player HP, no monster attack-back, no move limit, no timer.
- Loop: player draws a chain → damage resolves (including any resulting cascades) → repeat until monster HP reaches 0 → Victory state (simple screen/log, no meta-progression).

## Testing Strategy

- **Vitest**: axial-grid neighbor math, chain validation (adjacency, min-length-3, no-revisit), portal sub-chain splitting, cascade detection and depth-damping, damage formula (including dead-color-returns-0), refill/gravity correctness.
- **Playwright**: real drag-to-chain interaction in-browser, team-select flow, and confirming monster HP drops as expected — verifying the Phaser rendering layer is correctly wired to the core engine.

## Rejected Ideas

- **Loop bonus** (clearing all stones of a color on-board when a chain path loops back near its start): part of the original game's identity, but rejected for this slice due to anticipated implementation/balance problems. May be revisited later.
- **Elemental advantage triangle**: deferred until there are multiple differentiated monster types worth balancing against.
- **Monster attack-back / player HP**: deferred — this slice is focused purely on validating the puzzle-to-damage loop, not fight tension.

## Out of Scope

- Gacha/summoning, currency, meta-progression, multiple stages or monster sequences
- Elemental advantage triangle (monster is neutral)
- Monster attacking back / player HP
- Character skills of any kind (roster has ATK only, no skill hooks) — deferred to focus entirely on the puzzle mechanic
- Special tiles other than the rainbow portal orb (no bombs/lightning/etc. from the reference screenshot)
- Any persistence/save system
