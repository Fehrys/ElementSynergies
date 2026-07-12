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
import { cellToPixel, STONE_RADIUS, tileBounds } from './boardLayout';
import {
  computeLayoutRegions,
  computePlaceholderLayout,
  computeTableBounds,
  computeBossHudLayout,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from './compositionLayout';
import { DEPTH } from './depth';

export { ORIGIN_X, ORIGIN_Y, COL_WIDTH, ROW_HEIGHT, STONE_RADIUS, cellToPixel } from './boardLayout';

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
  setMonsterHp(hp: number): void;
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
  private monsterContainer!: Phaser.GameObjects.Container;
  private heroContainer!: Phaser.GameObjects.Container;
  private tableContainer!: Phaser.GameObjects.Container;
  private boardLayer!: Phaser.GameObjects.Container;
  private puzzleFeedbackContainer!: Phaser.GameObjects.Container;
  private hudContainer!: Phaser.GameObjects.Container;
  private transientUiContainer!: Phaser.GameObjects.Container;
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
        setMonsterHp: (hp) => {
          this.monster = { ...this.monster, hp: Math.max(0, Math.min(hp, this.monster.maxHp)) };
          this.drawHp();
          this.checkVictory();
        },
      };
    }

    this.grid = new HexGrid();
    fillBoard(this.grid, this.rng);
    this.monster = createMonster('Frost Yeti', 1000);

    // Semantic containers, all at (0,0) scale 1 so absolute cellToPixel
    // coordinates render 1:1 in stage space (never reposition via transforms).
    this.monsterContainer = this.add.container(0, 0).setDepth(DEPTH.MONSTER);
    this.heroContainer = this.add.container(0, 0).setDepth(DEPTH.HERO);
    this.tableContainer = this.add.container(0, 0).setDepth(DEPTH.TABLE);
    this.boardLayer = this.add.container(0, 0).setDepth(DEPTH.BOARD);
    this.puzzleFeedbackContainer = this.add.container(0, 0).setDepth(DEPTH.PUZZLE_FEEDBACK);
    this.hudContainer = this.add.container(0, 0).setDepth(DEPTH.HUD);
    this.transientUiContainer = this.add.container(0, 0).setDepth(DEPTH.TRANSIENT_UI);

    this.traceGraphics = this.add.graphics();
    this.puzzleFeedbackContainer.add(this.traceGraphics);
    // Centered above the monster (origin 0.5,0); exact position is set from the
    // composition layout in drawHp().
    this.hpText = this.add.text(0, 0, '', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5, 0);
    this.hpBar = this.add.graphics();
    this.hudContainer.add([this.hpBar, this.hpText]);

    this.drawTable();
    this.drawBoard();
    this.drawHp();
    this.drawCharacterPlaceholders();

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

    this.checkVictory();
  }

  // Shared by onPointerUp and the debug setMonsterHp hook so there is
  // exactly one defeat-check code path.
  private checkVictory(): void {
    if (isDefeated(this.monster)) {
      const victoryText = this.add.text(140, 400, 'Victory!', {
        fontSize: '32px',
        color: '#ffffff',
      });
      this.transientUiContainer.add(victoryText);
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

  // Persistent preparation-table surface, drawn ONCE in create(). Lives in
  // its own container below the tile layer; drawBoard() never touches it, so
  // rebuilding tiles can never destroy the table (a persistent layer). The
  // footprint is derived from the real tile bounds — the art fits the engine,
  // not the reverse.
  private drawTable(): void {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const t = computeTableBounds(regions, tileBounds());
    const g = this.add.graphics();
    g.fillStyle(0x6b4a30, 1);
    g.fillRoundedRect(t.x, t.y, t.width, t.height, 24);
    // A slightly darker rear-edge band to hint thickness/depth — still flat,
    // no gradient/asset.
    g.fillStyle(0x543a25, 1);
    g.fillRoundedRect(t.x, t.y, t.width, 18, 9);
    this.tableContainer.add(g);
  }

  // Redraws the HP text/bar and mirrors the current HP into a DOM
  // attribute so the Playwright e2e test can read it without parsing canvas.
  private drawHp(): void {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const hud = computeBossHudLayout(regions);
    const bar = hud.bar;

    this.hpText.setText(`${this.monster.name}: ${this.monster.hp}/${this.monster.maxHp}`);
    this.hpText.setPosition(hud.text.x, hud.text.y);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x333333, 1);
    this.hpBar.fillRect(bar.x, bar.y, bar.width, bar.height);
    this.hpBar.fillStyle(0xdd3333, 1);
    const ratio = this.monster.hp / this.monster.maxHp;
    this.hpBar.fillRect(bar.x, bar.y, bar.width * ratio, bar.height);
    document.body.setAttribute('data-monster-hp', String(this.monster.hp));
  }

  // Flat production-footprint placeholders for the monster and the 4-hero
  // brigade, positioned from the composition layout — replaces the old
  // rectangle-card lineup. Drawn once in create(): only HP changes
  // turn-to-turn (handled by drawHp()); identity does not. Shapes are flat
  // (no assets), but their bounds, anchors, shadows, and overlap already
  // match the intended final footprints. See
  // docs/superpowers/specs/2026-07-11-battle-scene-composition-design.md.
  private drawCharacterPlaceholders(): void {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const layout = computePlaceholderLayout(regions);

    // Monster: dominant silhouette + contact shadow, centered in the monster band.
    const m = layout.monster;
    const mCenterX = m.x + m.width / 2;
    const mShadow = this.add.graphics();
    mShadow.fillStyle(0x000000, 0.25);
    mShadow.fillEllipse(mCenterX, m.y + m.height - 6, m.width * 0.7, 24);
    const mShape = this.add.graphics();
    mShape.fillStyle(0x7a4fb5, 1);
    mShape.fillRoundedRect(m.x, m.y, m.width, m.height, 28);
    const mLabel = this.add
      .text(mCenterX, m.y + m.height / 2, this.monster.name, {
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);
    this.monsterContainer.add([mShadow, mShape, mLabel]);

    // Heroes: one flat capsule per roster entry, evenly spaced across the
    // board width band (bottom-center anchored so future sprites can share
    // the footprint), each with a small contact shadow. Their lower edge sinks
    // behind the table's rear edge (grounded by the layout), so the table lip
    // masks the bottom few pixels. No name labels: the previous ones sat behind
    // the table and were never visible.
    ROSTER.forEach((character, i) => {
      const h = layout.heroes[i];
      const cx = h.x + h.width / 2;
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.25);
      shadow.fillEllipse(cx, h.y + h.height - 2, h.width * 0.8, 12);
      const shape = this.add.graphics();
      shape.fillStyle(COLOR_HEX[character.color], 1);
      shape.fillRoundedRect(h.x, h.y, h.width, h.height, 16);
      this.heroContainer.add([shadow, shape]);
    });
  }
}
