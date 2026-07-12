# Battle Scene Blueprint

## Purpose

This document translates the combat art target into a scene structure that can be implemented in Phaser 3.

It defines:

- screen regions
- rendering layers
- asset boundaries
- responsive behavior
- runtime responsibilities
- integration constraints

This is an implementation blueprint, not an asset-generation guide.

The existing core puzzle and combat rules remain the source of truth.

---

# Non-Negotiable Constraints

The redesign must preserve:

- the existing 7-column honeycomb grid
- alternating 5 / 4-cell column heights
- the current axial-coordinate adjacency rules
- drag-based chain selection
- portals and colorless special tiles
- chain-reaction resolution
- deterministic seeded RNG
- debug mode through `?debug=1`
- existing unit and Playwright coverage
- the separation between pure TypeScript game logic and Phaser rendering

`BattleScene` must remain a thin presentation and input layer.

No gameplay rule may be moved into the visual implementation.

---

# Composition Regions

The scene is designed for portrait orientation.

Regions intentionally overlap slightly to avoid a stacked mobile-app layout.

Approximate vertical ranges:

```text
0% ───────────────────────────────

    Top contextual information
    Dungeon / floor / boss HP

8% ───────────────────────────────

    Monster arena
    Large monster and environment

34% ──────────────────────────────

    Hero brigade
    Four characters inside the world

46% ──────────────────────────────

    Enchanted preparation table
    Puzzle board

93% ──────────────────────────────

    Minimal utility and safe area

100% ─────────────────────────────
```

These are target ranges, not hard-coded coordinates.

The layout system should calculate final positions from:

- viewport dimensions
- safe-area margins
- puzzle geometry
- minimum interaction size
- aspect ratio

---

# Visual Priorities

## Emotional focus

The monster is the first visual focal point when the scene is idle.

It must:

- dominate the upper scene
- be much larger than an individual hero
- have a strong readable silhouette
- live inside the environment rather than inside a card
- visibly react to attacks and chain reactions

A boss should generally appear at least 1.5 to 2 times taller than a hero, depending on its silhouette.

## Interaction focus

The puzzle board is the largest stable gameplay surface.

It should:

- occupy most of the safe screen width
- use approximately 45–52% of the usable screen height
- remain visually stable during combat animation
- preserve accurate pointer-to-cell mapping
- never be obscured by decoration
- remain readable under every effect and lighting state

## Personality focus

The four heroes stand between the monster and the board.

They must appear as characters inside the scene, not as portrait cards.

Their feet, shadows, and lower silhouettes may visually overlap the rear edge of the preparation table, provided no puzzle cell is covered.

---

# Phaser Display Hierarchy

Use explicit depth groups or scene containers.

Recommended logical order:

```text
Depth 0–9
Background and distant dungeon kitchen

Depth 10–19
Environmental back props
Shelves, lanterns, hanging herbs, distant steam

Depth 20–29
Monster shadow
Monster sprite
Monster-attached effects

Depth 30–39
Hero shadows
Hero sprites
Hero-held props

Depth 40–49
Preparation table base
Board thickness and rear edge

Depth 50–59
Puzzle cells
Tiles
Portals
Special tiles

Depth 60–69
Selection glow
Chain path
Reachability feedback
Tile-clear effects

Depth 70–79
Hero attack effects
Monster hit effects
Combo escalation effects

Depth 80–89
Diegetic combat information
Boss HP
Dungeon information
Hero health indicators

Depth 90–99
Damage values
Combo announcements
Recipe or ingredient notifications

Depth 100+
Debug overlays
Development helpers
Automated-test markers
```

Depth values are illustrative. The implementation may use named constants instead of these exact numbers.

---

# Scene Containers

Prefer a small number of semantic containers.

Suggested structure:

```text
BattleScene
├── backgroundContainer
├── environmentContainer
├── monsterContainer
├── heroContainer
├── boardContainer
├── puzzleFeedbackContainer
├── combatFxContainer
├── hudContainer
├── transientUiContainer
└── debugContainer
```

Each container should have one clear responsibility.

Avoid creating a separate visual container for every minor decoration.

---

# Asset Decomposition

The target image must not become one flattened battle-screen image.

The combat scene should be assembled from independent assets.

## Background

```text
battle_background_base
battle_background_mid_props
battle_background_light_overlay
battle_background_atmosphere
```

The base background should remain coherent even without characters or HUD.

## Monster

```text
monster_<id>_idle
monster_<id>_hit
monster_<id>_stagger
monster_<id>_defeat
monster_<id>_shadow
```

Animation may initially use separate still poses, tweens, or skeletal animation.

The implementation should not assume a specific animation technology yet.

## Heroes

For each hero:

```text
hero_<id>_idle
hero_<id>_ready
hero_<id>_attack
hero_<id>_hit
hero_<id>_victory
hero_<id>_shadow
```

