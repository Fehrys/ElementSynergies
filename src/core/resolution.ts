import { HexGrid, ElementColor, SpecialTileType, CellCoord } from './grid';
import { RandomFn } from './rng';
import { validateChain } from './chain';
import { getAffectedCells } from './specialTiles';
import { Character, calculateDamage } from './combat';
import { refillBoard } from './refill';

// One color's worth of damage dealt in a single wave (manual chain or
// special-tile trigger) — resolveTurn can emit several per turn.
export interface DamageEvent {
  color: ElementColor;
  count: number;
  damage: number;
}

// A special tile queued to fire in the next wave, remembered by its fixed
// board coordinate and type at the moment it was destroyed (the tile
// object itself is already gone from the grid by the time it "fires").
export interface SpecialTileTrigger {
  cell: CellCoord;
  type: SpecialTileType;
}

export interface ResolutionResult {
  valid: boolean;
  damageEvents: DamageEvent[];
  totalDamage: number;
  // Number of waves reached this turn: 1 = manual chain only, 2+ = however
  // many rounds of special-tile chain reactions followed it.
  comboDepth: number;
  // Which improved tile spawned from the combo-depth-3 bonus, if any.
  bonusTileSpawned: SpecialTileType | null;
  reason?: string;
}

const IMPROVED_TILES: SpecialTileType[] = ['dynamite', 'doubleSword', 'doubleArrowBow'];
const COMBO_DEPTH_FOR_BONUS = 3;

function cellKey(cell: CellCoord): string {
  return `${cell.row},${cell.col}`;
}

// Resolves one full player turn end-to-end: validates the drag, clears
// and scores it, refills, then keeps resolving any special-tile chain
// reaction it triggered (waves 2, 3, ...) until a wave destroys no
// special tiles. This is the only function BattleScene calls per drag.
export function resolveTurn(
  grid: HexGrid,
  roster: Character[],
  path: CellCoord[],
  rng: RandomFn
): ResolutionResult {
  const validation = validateChain(grid, path);
  if (!validation.valid) {
    return {
      valid: false,
      damageEvents: [],
      totalDamage: 0,
      comboDepth: 0,
      bonusTileSpawned: null,
      reason: validation.reason,
    };
  }

  const damageEvents: DamageEvent[] = [];
  let triggers: SpecialTileTrigger[] = [];

  // --- Wave 1: the manual chain itself ---
  // Score and clear each sub-chain (portal-bridged chains produce two),
  // recording any special tiles the drag touched so they fire in wave 2.
  for (const subChain of validation.subChains) {
    for (const cell of subChain.specialTileCells) {
      const content = grid.get(cell.row, cell.col);
      if (content.type === 'special') {
        triggers.push({ cell, type: content.tile });
      }
    }
    const damage = calculateDamage(roster, subChain.color, subChain.stoneCells.length);
    damageEvents.push({ color: subChain.color, count: subChain.stoneCells.length, damage });
    for (const cell of subChain.stoneCells) grid.set(cell.row, cell.col, { type: 'empty' });
    for (const cell of subChain.specialTileCells) grid.set(cell.row, cell.col, { type: 'empty' });
  }
  // The shared portal cell (if any) is cleared once here, separately from
  // either sub-chain's own cell lists.
  for (const cell of validation.portalCells) {
    grid.set(cell.row, cell.col, { type: 'empty' });
  }

  refillBoard(grid, rng);

  let comboDepth = 1;
  let bonusTileSpawned: SpecialTileType | null = null;

  // --- Waves 2+: special-tile chain reaction ---
  // Keeps looping as long as the previous wave queued at least one
  // special tile to fire next. Each iteration is one "wave" / +1 combo depth.
  while (triggers.length > 0) {
    comboDepth += 1;

    // All of this wave's tiles fire "simultaneously": compute every
    // tile's affected cells against the same just-refilled board snapshot
    // first, union them, then clear/score together — so one tile's blast
    // never sees another tile's blast already applied.
    const affected = new Map<string, CellCoord>();
    for (const trigger of triggers) {
      for (const cell of getAffectedCells(grid, trigger.cell, trigger.type, rng)) {
        affected.set(cellKey(cell), cell);
      }
    }

    const colorCounts = new Map<ElementColor, number>();
    const nextTriggers: SpecialTileTrigger[] = [];

    // Tally colored stones destroyed (for damage) and any special tiles
    // caught in the blast (queued for the *next* wave), then clear the cell.
    for (const cell of affected.values()) {
      const content = grid.get(cell.row, cell.col);
      if (content.type === 'stone') {
        colorCounts.set(content.color, (colorCounts.get(content.color) ?? 0) + 1);
      } else if (content.type === 'special') {
        nextTriggers.push({ cell, type: content.tile });
      }
      grid.set(cell.row, cell.col, { type: 'empty' });
    }

    // One damage event per color hit this wave, full ATK*count, no damping.
    for (const [color, count] of colorCounts) {
      damageEvents.push({ color, count, damage: calculateDamage(roster, color, count) });
    }

    refillBoard(grid, rng);

    // The very first time a resolution reaches combo depth 3, reward it
    // with one random improved tile dropped into a random cell. Guarded
    // by bonusTileSpawned so it can't re-trigger at depth 4, 5, ...
    if (comboDepth === COMBO_DEPTH_FOR_BONUS && bonusTileSpawned === null) {
      const tile = IMPROVED_TILES[Math.floor(rng() * IMPROVED_TILES.length)];
      const allCells = grid.getAllCells();
      const target = allCells[Math.floor(rng() * allCells.length)];
      grid.set(target.row, target.col, { type: 'special', tile });
      bonusTileSpawned = tile;
    }

    triggers = nextTriggers;
  }

  const totalDamage = damageEvents.reduce((sum, e) => sum + e.damage, 0);
  return { valid: true, damageEvents, totalDamage, comboDepth, bonusTileSpawned };
}
