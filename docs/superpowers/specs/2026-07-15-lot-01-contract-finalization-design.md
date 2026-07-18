> **Superseded (2026-07-16).** This finalization design still assumed the
> **six-asset** contract (`upperArchitecture` + `stoneFloor` as two separate
> layers). The contract was subsequently migrated to **five assets**, merging
> those two into a single `battleBackgroundUpper` layer. The current, binding
> contract is `design/production/combat/lot-01-environment/ASSET_CONTRACT.md`;
> this file is kept for historical context only.

# Lot 1 contract finalization — design

Date: 2026-07-15
Status: approved (direct continuation of
`2026-07-14-lot-01-environment-production-setup-design.md`)

## Goal

Apply the five validated adjustments to the Lot 1 environment contract,
manifest and slot model **before** any graphic asset is produced. Still no
asset file, no master auto-cut, no loading in normal mode, no gameplay or
baseline change.

## The five adjustments

1. **Documentation reference fix.** The committed design file is misnamed
   `design/VISUAL_COMPSITION.md` while `CLAUDE.md` and `design/README.md`
   already reference `design/VISUAL_COMPOSITION.md`. Rename the file to the
   correct spelling and fix the two stale references
   (`ASSET_CONTRACT.md`, `design/implementation/BATTLE_SCENE_AUDIT.md`).
   No documentation-lint mechanism exists in the repo, so no new test
   framework is introduced for this.

2. **High hanging props belong to the architecture.** Art decision: herbs,
   garlic and small shelf details near the vault are painted into
   `battle_bg_arch_upper.webp`, NOT into the side clusters. The clusters own
   the low/mid functional mass only. Contract prose only — no slot change,
   `clusterMaxWidth` stays 220, cluster vertical bound stays
   `bands.monster.top`.

3. **Production source dimensions.** A shared contract section + a purely
   documentary `productionSize {width, height, aspectRatio}` field on each
   manifest entry (testable, never triggers loading): arch 1536×1024 (1.5),
   floor 1536×512 (3.0), clusters 640×1200 (0.533), prep base 1536×1280
   (1.2), cutting board 1434×1000 (1.434).

4. **Minimum gap above the cutting board.** New policy value
   `minimumBoardTopGap: 8` (logical px). The natural slot is still derived
   from `tileBounds` + margins; afterwards the slot's TOP edge is clamped to
   `>= layout.table.y + minimumBoardTopGap` by moving **only the Y** of the
   visual slot (width/height/ratio/X untouched, puzzle untouched). At
   360×640 the natural gap is +3.9 px and at 480×720 the natural top
   actually pokes 6.2 px ABOVE the stone/wood seam, so the clamp moves the
   slot at both phone formats; 768×1024 (natural gap ≈ 53.6 px) is
   untouched. Priority order if a tiny viewport ever pushed the slot down:
   puzzle content > top gap > bottom lip visibility (bottom lip may crop —
   never shrink gameplay).

5. **Seam overlap is documented, not coded.** `prepTableBase`'s logical slot
   stays exactly `layout.table`. The contract now distinguishes the *logical
   slot boundary* from an *optional future render overlap* of 1–2 logical px
   above `table.y`, applicable during the future integration pass only if a
   sampling seam is actually observed.

## Testing

Unit (tests/scenes): production sizes present/positive/ratio-consistent for
all six; gap ≥ 8 at the three formats; clamp changes only `cuttingBoard.y`
(all other placements and all other fields byte-identical under a different
gap); tile positions and `tileBounds` unchanged (existing no-mutation test +
explicit cell check); cluster cap still 220. E2e: existing asset-slots spec
recomputes the same pure model (auto-covers the clamp); the slots review
additionally exposes `data-asset-slots-policy`. Normal-mode baselines remain
byte-identical, never regenerated.

## Review captures

Because the clamp moves the cutting-board slot at 360×640 and 480×720, the
three checkpoint captures are re-exported as
`environment-slots-{WxH}-final.png` (all three for a coherent checkpoint);
the previous captures are kept.
