# Spirit Stones Puzzle Mechanic Remake — Design

**Date:** 2026-07-05
**Revised:** 2026-07-06 — corrected core combo model and special tiles against actual memory of the game
**Status:** Approved for planning

## Goal

Build a vertical-slice prototype of the core puzzle mechanic from the mobile gacha game *Spirit Stones*: a free-form same-color chain-connect puzzle (as opposed to swap-based match-3), wired to a minimal RPG combat outcome — clearing chains and triggering special tiles damages a monster until it dies. Character/gacha/meta systems beyond the minimum needed to make the puzzle feel connected to "killing a monster" are explicitly deferred.

## Reference

`spirit_stone.png` (in repo root) shows the original game's honeycomb board, character portraits, monster row, and special orb icons (bomb, lightning, arrow, sword). This prototype reproduces the honeycomb board, the chain-connect feel, and the special-tile combo system, but scopes down the RPG/meta layer significantly (see Out of Scope).

## Tech Stack

- **Phaser 3 + TypeScript** for rendering and input (touch + mouse), targeting web with mobile-compatible touch handling.
- **Vitest** for unit-testing the core puzzle/combat logic in isolation (no browser).
- **Playwright** for e2e tests of the actual drag interaction and battle flow in-browser.

## Architecture

Pure logic is fully decoupled from rendering so the puzzle engine — the risky, novel part of this project — is fast to test and reason about independently of Phaser.

```
src/
  core/          # pure TS, no Phaser dependency
    grid.ts          # hex grid state, axial coordinates, neighbor lookup
    chain.ts         # chain-path validation, colorless special-tile pickup, portal bridging
    specialTiles.ts  # per-tile-type affected-cells computation (bomb/sword/bow/dynamite/double sword/double arrow bow)
    resolution.ts    # orchestrates manual chain resolve -> refill -> special-tile wave loop -> refill, tracks combo depth
    refill.ts        # gravity + fill; random spawn-chance rolls for base tiles + portal; combo-depth-3 bonus placement
    combat.ts        # 4-character roster, damage formula, monster HP
  scenes/        # Phaser 3 scenes — rendering + input only
    BattleScene.ts     # only scene — battle starts immediately with all 4 characters, renders grid + monster
  main.ts        # Phaser game bootstrap
tests/
  core/*.test.ts   # Vitest unit tests for all core logic
  e2e/*.spec.ts    # Playwright drag-interaction and flow tests
```

## Grid

- Honeycomb (hex-packed) layout, staggered rows alternating 5/4 columns, 7 rows total (32 cells), matching the reference screenshot's proportions.
- Internally represented with **axial coordinates** (q, r) for clean hex neighbor math (up to 6 neighbors per cell). A single axial→pixel conversion function handles the visual 5/4 row stagger at render time; the data model itself doesn't encode the offset.
- Each cell holds a colored stone (one of 4 elements: Red/Warrior, Green/Archer, Yellow/Rogue, Blue/Mage), a special tile, or the rainbow portal orb.

## Chain Mechanic

