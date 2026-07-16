# Lot 1 — Environment Asset Contract

> **Supersedes the six-asset contract.** This document replaces the original
> six-asset version (`upperArchitecture` + `stoneFloor` as two separate
> layers). As of 2026-07-16, `upperArchitecture` and `stoneFloor` are merged
> into a single `battleBackgroundUpper` asset covering the full band from the
> viewport top down to `layout.table.y` — the wall/floor separation is no
> longer an asset-slot boundary. The historical specs/plans
> (`docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md`,
> `docs/superpowers/plans/2026-07-14-lot-01-environment-production-setup.md`,
> `docs/superpowers/specs/2026-07-15-lot-01-contract-finalization-design.md`)
> describe the six-asset version and are kept for history; they are no longer
> binding. This document is the current contract.

Binding production contract for the five combat-environment assets derived
from the master reference `design/references/combat-background-target.png`.

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
- **Availability**: three of the five assets are produced and validated
  (`status: 'available'` in the manifest); the two prop clusters (`leftHearth`,
  `rightLarder`) are still awaiting production (`status: 'pending'`). See
  `tests/assets/environmentAssetFiles.test.ts` for the automated check.
- **No gameplay content**: no asset may contain hexagon cells, stones,
  ingredients placed on the cutting area, characters, HUD, or text.
- **Uniform scaling only**: assets are never stretched anisotropically at
  runtime. Design each asset so lateral crop (phones) and lateral extension
  (tablets) are acceptable.
- **Style**: follow `design/DESIGN_PRINCIPLES.md`, `design/COMBAT_SCREEN.md`,
  `design/VISUAL_COMPOSITION.md`, `design/references/ART_TARGET.md` — warm
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

## Production dimensions

For the three produced assets, these are the **real, measured dimensions**
read from each file's own header (PNG IHDR chunk) — not aspirational
recommendations. For the two not-yet-produced clusters, these remain
recommended target dimensions for the future export. All are mirrored by the
documentary `productionSize` field of each manifest entry
(`src/assets/battleEnvironmentAssets.ts`) and unit-tested for internal
consistency; the three produced files are additionally unit-tested against
these exact dimensions (`tests/assets/environmentAssetFiles.test.ts`).

| Asset | Status | Real/target dimensions | Ratio |
|---|---|---:|---:|
| `battle_bg_upper.webp` | **available** | 1536 × 1024 | 1.500 |
| `battle_prep_table_base.webp` | **available** | 1374 × 1145 | 1.200 |
| `battle_prep_cutting_board.png` | **available** | 1086 × 1448 | 0.750 |
| `battle_left_hearth_cluster.png` | pending | 640 × 1200 (target) | 0.533 |
| `battle_right_larder_cluster.png` | pending | 640 × 1200 (target) | 0.533 |

**Known issues on the three produced files** (see
`tests/assets/environmentAssetFiles.test.ts` and the migration report for
detail):

- **`battle_bg_upper.webp` and `battle_prep_table_base.webp` are PNG-encoded
  on disk, not WebP**, despite their `.webp` extension and declared manifest
  `format: 'webp'`. Both decode as valid PNG (verified via the PNG file
  signature and IHDR chunk). This is a container/extension mismatch in the
  export pipeline, not a runtime blocker today (Lot 1 does not load these
  files yet), but it should be corrected — either by actually re-exporting as
  WebP, or by renaming the manifest path/format to `.png` — before the future
  integration lot wires loading.
- **`battle_prep_cutting_board.png` has no real alpha channel.** It decodes as
  PNG color type 2 (truecolor RGB, no alpha, no `tRNS` chunk either) — a flat
  opaque rectangle, not a transparent cutout. This fails the alpha
  requirement below (Asset 3) and must be re-exported as PNG RGBA. Its
  measured aspect ratio (1086×1448, portrait, ratio 0.75) also does not match
  the landscape ratio the contract originally targeted — this must be
  re-evaluated against the `gameplayColumnObject` slot fit (see Asset 3 below)
  once a corrected export exists.

