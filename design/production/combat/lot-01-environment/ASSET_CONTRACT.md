# Lot 1 — Environment Asset Contract

Binding production contract for the six combat-environment assets derived from
the master reference `design/references/combat-background-target.png`.

Shared rules for every asset in this lot:

- **Source of truth for placement** is the runtime layout model
  (`src/scenes/battleLayout.ts` → `src/scenes/battleEnvironmentLayout.ts`).
  Every target rectangle below is a *formula over `BattleLayout`*, never a
  pixel coordinate measured on the master image. The reference frame the art
  team should proof against is 480×720 (the composition baseline), but the
  formulas are what bind.
- **Manifest**: keys/paths/anchors are mirrored 1:1 in
  `src/assets/battleEnvironmentAssets.ts`. If this contract and the manifest
  ever disagree, fix the discrepancy before producing art.
- **No gameplay content**: no asset may contain hexagon cells, stones,
  ingredients placed on the cutting area, characters, HUD, or text.
- **Uniform scaling only**: assets are never stretched anisotropically at
  runtime. Design each asset so lateral crop (phones) and lateral extension
  (tablets) are acceptable.
- **Style**: follow `design/DESIGN_PRINCIPLES.md`, `design/COMBAT_SCREEN.md`,
  `design/VISUAL_COMPSITION.md`, `design/references/ART_TARGET.md` — warm
  handcrafted fantasy kitchen, organic silhouettes, controlled asymmetry,
  aged materials. The master image defines the palette and lighting.
- **Validation** (all assets): the export placed in the `assetSlots=1` review
  mode must fill its colored slot at 360×640, 480×720 and 768×1024 without
  revealing gaps at the documented seams, and the three normal-mode visual
  baselines must remain untouched (assets are not loaded in Lot 1; this
  criterion binds the *future* integration lot).

Depth values reference `src/scenes/depth.ts`. Two assets sharing a depth value
are ordered by their listed draw order (earlier = behind).

---

## Asset 1 — Upper architecture background

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/architecture/battle_bg_arch_upper.webp` |
| Phaser key | `battle-env-arch-upper` |
| File type | WebP (lossy, high quality) |
| Transparency | **Opaque** — no alpha |
| Anchor | `(0.5, 0)` — top-center |
| Depth | `DEPTH.BACKGROUND` (0), drawn first |
| Responsive policy | `viewportCover` |

**Artistic role.** The upper half's built structure: vault/ceiling, central
wall, the boss alcove, side wall masses. It is the "room" everything else
sits in.

**Logical target rect.** Full viewport width, from the viewport top down to
`layout.environment.horizonY` (the wall/floor seam, = `bands.hero.top`).
Formula: `x ∈ [0, viewport.width]`, `y ∈ [0, horizonY]`.

**Responsive behavior.** Cover-fitted into its band with a single isotropic
scale (`computeCoverFit`-style): scaled until both the band's width and height
are covered, centered horizontally. It may overflow the viewport; it is never
stretched non-uniformly.

**Crop behavior.** Lateral crop on narrow phones is expected and acceptable;
on tablets more of the lateral architecture becomes visible. Therefore paint
the composition center-weighted with expendable margins: nothing narrative in
the outer ~15% per side. Include ~5% bleed beyond the bottom seam so the stone
floor can overlap it without ever exposing a gap.

**Must include.** Vault/ceiling, central wall, the boss alcove (a calm,
low-contrast zone directly behind the boss silhouette), general upper-half
structure, baked ambient lighting consistent with the master.

**Must exclude.** Any table, any cutting board, any puzzle element, the
hearth/cooking cluster (Asset 3), the larder shelves (Asset 4), characters,
HUD, floor paving (Asset 2's job).

**Layout relationship.** Sits behind the boss (`layout.boss`) and the boss HUD;
the alcove's calm center must align with `environment.archCenter` (the
gameplay column's center at the monster band's vertical middle) — which the
cover fit guarantees as long as the alcove is horizontally centered in the
painting.

**Technical validation.** Opaque WebP; covers the `upperArchitecture` slot at
all three review formats with no visible stretch; boss and HUD remain fully
readable over it; seam at `horizonY` hidden by the floor overlap.

---

## Asset 2 — Stone combat floor

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/floor/battle_floor_stone.webp` |
| Phaser key | `battle-env-floor-stone` |
| File type | WebP (lossy, high quality) |
| Transparency | **Opaque** — no alpha |
| Anchor | `(0.5, 0)` — top-center |
| Depth | `DEPTH.BACKGROUND` (0), drawn after Asset 1 (over it) |
| Responsive policy | `viewportBand` |

**Artistic role.** The stone ground plane: under the boss's grounding, under
the heroes, the breathing space between the heroes and the preparation
station, and the transition up to the stone/wood separation.

**Logical target rect.** Full viewport width, from
`layout.environment.horizonY` down to `layout.table.y` (the stone/wood
separation — `bands.hero.bottom + tableTopGap`). Formula:
`x ∈ [0, viewport.width]`, `y ∈ [horizonY, table.y]`.