- Player presses a stone, drags across hex-adjacent same-color stones, releases to commit the chain.
- **Minimum chain length: 3.** Path cannot revisit or cross a cell already used in the current chain.
- No loop-bonus mechanic (considered and explicitly rejected — see Rejected Ideas).
- **Special tiles are colorless.** A special tile adjacent to the current chain path can be picked up mid-drag as if it were part of the chain (satisfies adjacency, doesn't break the chain), regardless of the chain's color. However, a special tile does **not** bridge two different colors — if the drag continues onto a different color after the special tile, the chain simply ends there. Only the portal orb can bridge colors.

## Special Tiles

Destroying a special tile deals no damage by itself — only the colored stones an effect actually destroys deal damage (grouped by color, `ATK × count`, no damping, regardless of wave depth — see Refill & Combo Resolution).

### Base tiles
Spawn via a small independent random chance on each refilled cell (same mechanism as the portal orb).

| Tile | Effect |
|---|---|
| **Bomb** | Destroys itself + all hex-neighbors (radius 1, ≤7 cells) |
| **Sword** | Destroys the full line through its cell along **one** diagonal hex axis — whichever of the 2 diagonal axes has more cells to destroy from that position |
| **Bow** | Destroys 8 random distinct cells anywhere on the board |

### Improved tiles
Spawn **only** when a resolution's combo depth reaches ≥3 (see below). On trigger, exactly one of the three is chosen at random, independent of which base tiles caused the combo, and placed into a random cell after that wave's refill.

| Tile | Effect |
|---|---|
| **Dynamite** (improved bomb) | Destroys its entire column + the two adjacent columns (full height, 3 columns) |
| **Double Sword** (improved sword) | Destroys full lines through its cell along **both** diagonal hex axes |
| **Double Arrow Bow** (improved bow) | Destroys 16 random distinct cells anywhere on the board |

### Portal Orb (unchanged)
- Manual-chain only: bridges a drag between two different colors into **two independently-scored sub-chains** sharing the portal cell (e.g. 3 blue + portal + 2 red = a length-4 blue sub-chain and a length-3 red sub-chain, each scored and cleared independently).
- Has its own separate random spawn chance during refill, unaffected by the special-tile rework.
- Ignored during special-tile wave resolution (it only matters for manual chains).

## Refill & Combo Resolution

There is **no automatic same-color matching**. After a chain (or wave) clears, the board refills purely mechanically (fall + fill gaps) — no scan for incidental same-color groups. The only source of chain reactions is special tiles:

1. **Wave 1 (manual):** the player releases a chain, collecting any special tiles touched along the path. The chain clears; damage is dealt immediately (full value, per color).
2. **Refill** (gravity + fill gaps; each newly filled cell independently rolls its small chance to become a base tile or portal orb).
3. **Wave N (N ≥ 2):** every special tile queued from the previous wave fires **simultaneously**, each computing its affected cells against the *current* (just-refilled) board snapshot. The union of all affected cells across tiles firing this wave is destroyed together; damage is dealt per color (full `ATK × count`, no damping — combos should fully reward the player since special tiles are comparatively rare).
4. **Refill again.**
5. If any cell just destroyed held a special tile, that tile is queued to fire in the next wave. Repeat from step 3 until a wave destroys zero special tiles.
6. **Combo depth** = number of waves reached in this resolution (wave 1 = depth 1, wave 2 = depth 2, ...). When depth reaches ≥3, spawn one random improved tile (see above) into a random cell once that wave's refill completes.

## Combat Layer

**Roster:** 4 fixed characters, one per color, 1:1 mapping, each with only an **ATK** stat (no skills — see Out of Scope). No gacha, no leveling.

- Red → Warrior
- Green → Archer
- Yellow → Rogue
- Blue → Mage

No team-select screen — all 4 characters are always in the fight, and battle starts immediately. There is no unused/"dead" color; every color always has an active character.

**Damage formula:**
```
damage = character.ATK × count
```
- For a manual chain, `count` is the chain length.
- For a special-tile wave, `count` is the number of stones of that color destroyed by that wave's effects.
- No damping factor at any wave depth.

**Battle flow:**
- Single scene, single monster with an HP bar. No player HP, no monster attack-back, no move limit, no timer.
- Loop: player draws a chain → full resolution runs (chain clear + any resulting special-tile waves) → repeat until monster HP reaches 0 → Victory state (simple screen/log, no meta-progression).

## Testing Strategy

- **Vitest**: axial-grid neighbor math; chain validation (adjacency, min-length-3, no-revisit, colorless special-tile insertion without color-bridging, portal bridging); each special tile's affected-cell computation (bomb radius, sword favorable-axis selection, bow/double-arrow-bow random distinct-cell sampling, dynamite/column range, double sword); the wave-resolution loop (queuing, re-triggering, combo depth counting, no-damping damage); spawn rng (base-tile/portal refill chance, combo-depth-3 improved-tile bonus); damage formula.
- **Playwright**: real drag-to-chain interaction in-browser, multi-wave chain reactions, and confirming monster HP drops as expected — verifying the Phaser rendering layer is correctly wired to the core engine.

## Rejected Ideas

- **Loop bonus** (clearing all stones of a color on-board when a chain path loops back near its start): part of the original game's identity, but rejected for this slice due to anticipated implementation/balance problems. May be revisited later.
- **Elemental advantage triangle**: deferred until there are multiple differentiated monster types worth balancing against.
- **Monster attack-back / player HP**: deferred — this slice is focused purely on validating the puzzle-to-damage loop, not fight tension.
- **Auto-match-on-refill / cascade detection**: initially designed in, but rejected — not how the real game works. Replaced entirely by the special-tile-driven combo wave model above.
- **Spellbook special tile**: initially proposed, then removed — not part of the actual mechanic being remade.
- **5th color / dead-color / team-select mechanic**: initially designed in, then removed — the real game has exactly 4 colors, so there's no unused color to manage. Team/roster selection may return in a future version if the roster ever grows beyond 4 characters.
- **Damage damping per combo/wave depth**: considered (mirroring the old cascade-damping idea) but rejected — special tiles are comparatively rare, so combos should fully reward the player rather than being discounted.
- **Bonus special-tile spawn from long chains (≥5)**: considered, then rejected — chain length is already rewarded via the damage formula; no need for a second reward channel.

## Out of Scope

- Gacha/summoning, currency, meta-progression, multiple stages or monster sequences
- Elemental advantage triangle (monster is neutral)
- Monster attacking back / player HP
- Character skills of any kind (roster has ATK only, no skill hooks) — deferred to focus entirely on the puzzle mechanic
- Team/roster selection screen (all 4 characters always fight together in v1; may return if the roster grows beyond 4)
- Any persistence/save system