Rules:

- For produced assets, dimensions above are **documentary facts about the
  shipped file**, not runtime coordinates — runtime placement comes
  exclusively from `computeBattleEnvironmentLayout` and the runtime scale
  stays uniform.
- For not-yet-produced assets, dimensions are recommendations for the
  `source/` → `exports/` pipeline.
- The cutting board's aspect ratio must be preserved with high precision
  (its uniform fit into the slot depends on it — see Asset 3).
- Opaque assets may be optimized as WebP; assets requiring transparency stay
  32-bit PNG.
- No final file may ever be stretched anisotropically, at export time or at
  runtime.

---

## Asset 1 — Battle background (upper architecture + combat floor)

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/background/battle_bg_upper.webp` |
| Status | **Available** |
| Phaser key | `battle-env-bg-upper` |
| File type | WebP (lossy, high quality) declared; **currently ships as PNG** — see "Known issues" above |
| Transparency | **Opaque** — no alpha |
| Anchor | `(0.5, 0)` — top-center |
| Depth | `DEPTH.BACKGROUND` (0), drawn first |
| Responsive policy | `viewportCover` |

**Artistic role.** The entire upper scene in one painting: vault/ceiling,
central wall, the boss alcove, side wall masses, AND the stone combat floor
beneath the boss and heroes, down to the stone/wood separation. This asset
replaces the former two-layer split (`upperArchitecture` + `stoneFloor`): the
combat floor is no longer a separate slot, it is baked into this single image.

**Logical target rect.** Full viewport width, from the viewport top down to
`layout.table.y` (the stone/wood separation). Formula: `x ∈ [0, viewport.width]`,
`y ∈ [0, table.y]`.

**Responsive behavior.** Cover-fitted into its band with a single isotropic
scale (`computeCoverFit`-style): scaled until both the band's width and height
are covered, centered horizontally. It may overflow the viewport; it is never
stretched non-uniformly.

**Crop behavior.** Lateral crop on narrow phones is expected and acceptable;
on tablets more of the lateral architecture becomes visible. Paint the
composition center-weighted with expendable margins: nothing narrative in the
outer ~15% per side. Vertical excess crops toward the band; the floor's
bottom edge is the least meaningful area for cropping.

**Must include.** Vault/ceiling, central wall, the boss alcove (a calm,
low-contrast zone directly behind the boss silhouette), general upper-half
structure, baked ambient lighting consistent with the master, the stone
ground plane under the boss's grounding and the heroes, the breathing space
between the heroes and the preparation station, and the transition down to
the stone/wood separation, with subtle contact shading where the wall meets
the floor.

**May include (validated art decision).** The master's high peripheral
hanging accessories belong to THIS asset, not to the side clusters: high
hanging herb bouquets, garlic strings near the ceiling, small high-shelf
trinkets sitting above the edge-cluster slots, and secondary hanging pieces
integrated into the vault and lateral walls, provided they remain peripheral
(baked into the walls' outer thirds), never enter the central HUD zone,
never enter the boss's calm alcove, and never read as interactive or
visually dominant elements.

**Must exclude.** Any table, any cutting board, any puzzle element, the
hearth/cooking cluster (Asset 4), the larder shelves (Asset 5), characters,
HUD, the preparation station and any wood (Asset 2's job).

**Layout relationship.** Sits behind the boss (`layout.boss`) and the boss
HUD; the alcove's calm center must align with `environment.archCenter` (the
gameplay column's center at the monster band's vertical middle) — which the
cover fit guarantees as long as the alcove is horizontally centered in the
painting. Its bottom edge is exactly `layout.table.y`, where `prepTableBase`
(Asset 2) begins (shared edge, unit-tested).

**Technical validation.** Opaque; covers the `battleBackgroundUpper` slot at
all three review formats with no visible stretch; boss and HUD remain fully
readable over it; ends exactly where `prepTableBase` begins.

---

## Asset 2 — Preparation station base

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/preparation/battle_prep_table_base.webp` |
| Status | **Available** |
| Phaser key | `battle-env-prep-table-base` |
| File type | WebP (lossy, high quality) declared; **currently ships as PNG** — see "Known issues" above |
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
`table` band. Paint with straight top seam and expendable lateral margins;
the runtime covers the band width and crops vertical excess downward (bottom
of the image is the least meaningful area).

