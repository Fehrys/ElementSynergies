# Broth & Blade — Design Documentation

This folder defines the creative direction of Broth & Blade.

## Document roles

### DESIGN_PRINCIPLES.md
The highest-level creative rules of the project.

These principles are stable and should guide every visual and UX decision.

### COMBAT_SCREEN.md
Defines the intended player experience, visual hierarchy, and fantasy of the battle screen.

It describes intent, not exact implementation measurements.

### VISUAL_COMPOSITION.md
Defines composition, depth, overlap, environmental integration, and the avoidance of generic app-like layouts.

### MOTION_LANGUAGE.md
Defines animation personality, interaction feedback, rhythm, escalation, and movement principles.

## How to use these documents

Before modifying a screen, read:

1. `DESIGN_PRINCIPLES.md`
2. The document related to the screen or system being changed
3. Any relevant technical specification

Do not interpret creative examples as mandatory implementation details.

When a creative document conflicts with:

- gameplay readability,
- accessibility,
- responsive layout,
- existing core gameplay rules,
- automated tests,

raise the conflict before implementing a workaround.

## Priority order

1. Core gameplay correctness
2. Puzzle readability and input accuracy
3. Design principles
4. Screen-specific creative direction
5. Decorative polish

## Current status

These documents define the creative target.

They do not yet define:

- final asset dimensions,
- sprite pivots,
- animation frame counts,
- exact responsive breakpoints,
- final production assets.

Those will be documented separately once the Art Target is validated.