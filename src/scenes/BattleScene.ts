import Phaser from 'phaser';
import {
  HexGrid,
  CellCoord,
  ElementColor,
  SpecialTileType,
  getAllCells,
  fillBoard,
} from '../core/grid';
import { mulberry32, RandomFn } from '../core/rng';
import { ROSTER, createMonster, applyDamage, isDefeated, Monster } from '../core/combat';
import { resolveTurn } from '../core/resolution';

// Pixel layout constants for the hex board. Exported so the Playwright
// e2e test can compute the same screen coordinates for a known board
// state instead of duplicating this math.
export const ORIGIN_X = 60;
export const ORIGIN_Y = 100;
export const CELL_WIDTH = 56;
export const ROW_HEIGHT = 48;
const STONE_RADIUS = 22;

const COLOR_HEX: Record<ElementColor, number> = {
  red: 0xe74c3c,
  green: 0x2ecc71,
  yellow: 0xf1c40f,
  blue: 0x3498db,
};

// Placeholder text labels standing in for real icons/art in this
// vertical-slice prototype.
const TILE_LABEL: Record<SpecialTileType, string> = {
  bomb: 'B',
  sword: 'S',
  bow: 'W',
  dynamite: 'D',
  doubleSword: 'SS',
  doubleArrowBow: 'WW',
};

// Converts a logical (row, col) cell into the screen position of its
// center, applying the honeycomb's half-cell-width shift on odd rows.
export function cellToPixel(row: number, col: number): { x: number; y: number } {
  const shift = row % 2 === 1 ? CELL_WIDTH / 2 : 0;
  return {
    x: ORIGIN_X + col * CELL_WIDTH + shift,
    y: ORIGIN_Y + row * ROW_HEIGHT,
  };
}

// The only scene in this prototype: renders the board + HP bar, turns
// pointer drags into a CellCoord path, and hands each finished drag to
// resolveTurn() — all puzzle/combat logic lives in src/core, not here.
export class BattleScene extends Phaser.Scene {
  private grid!: HexGrid;
  private rng!: RandomFn;
  private monster!: Monster;
  private path: CellCoord[] = [];
  private dragging = false;
  private boardLayer!: Phaser.GameObjects.Container;
  private hpText!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;

  constructor() {
    super('battle');
  }

  create(): void {
    // A `?seed=N` query param swaps in a deterministic RNG so e2e tests
    // (and manual debugging) can reproduce an exact board; otherwise use
    // real randomness.
    const seedParam = new URLSearchParams(window.location.search).get('seed');
    this.rng = seedParam ? mulberry32(Number(seedParam)) : Math.random;

    this.grid = new HexGrid();
    fillBoard(this.grid, this.rng);
    this.monster = createMonster('Frost Yeti', 1000);

    this.boardLayer = this.add.container(0, 0);
    this.hpText = this.add.text(20, 20, '', { fontSize: '20px', color: '#ffffff' });
    this.hpBar = this.add.graphics();

    this.drawBoard();
    this.drawHp();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', () => this.onPointerUp());

    // Lets Playwright wait for/assert on scene state via plain DOM reads,
    // since Phaser renders to canvas and isn't otherwise inspectable.
    document.body.setAttribute('data-scene', 'battle');
  }

  // Hit-tests a pointer position against every cell's rendered center,
  // returning whichever one it's within STONE_RADIUS of (or null).
  private cellAt(x: number, y: number): CellCoord | null {
    for (const cell of getAllCells()) {
      const p = cellToPixel(cell.row, cell.col);
      if (Phaser.Math.Distance.Between(x, y, p.x, p.y) <= STONE_RADIUS) {
        return cell;
      }
    }
    return null;
  }

  // Starts a new drag path if the press lands on a cell.
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const cell = this.cellAt(pointer.x, pointer.y);
    if (!cell) return;
    this.dragging = true;
    this.path = [cell];
  }

  // Extends the in-progress path whenever the pointer enters a new,
  // not-yet-visited cell. Full legality (adjacency/color/min-length) is
  // deferred to validateChain() at release time, not checked live here.
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    const cell = this.cellAt(pointer.x, pointer.y);
    if (!cell) return;
    const last = this.path[this.path.length - 1];
    if (last.row === cell.row && last.col === cell.col) return;
    if (this.path.some((c) => c.row === cell.row && c.col === cell.col)) return;
    this.path.push(cell);
  }

  // On release, hands the whole dragged path to the core engine, applies
  // whatever damage came back, redraws, and checks for victory.
  private onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;

    const result = resolveTurn(this.grid, ROSTER, this.path, this.rng);
    this.path = [];

    if (result.valid) {
      this.monster = applyDamage(this.monster, result.totalDamage);
    }

    this.drawBoard();
    this.drawHp();

    if (isDefeated(this.monster)) {
      this.add.text(140, 400, 'Victory!', { fontSize: '32px', color: '#ffffff' });
      document.body.setAttribute('data-scene', 'victory');
    }
  }

  // Full redraw of every cell from current grid state — simple or
  // correct is preferred over incremental/animated updates for this
  // vertical slice.
  private drawBoard(): void {
    this.boardLayer.removeAll(true);
    for (const cell of getAllCells()) {
      const { x, y } = cellToPixel(cell.row, cell.col);
      const content = this.grid.get(cell.row, cell.col);
      const graphics = this.add.graphics();
      if (content.type === 'stone') {
        graphics.fillStyle(COLOR_HEX[content.color], 1);
        graphics.fillCircle(x, y, STONE_RADIUS);
      } else if (content.type === 'special') {
        graphics.fillStyle(0x888888, 1);
        graphics.fillCircle(x, y, STONE_RADIUS);
        const label = this.add.text(x - 8, y - 10, TILE_LABEL[content.tile], {
          fontSize: '14px',
          color: '#000000',
        });
        this.boardLayer.add(label);
      } else if (content.type === 'portal') {
        graphics.fillStyle(0xaa66ff, 1);
        graphics.fillCircle(x, y, STONE_RADIUS);
      }
      this.boardLayer.add(graphics);
    }
  }

  // Redraws the HP text/bar and mirrors the current HP into a DOM
  // attribute so the Playwright e2e test can read it without parsing canvas.
  private drawHp(): void {
    this.hpText.setText(`${this.monster.name}: ${this.monster.hp}/${this.monster.maxHp}`);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x333333, 1);
    this.hpBar.fillRect(20, 50, 300, 16);
    this.hpBar.fillStyle(0xdd3333, 1);
    const ratio = this.monster.hp / this.monster.maxHp;
    this.hpBar.fillRect(20, 50, 300 * ratio, 16);
    document.body.setAttribute('data-monster-hp', String(this.monster.hp));
  }
}