**Crop behavior.** Lateral crop on phones acceptable; peripheral accessories
must survive cropping (nothing narrative in the outer margins). The
stone/wood separation is a hard, designed edge; the wood's top edge itself
must be finished (slight irregular lip, per `VISUAL_COMPOSITION`'s "avoid
large rectangles").

**Must include.** Wood surface with grain/wear, the station's front edge
falling to the viewport bottom, peripheral kitchen accessories kept OUT of the
central cutting-board zone.

**Must exclude.** The cutting board itself (Asset 3), any puzzle element, the
heroes (they stand on stone, above this band), anything that would force the
cutting board to stretch on tablets (the center must stay a plain surface the
board can sit on at any column width).

**Layout relationship.** Follows `layout.table` 1:1 (unit-tested). It does
**not** define hero positions (heroes are grounded by the layout's hero band,
`tableTopGap` above this asset). The cutting board (Asset 3) sits on top of
it at `DEPTH.TABLE`, drawn after.

**Logical slot boundary vs optional future render overlap.** The logical
preparation slot begins exactly at `layout.table.y`. During the future
integration pass, the rendered sprite may overlap the background by 1–2
logical pixels only if required to hide a sampling seam. This does not alter
the slot or layout model: the *logical slot boundary* stays `layout.table`;
the *optional render overlap* is a pure integration-time sprite adjustment
against seams caused by texture filtering, subpixel rounding, antialiasing or
sampling differences. It must NOT be applied preemptively, is NOT coded in
the current helper or normal rendering, and never changes `layout.table` or
this contract's target rect.

**Technical validation.** Opaque; `prepTableBase` slot === `layout.table` at
the three formats (unit-tested equality); central zone calm enough for the
board; hard top seam aligned with the slot's top edge.

---

## Asset 3 — Cutting board

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/preparation/battle_prep_cutting_board.png` |
| Status | **Available, but fails alpha validation — see "Known issues" above** |
| Phaser key | `battle-env-cutting-board` |
| File type | PNG (32-bit required) |
| Transparency | **True alpha required** (organic contour, juice groove, worn corners) — **currently opaque RGB, no alpha channel** |
| Anchor | `(0.5, 0.5)` — center |
| Depth | `DEPTH.TABLE` (40), drawn after Asset 2 (over it), below `DEPTH.BOARD` (50) |
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
top    = max(tileBounds.y − topMargin, table.y + minimumBoardTopGap)
center = (gameplayColumn.centerX, top + height / 2)
```

**Minimum top gap (clamp).** `minimumBoardTopGap` (8 logical px, in
`DEFAULT_ENVIRONMENT_SLOT_POLICY`) guarantees the board's top edge never
crowds the stone/wood separation: after the natural derivation above, the
slot is shifted **down, on Y only**, until its top edge sits at least 8 px
below `table.y`. The clamp never moves the puzzle, never touches
`tileBounds` or any cell position, and never alters the slot's width,
height, ratio, side margins or X — only the visual slot's Y may change.
If an extremely constrained viewport ever made this shift push the slot's
bottom lip toward the viewport edge, the preservation priority is:
(1) puzzle content, (2) the minimum top gap, (3) bottom-contour visibility —
gameplay is never shrunk to compensate. At the three reference formats the
clamp is active at 360×640 and 480×720 (where the natural frame pokes
slightly above the seam) and inactive at 768×1024.

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
margin policy, then the `minimumBoardTopGap` clamp against `layout.table.y`
(and nothing else); the export's aspect ratio must match the slot's ratio
(proof at 480×720 against the review capture) so the uniform fit is exact at
every format. **The currently produced file (1086×1448, portrait, ratio
0.75) has not been checked against the slot's actual computed ratio at
480×720 — do this once a real-alpha re-export exists.**

**Technical validation.** Real alpha with organic contour (no straight
full-bleed rectangle) — **currently fails: the produced file is opaque
RGB with no alpha channel, detected by
`tests/assets/environmentAssetFiles.test.ts`, which must stay red until a
corrected PNG RGBA export replaces this file at the same path**;
`cuttingBoard` slot centered on the column (unit-tested); all 32 tile
positions + their `hitRadius` circles fall inside the calm center (verify
with `&artGuides=1&assetSlots=1`); never viewport-wide on any format.

---

## Asset 4 — Left hearth cluster

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/props/left/battle_left_hearth_cluster.png` |
| Status | **Pending — not yet produced** |
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
utensils; grounded contact shadow baked into the alpha. The cluster's
priority is the **low and mid functional mass**: oven, hearth, cauldron and
the tools within arm's reach of the fire.

**Must exclude.** Any full ceiling or full floor (it is a prop cluster, not a
room slice — that is Asset 1's job now), any opaque backdrop, characters,
anything crossing the vertical center of the screen. Ceiling-level
accessories are NOT this cluster's responsibility: high hanging herbs/garlic
and small high-shelf details above the cluster slot belong to Asset 1
(validated art decision) — do not paint them here to "reach up" past the
slot.

**Layout relationship.** Drawn at `DEPTH.ENVIRONMENT`, i.e. **behind** the
boss (21), heroes (31), table (40), board (50) and HUD (80). It may visually
overlap the gameplay column's outer edge on phones because it renders behind
everything interactive.

**Technical validation.** Real alpha channel (checked: no opaque bounding
rect); fits the `leftHearth` slot bottom-left-anchored at the three formats;
never occludes boss/hero/HUD readability (it cannot — depth), inner edge calm.

---

## Asset 5 — Right larder cluster

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/props/right/battle_right_larder_cluster.png` |
| Status | **Pending — not yet produced** |
| Phaser key | `battle-env-right-larder` |
| File type | PNG (32-bit) |
| Transparency | **True alpha** — no opaque background rectangle of any kind |
| Anchor | `(1, 1)` — bottom-right |
| Depth | `DEPTH.ENVIRONMENT` (10), after Asset 4 |
| Responsive policy | `edgeCluster` |

**Artistic role.** The food reserve: shelves, pots, jars, sacks, vegetables,
hanging herbs — the pantry side of the kitchen, deliberately NOT a mirror of
the hearth (controlled asymmetry).

**Logical target rect.** Anchored to the viewport's **right edge**, same
vertical span as Asset 4. Formula:
`x ∈ [viewport.width − clusterWidth, viewport.width]`,
`y ∈ [bands.monster.top, table.y]`, same `clusterWidth` policy.

**Responsive behavior / crop behavior.** Identical policy to Asset 4, mirrored:
uniform scale, compresses/crops at the right edge before ever affecting the
gameplay column; up to ~40% may crop off-screen on phones; the center-facing
edge stays calm.

**Must include.** Shelving with jars/pots, sacks, vegetables/herbs, baked
contact shadows. The cluster's priority is the **low and mid functional
mass**: low shelves, pots, sacks and reserves.

**Must exclude.** Any hearth/fire (that is Asset 4's identity), any opaque
backdrop, full ceiling/floor (Asset 1's job), characters. Ceiling-level
accessories are NOT this cluster's responsibility: hanging herbs/garlic near
the vault and trinkets above the cluster slot belong to Asset 1 (validated
art decision).

**Layout relationship.** Same as Asset 4 — `DEPTH.ENVIRONMENT`, behind all
gameplay layers.

**Technical validation.** Real alpha; fits the `rightLarder` slot
bottom-right-anchored at the three formats; visibly distinct silhouette from
the left cluster; calm inner edge.