Every hero uses a bottom-center origin unless a later asset specification states otherwise.

## Preparation table

```text
board_table_base
board_table_rear_edge
board_table_front_edge
board_table_foreground_props
```

The puzzle geometry must be positioned independently from painted marks in the table asset.

The table image must never dictate cell centers.

## Puzzle tiles

Tiles remain individual runtime objects.

Every tile needs visually distinct states:

```text
default
hovered
selected
invalid
clearing
special-ready
disabled
```

The state may be expressed with:

- sprite swaps
- tinting
- overlays
- scale
- glow
- particles
- tweens

Do not encode gameplay state into the background asset.

---

# Board Geometry Rules

The pure grid system determines all cell positions.

The renderer converts logical grid coordinates into local board coordinates.

The board asset is fitted around the calculated tile bounds.

Correct direction:

```text
Grid geometry
    ↓
Tile centers
    ↓
Board visual bounds
```

Incorrect direction:

```text
Painted board slots
    ↓
Attempt to force game cells into the illustration
```

The art must adapt to the engine, not the opposite.

---

# Responsive Layout Rules

## Release requirement

The fixed 480x720 canvas is a temporary reference baseline for composition
migration and test stability. It is not the release layout.

Before final-art integration, the battle scene must support responsive portrait
mobile viewports, safe areas, variable aspect ratios, and accurate pointer
mapping across all supported resolutions.

## Width

The board should normally use at least 88% of the available safe width.

Side decorations may extend toward the screen edges, but selectable cells must remain inside safe input bounds.

## Height

The board receives priority over decorative scenery.

When vertical space is limited:

1. reduce nonessential top HUD height
2. crop or scale environmental background
3. reduce decorative gaps
4. slightly reduce hero presentation height
5. only then reduce puzzle size

Never sacrifice tile usability to preserve decorative padding.

## Wide screens

On wider desktop or tablet layouts:

- keep the central portrait composition intact
- reveal additional environment on the sides
- do not stretch the puzzle grid
- do not spread heroes excessively far apart

## Short screens

On short aspect ratios:

- allow background cropping
- compress contextual HUD
- allow controlled overlap between the hero line and board edge
- preserve puzzle width and pointer accuracy

---

# Input Safety

Only puzzle tiles and intended controls receive pointer input.

Decorative sprites must:

- remain non-interactive
- never block pointer events
- never alter drag paths
- never change cell hit areas

Selection logic must continue to use engine cell coordinates rather than visible sprite alpha or painted tile boundaries.

---

# UI Integration

The HUD should be minimal and diegetic.

Allowed information includes:

- monster name
- monster progress or HP
- dungeon and floor
- combo depth
- hero health or readiness
- temporary battle objectives
- ingredient rewards

Avoid:

- full-width card containers
- nested rectangular panels
- large empty headers
- repeated borders
- permanent information that is not useful during a turn

Information should appear attached to physical objects when clarity permits:

- carved signs
- parchment labels
- cookware
- hanging tags
- recipe clips

The physical metaphor must never make information harder to read.

---

# Runtime Motion Responsibilities

The scene should expose clear visual events for:

```text
drag_started
tile_added_to_chain
tile_removed_from_chain
chain_validated
chain_rejected
resolution_started
hero_action_started
monster_hit
special_tile_triggered
combo_depth_changed
resolution_completed
monster_defeated
```

These presentation events must react to core-engine results.

They must not decide gameplay outcomes.

---

# Placeholder Strategy

The layout should be implemented before final art exists.

Placeholders may use:

- simple colored silhouettes
- flat temporary sprites
- labeled rectangles during development
- temporary procedural shadows
- basic gradients

However, placeholders must already respect:

- final approximate bounds
- anchors and origins
- intended layer order
- responsive behavior
- overlap rules

A placeholder should represent the future asset’s footprint, not merely its meaning.

---

# Debug Mode

The existing `?debug=1` mode must remain operational.

Debug visuals must be isolated inside `debugContainer`.

Useful optional debug overlays include:

- safe-area bounds
- composition regions
- tile hit areas
- grid coordinates
- sprite origins
- container bounds
- depth labels
- monster and hero anchor points

Debug elements must never appear in normal play.

---

# Acceptance Criteria

The first composition implementation succeeds when:

- the puzzle uses most of the available width
- all current puzzle interactions remain accurate
- the board retains its real 7-column geometry
- the monster is visually dominant
- the four heroes appear physically inside the scene
- the screen no longer resembles a stack of mobile UI cards
- no decorative object obscures a selectable cell
- the layout adapts to portrait aspect ratios
- debug mode still works
- all existing unit and Playwright tests pass
- no gameplay logic has moved into `BattleScene`

Final art, detailed animation, and visual polish are not required for this milestone.