**Responsive behavior.** Width follows the viewport exactly; height follows
the semantic band. The band's aspect ratio varies between formats, so paint
the floor as a tileable-in-spirit surface whose top and bottom edges are
straight seams: the runtime fit prioritizes covering the band width, and
vertical excess is cropped symmetrically toward the band.

**Crop behavior.** Lateral crop acceptable; vertical crop happens against the
bleed, never against meaningful detail. Include ~5% bleed beyond both
horizontal seams.

**Must include.** Stone paving with age/wear, the perspective transition
consistent with the master's slightly top-down camera, subtle contact
shading where the wall meets the floor.

**Must exclude.** The preparation station and any wood (Asset 5's job), the
cutting board, characters and their shadows (runtime-drawn), props from
Assets 3/4.

**Layout relationship.** Its top edge is `horizonY` and its bottom edge is
`layout.table.y` — both **semantic band frontiers**. It is explicitly NOT
positioned from the heroes' feet: the validated clearance between the heroes
and the table (`tableTopGap`) lives inside this band and must remain visually
open floor.

**Technical validation.** Opaque WebP; `stoneFloor` slot filled edge-to-edge
at all three formats; ends exactly where `prepTableBase` begins (shared edge,
verified by unit test `stoneFloor.bottom === table.y`).

---

## Asset 3 — Left hearth cluster

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/props/left/battle_left_hearth_cluster.png` |
| Phaser key | `battle-env-left-hearth` |
| File type | PNG (32-bit) |
| Transparency | **True alpha** — no opaque background rectangle of any kind |
| Anchor | `(0, 1)` — bottom-left |
| Depth | `DEPTH.ENVIRONMENT` (10) |
| Responsive policy | `edgeCluster` |

**Artistic role.** The cooking hot spot: stone oven, hearth/fire, hanging
cauldron/marmite, cooking utensils and hot-zone accessories, as a single
pre-composed cluster.

**Logical target rect.** Anchored to the viewport's **left edge**, standing on
the stone/wood separation. Formula: `x ∈ [0, clusterWidth]`,
`y ∈ [bands.monster.top, table.y]`, where
`clusterWidth = min(clusterWidthFraction × viewport.width, clusterMaxWidth)`
(policy values in `DEFAULT_ENVIRONMENT_SLOT_POLICY`).

**Responsive behavior.** Uniform scale to fit the slot height; horizontal
room shrinks on phones (the slot narrows), so the cluster compresses toward
the edge and/or slides partially off-screen left — it never pushes, resizes,
or displaces the gameplay column, whose math it cannot touch (the slot is
computed *from* the layout, never fed back).

**Crop behavior.** Partial left-edge crop on phones is expected: compose the
cluster so its silhouette still reads when up to ~40% of its width is off
screen. The inner (center-facing) edge must stay calm — low contrast, no
bright fire licking toward the board/heroes.

**Must include.** Stone oven mass, fire glow (baked), marmite, a few hanging
utensils; grounded contact shadow baked into the alpha.

**Must exclude.** Any full ceiling or full floor (it is a prop cluster, not a
room slice), any opaque backdrop, characters, anything crossing the vertical
center of the screen.

**Layout relationship.** Drawn at `DEPTH.ENVIRONMENT`, i.e. **behind** the
boss (21), heroes (31), table (40), board (50) and HUD (80). It may visually
overlap the gameplay column's outer edge on phones because it renders behind
everything interactive.

**Technical validation.** Real alpha channel (checked: no opaque bounding
rect); fits the `leftHearth` slot bottom-left-anchored at the three formats;
never occludes boss/hero/HUD readability (it cannot — depth), inner edge calm.

---

## Asset 4 — Right larder cluster

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/props/right/battle_right_larder_cluster.png` |
| Phaser key | `battle-env-right-larder` |
| File type | PNG (32-bit) |
| Transparency | **True alpha** — no opaque background rectangle of any kind |
| Anchor | `(1, 1)` — bottom-right |
| Depth | `DEPTH.ENVIRONMENT` (10), after Asset 3 |
| Responsive policy | `edgeCluster` |

**Artistic role.** The food reserve: shelves, pots, jars, sacks, vegetables,
hanging herbs — the pantry side of the kitchen, deliberately NOT a mirror of
the hearth (controlled asymmetry).

**Logical target rect.** Anchored to the viewport's **right edge**, same
vertical span as Asset 3. Formula:
`x ∈ [viewport.width − clusterWidth, viewport.width]`,
`y ∈ [bands.monster.top, table.y]`, same `clusterWidth` policy.

**Responsive behavior / crop behavior.** Identical policy to Asset 3, mirrored:
uniform scale, compresses/crops at the right edge before ever affecting the
gameplay column; up to ~40% may crop off-screen on phones; the center-facing
edge stays calm.

**Must include.** Shelving with jars/pots, sacks, vegetables/herbs, baked
contact shadows.

**Must exclude.** Any hearth/fire (that is Asset 3's identity), any opaque
backdrop, full ceiling/floor, characters.

**Layout relationship.** Same as Asset 3 — `DEPTH.ENVIRONMENT`, behind all
gameplay layers.

**Technical validation.** Real alpha; fits the `rightLarder` slot
bottom-right-anchored at the three formats; visibly distinct silhouette from
the left cluster; calm inner edge.

---

## Asset 5 — Preparation station base

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/preparation/battle_prep_table_base.webp` |
| Phaser key | `battle-env-prep-table-base` |
| File type | WebP (lossy, high quality) |
| Transparency | **Opaque** — no alpha |
| Anchor | `(0, 0)` — top-left |
| Depth | `DEPTH.TABLE` (40), drawn first in the table layer |
| Responsive policy | `viewportBand` |

**Artistic role.** The big lower wooden zone: the preparation station's
surface and surround, peripheral accessories (towels, bowls, scattered flour),
running to the viewport's side and bottom edges.

**Logical target rect.** **Exactly `layout.table`**: full viewport width,
from `table.y` (stone/wood separation) to the viewport bottom. Formula:
`x ∈ [0, viewport.width]`, `y ∈ [table.y, viewport.height]`.

**Responsive behavior.** Width follows the viewport, height follows the
`table` band. Like Asset 2, paint with straight top seam and expendable
lateral margins; the runtime covers the band width and crops vertical excess
downward (bottom of the image is the least meaningful area).

**Crop behavior.** Lateral crop on phones acceptable; peripheral accessories
must survive cropping (nothing narrative in the outer margins). ~5% top bleed
above the seam is NOT allowed here — the stone/wood separation is a hard,
designed edge; instead the wood's top edge itself must be finished (slight
irregular lip, per VISUAL_COMPOSITION's "avoid large rectangles").

**Must include.** Wood surface with grain/wear, the station's front edge
falling to the viewport bottom, peripheral kitchen accessories kept OUT of the
central cutting-board zone.

**Must exclude.** The cutting board itself (Asset 6), any puzzle element, the
heroes (they stand on stone, above this band), anything that would force the
cutting board to stretch on tablets (the center must stay a plain surface the
board can sit on at any column width).

**Layout relationship.** Follows `layout.table` 1:1 (unit-tested). It does
**not** define hero positions (heroes are grounded by the layout's hero band,
`tableTopGap` above this asset). The cutting board (Asset 6) sits on top of
it at `DEPTH.TABLE`, drawn after.

**Technical validation.** Opaque WebP; `prepTableBase` slot === `layout.table`
at the three formats (unit-tested equality); central zone calm enough for the
board; hard top seam aligned with the slot's top edge.

---

## Asset 6 — Cutting board

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/preparation/battle_prep_cutting_board.png` |
| Phaser key | `battle-env-cutting-board` |
| File type | PNG (32-bit) |
| Transparency | **True alpha** (organic contour, juice groove, worn corners) |
| Anchor | `(0.5, 0.5)` — center |
| Depth | `DEPTH.TABLE` (40), drawn after Asset 5 (over it), below `DEPTH.BOARD` (50) |
| Responsive policy | `gameplayColumnObject` |

**Artistic role.** The puzzle's physical support: an enchanted chopping board
with groove, contour, thickness, knife marks and a **calm center** where the
32 tiles live.

**Logical target rect.** Centered on the gameplay column, derived from the
tile bounding box plus configurable visual margins. Formula (policy fractions
of `tileBounds`, see `DEFAULT_ENVIRONMENT_SLOT_POLICY`):

```
width  = tileBounds.width  + 2 × sideMarginFraction   × tileBounds.width
height = tileBounds.height + (topMarginFraction + bottomMarginFraction) × tileBounds.height
center = (gameplayColumn.centerX, tileBounds.y − topMargin + height / 2)
```

**Responsive behavior.** Uniform scaling ONLY, driven by the board's own
scale (the margins are fractions of `tileBounds`, so the frame follows the
tiles at every format). It is centered in the gameplay column and **never**
follows `layout.table`'s full width — on tablets the station base widens but
the board does not stretch (unit-tested: board width < viewport width and <
table width at 768×1024).

**Crop behavior.** Never cropped: the slot is always fully inside the
gameplay column, which is always fully inside the safe rect.

**Must include.** Board surface, juice groove and contour, thickness/edge
shadow onto the station base (baked in alpha), knife marks/flour at the
periphery only.

**Must exclude.** Any cell, any hexagon, any guide, any ingredient in the
central zone, any text — the center is a uniform, calm surface (tiles render
over it at `DEPTH.BOARD`).

**Layout relationship.** Placement derives from `layout.board.tileBounds` +
margin policy (and nothing else); the export's aspect ratio must match the
slot's ratio (proof at 480×720 against the review capture) so the uniform fit
is exact at every format.

**Technical validation.** Real alpha with organic contour (no straight
full-bleed rectangle); `cuttingBoard` slot centered on the column
(unit-tested); all 32 tile positions + their `hitRadius` circles fall inside
the calm center (verify with `&artGuides=1&assetSlots=1`); never
viewport-wide on any format.
