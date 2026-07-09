import Phaser from 'phaser';
import {
  HexGrid,
  CellCoord,
  CellContent,
  ElementColor,
  SpecialTileType,
  getAllCells,
  fillBoard,
} from '../core/grid';
import { canExtendChain } from '../core/chain';
import { mulberry32, RandomFn } from '../core/rng';
import { ROSTER, createMonster, applyDamage, isDefeated, Monster } from '../core/combat';
import { resolveTurn, ResolutionResult } from '../core/resolution';
import { cellToPixel } from './boardLayout';

export { ORIGIN_X, ORIGIN_Y, COL_WIDTH, ROW_HEIGHT, cellToPixel } from './boardLayout';

const STONE_RADIUS = 22;

const COLOR_HEX: Record<ElementColor, number> = {
  red: 0xe74c3c,
  green: 0x2ecc71,
  yellow: 0xf1c40f,
  blue: 0x3498db,
};

// Emoji standing in for real icons/art in this vertical-slice prototype.
// Dynamite and Double Sword get their own distinct glyph (a dynamite
// stick, crossed swords) rather than doubled text since good single
// glyphs exist; Double Arrow Bow uses a gun rather than a doubled bow.
const TILE_LABEL: Record<SpecialTileType, string> = {
  bomb: '💣',
  sword: '🗡️',
  bow: '🏹',
  dynamite: '🧨',
  doubleSword: '⚔️',
  doubleArrowBow: '🔫',
};

// The portal's own icon — a rainbow bridge between colors, distinct
// from all six special-tile emoji above.
const PORTAL_LABEL = '🌈';

// Test-only surface for Playwright, active only behind `?debug=1` — never
// touched by real gameplay code. See
// docs/superpowers/specs/2026-07-09-playwright-debug-mode-design.md.
export interface DebugApi {
  lastTurn: ResolutionResult | null;
  spawnTile(row: number, col: number, tile: SpecialTileType): void;
  spawnPortal(row: number, col: number): void;
  getBoard(): { row: number; col: number; content: CellContent }[];
}

declare global {
  interface Window {
    __debug?: DebugApi;
  }
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
  private traceGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super('battle');
  }

  create(): void {
    // A `?seed=N` query param swaps in a deterministic RNG so e2e tests
    // (and manual debugging) can reproduce an exact board; otherwise use
    // real randomness.
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    this.rng = seedParam ? mulberry32(Number(seedParam)) : Math.random;

    if (params.get('debug') === '1') {
      window.__debug = {
        lastTurn: null,
        spawnTile: (row, col, tile) => {
          this.grid.set(row, col, { type: 'special', tile });
          this.drawBoard();
        },
        spawnPortal: (row, col) => {
          this.grid.set(row, col, { type: 'portal' });
          this.drawBoard();
        },
        getBoard: () =>
          getAllCells().map((cell) => ({
            row: cell.row,
            col: cell.col,
            content: this.grid.get(cell.row, cell.col),
          })),
      };
    }

    this.grid = new HexGrid();
    fillBoard(this.grid, this.rng);
    this.monster = createMonster('Frost Yeti', 1000);

    this.boardLayer = this.add.container(0, 0);
    this.traceGraphics = this.add.graphics();
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
    this.drawTraceLine();
  }

  // Extends the in-progress path only when canExtendChain accepts the
  // new cell — anything it rejects is simply ignored, so a chain that's
  // valid so far can never be broken by a bad step later in the drag.
  // Dragging back onto the second-to-last cell backtracks one step
  // instead of being legality-checked. Only min-length is still
  // deferred to release, via validateChain (a single-step check can't
  // know the eventual chain's total length).
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    const cell = this.cellAt(pointer.x, pointer.y);
    if (!cell) return;
    const last = this.path[this.path.length - 1];
    if (last.row === cell.row && last.col === cell.col) return;

    if (this.path.length >= 2) {
      const secondLast = this.path[this.path.length - 2];
      if (secondLast.row === cell.row && secondLast.col === cell.col) {
        this.path.pop();
        this.drawTraceLine();
        return;
      }
    }

    if (this.path.some((c) => c.row === cell.row && c.col === cell.col)) return;
    if (!canExtendChain(this.grid, this.path, cell)) return;

    this.path.push(cell);
    this.drawTraceLine();
  }

  // On release, hands the whole dragged path to the core engine, applies
  // whatever damage came back, redraws, and checks for victory.
  private onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;

    // A portal can never legally be the last cell of a chain
    // (validateChain enforces this) — if the drag ended on one, drop it
    // before submitting rather than let a single trailing portal cancel
    // an otherwise-valid chain that was accumulated before it.
    if (this.path.length > 0) {
      const last = this.path[this.path.length - 1];
      if (this.grid.get(last.row, last.col).type === 'portal') {
        this.path.pop();
      }
    }

    const result = resolveTurn(this.grid, ROSTER, this.path, this.rng);
    this.path = [];
    this.traceGraphics.clear();

    if (window.__debug) {
      window.__debug.lastTurn = result;
    }

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
      this.boardLayer.add(graphics);
      if (content.type === 'stone') {
        graphics.fillStyle(COLOR_HEX[content.color], 1);
        graphics.fillCircle(x, y, STONE_RADIUS);
      } else if (content.type === 'special') {
        graphics.fillStyle(0x888888, 1);
        graphics.fillCircle(x, y, STONE_RADIUS);
        const label = this.add.text(x - 10, y - 11, TILE_LABEL[content.tile], {
          fontSize: '18px',
          color: '#000000',
        });
        this.boardLayer.add(label);
      } else if (content.type === 'portal') {
        graphics.fillStyle(0xaa66ff, 1);
        graphics.fillCircle(x, y, STONE_RADIUS);
        const label = this.add.text(x - 10, y - 11, PORTAL_LABEL, {
          fontSize: '18px',
          color: '#000000',
        });
        this.boardLayer.add(label);
      }
    }
  }

  // Draws the white connecting line for the current in-progress drag —
  // straight cell-to-cell segments only. Redrawn from scratch on every
  // accepted path change, matching drawBoard()'s "simple full redraw"
  // convention.
  private drawTraceLine(): void {
    this.traceGraphics.clear();
    if (this.path.length < 2) return;
    this.traceGraphics.lineStyle(4, 0xffffff, 1);
    this.traceGraphics.beginPath();
    const first = cellToPixel(this.path[0].row, this.path[0].col);
    this.traceGraphics.moveTo(first.x, first.y);
    for (let i = 1; i < this.path.length; i++) {
      const p = cellToPixel(this.path[i].row, this.path[i].col);
      this.traceGraphics.lineTo(p.x, p.y);
    }
    this.traceGraphics.strokePath();
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
