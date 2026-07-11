# Broth & Blade — Combat Art Target

## Purpose

This document defines the visual target for the combat presentation of Broth & Blade.

Reference image:

`design/references/combat-art-target.png`

The reference is not a final production screen and should not be copied pixel for pixel.

It defines the desired level of:

- immersion
- visual density
- environmental storytelling
- material depth
- character presence
- cooking identity
- integrated interface
- premium game presentation

The goal is to reproduce what the reference makes the player feel, while respecting the real gameplay, board geometry, responsive layout, and technical constraints of the project.

---

## Target Experience

The combat screen should feel like a playable fantasy illustration.

The player should feel as though they are leaning over a living dungeon kitchen where a brigade of adventurers is confronting a large edible monster.

It must not feel like:

- a mobile application
- a dashboard
- a collection of cards
- a generic puzzle RPG
- a flat interface placed over a background

It should feel like a place.

---

## What Must Be Preserved From the Reference

### 1. A unified scene

The monster, heroes, puzzle board, props, lighting, and interface all appear to belong to the same physical environment.

There should be no obvious separation between:

- gameplay
- scenery
- characters
- interface

The screen is composed as one illustration rather than several stacked UI containers.

### 2. Strong visual depth

The screen uses several readable layers:

1. foreground culinary props
2. puzzle preparation table
3. heroes
4. monster
5. dungeon kitchen environment
6. atmospheric lighting and particles

Objects may overlap naturally when they do not obstruct gameplay.

### 3. A dominant monster

The monster is the emotional focal point of the upper scene.

It should:

- be substantially larger than the heroes
- have a strong silhouette
- react visibly to player actions
- look dangerous, expressive, and strangely appetizing
- feel physically present in the environment

Bosses should never look like small icons or cards.

### 4. Heroes inside the world

The four heroes are visible as characters, not represented only by portraits or rectangular status cards.

They should:

- stand between the monster and the puzzle board
- have distinct silhouettes
- remain readable at mobile scale
- perform subtle cooking-related idle actions
- animate together when a chain resolves

Their health and status information should remain secondary to their physical presence.

### 5. A tactile puzzle board

The puzzle board is a real enchanted preparation surface.

It should resemble:

- a thick butcher block
- an old chopping board
- a fantasy cooking workstation

It should show controlled signs of use:

- knife marks
- wood grain
- flour
- herbs
- small stains
- worn edges

The board must remain the clearest and most stable area of the screen.

Decoration must never overlap selectable cells.

### 6. Tangible ingredient tiles

Tiles should feel like small physical objects rather than flat icons.

They should have:

- strong silhouettes
- visible depth
- readable ingredient symbols
- consistent lighting
- satisfying selected and pressed states
- clear differentiation at a glance

They should remain readable without relying only on color.

### 7. Culinary environmental storytelling

Cooking should be visible throughout the entire scene.

Possible elements include:

- hanging herbs
- spice jars
- copper pots
- cast-iron pans
- cooking fires
- steam
- knives
- wooden utensils
- baskets
- ingredient sacks
- recipe notes
- ceramic bowls
- drying food
- shelves filled with supplies

These elements should support the composition, not fill space randomly.

### 8. Warm cinematic lighting

Lighting should unify the whole scene.

Primary lighting qualities:

- warm hearth light
- lantern glow
- localized highlights on characters and tiles
- darker surroundings that frame the gameplay
- subtle steam, dust, and embers

The puzzle must remain readable under every lighting condition.

---

## Interface Integration

The interface should appear to be made from physical objects found in the world.

Examples:

- HP bars mounted on carved wood or hammered metal
- recipe information written on clipped parchment
- combo information displayed on a hanging tavern sign
- action buttons shaped like cookware or utensils
- counters presented as labels, tags, bowls, or containers

Avoid using a physical metaphor when it reduces clarity.

Gameplay information must still be understood immediately.

---

## What Must Not Be Copied Literally

The reference image contains illustrative compromises that may not work in the actual game.

Do not copy literally:

- its exact number of puzzle rows or columns
- incorrect honeycomb geometry
- fake or non-functional buttons
- decorative objects covering interactive areas
- excessive foreground clutter
- text placement that does not scale responsively
- perspective that harms pointer accuracy
- five ingredient colors if the game currently requires four
- permanent HUD elements that are not part of the real gameplay

The real engine and gameplay rules remain the source of truth.

---

## Desired Visual Hierarchy

At rest:

1. Monster
2. Puzzle board
3. Heroes
4. Objective and health information
5. Decorative environment

While dragging:

1. Current chain
2. Reachable and selected tiles
3. Special tiles
4. Remaining board
5. Everything else

During resolution:

1. Triggered tiles and chain reactions
2. Hero choreography
3. Monster reaction
4. Combo escalation
5. Resulting board state

No decorative animation may compete with the active chain.

---

## Density Rules

The scene should feel rich, but gameplay space must not feel compressed.

Prefer:

- objects placed around gameplay
- depth and overlap
- large meaningful props
- environmental silhouettes

Avoid:

- excessive internal padding
- nested frames
- repeated borders
- decorative separators
- empty card backgrounds
- small gameplay elements surrounded by unused space

The puzzle board should use most of the available width.

---

## Production Principle

The final screen will be assembled from independent assets and runtime effects.

The reference should be decomposed into:

- background layers
- foreground props
- puzzle board surface
- tiles
- heroes
- monster
- shadows
- UI objects
- atmospheric particles
- combat effects

Do not implement the reference as one flattened image.

---

## Success Test

The combat presentation succeeds when:

- the puzzle remains immediately readable
- the player wants to touch the tiles
- the monster feels large and alive
- the heroes appear to inhabit the scene
- cooking is obvious without reading text
- there is little or no generic mobile-app feeling
- removing the HUD still leaves a coherent fantasy illustration
- adding the HUD does not break that illustration

## Final Rule

Do not reproduce the reference image.

Reproduce its sense of place, warmth, depth, tactility, personality, and culinary adventure.