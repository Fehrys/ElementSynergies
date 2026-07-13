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
import { cellToPixel, cellAtPixel } from './boardGeometry';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from './battleLayout';
import { sanitizeInsets, cssInsetsToGame, clampInsetsToViewport } from './battleLayout';
import type { BattleLayout, ViewportInput } from './battleLayout';
import { readSafeInsetsCss, getCanvasRect, subscribeViewportChanges } from './browserViewport';
import { DEPTH } from './depth';

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
  getBattleLayout(): BattleLayout; // serializable copy of the active layout
  getLayoutRevision(): number; // increments once per applied reflow
  forceReflow(partial?: Partial<ViewportInput>): void; // one-shot; consumed by the next reflow
  getLayerObjectCounts(): Record<string, number>; // per-layer child counts — the idempotency probe
  getSelectionLength(): number; // selected-cell count (0 after a mid-drag cancel)
  getTracePointCount(): number; // drawn trace points (0 after a clear)
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
  private backgroundContainer!: Phaser.GameObjects.Container;
  private environmentContainer!: Phaser.GameObjects.Container;
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
  // The single computed layout every draw method + input reads from. All its
  // coordinates are already global (battleLayout applied the offsets), so every
  // container stays at (0,0) scale 1 with no camera/Container transform.
  private activeLayout!: BattleLayout;
  private layoutRevision = 0;
  // Reflow is deferred + coalesced to the next frame (update()): a burst of
  // resize/forceReflow calls sets this flag at most once per frame.
  private reflowScheduled = false;
  // One-shot ?debug=1 viewport override (last-writer-wins), consumed + cleared by
  // the very next reflow so it never pollutes a later real resize.
  private pendingDebugInput?: ViewportInput;
  // Scene-owned count of the trace geometry actually drawn (NOT a Phaser.Graphics
  // internal), so a test can prove a mid-drag reflow cleared the trace.
  private tracePointCount = 0;

  constructor() {
    super('battle');
  }

  // The viewport the layout is computed for. this.scale.gameSize is the source
  // of truth for size (what Phaser measured under RESIZE — never window.innerWidth
  // read directly); safe-area insets come from the browserViewport DOM adapter,
  // converted to game units, sanitized, and clamped so the safeRect is always
  // valid. The pure layout model itself never reads the DOM.
  private buildViewportInput(): ViewportInput {
    const gameSize = this.scale.gameSize;
    const canvasRect = getCanvasRect(this.game);
    const cssInsets = sanitizeInsets(readSafeInsetsCss()); // DOM → sane CSS px
    const gameInsets = cssInsetsToGame(cssInsets, gameSize, canvasRect); // → game units (no-op under RESIZE)
    const safeInsets = clampInsetsToViewport(gameInsets, gameSize.width, gameSize.height);
    return { width: gameSize.width, height: gameSize.height, safeInsets };
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
        getBattleLayout: () => JSON.parse(JSON.stringify(this.activeLayout)),
        getLayoutRevision: () => this.layoutRevision,
        forceReflow: (partial) => {
          // One-shot, last-writer-wins: overwrites any un-consumed override, is
          // consumed by the VERY NEXT reflow, and cleared there (see reflow()).
          // With no argument it snapshots the real measured input, so it still
          // exercises the real measure path.
          this.pendingDebugInput = { ...this.buildViewportInput(), ...(partial ?? {}) };
          this.scheduleReflow();
        },
        getLayerObjectCounts: () => ({
          background: this.backgroundContainer.length,
          environment: this.environmentContainer.length,
          monster: this.monsterContainer.length,
          hero: this.heroContainer.length,
          table: this.tableContainer.length,
          board: this.boardLayer.length,
          puzzleFeedback: this.puzzleFeedbackContainer.length,
          hud: this.hudContainer.length,
          transientUi: this.transientUiContainer.length,
        }),
        getSelectionLength: () => this.path.length,
        getTracePointCount: () => this.tracePointCount,
      };
    }

    this.grid = new HexGrid();
    fillBoard(this.grid, this.rng);
    this.monster = createMonster('Frost Yeti', 1000);

    // Semantic containers, all at (0,0) scale 1 so absolute cellToPixel
    // coordinates render 1:1 in stage space (never reposition via transforms).
    this.backgroundContainer = this.add.container(0, 0).setDepth(DEPTH.BACKGROUND);
    this.environmentContainer = this.add.container(0, 0).setDepth(DEPTH.ENVIRONMENT);
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

    // Containers are built once; every layer is (re)drawn idempotently through
    // applyLayout, so a reflow recomputes + reapplies without duplicating or
    // leaking objects. layoutRevision starts at 0 (no reflow applied yet).
    this.layoutRevision = 0;
    this.applyLayout(computeBattleLayout(this.buildViewportInput(), DEFAULT_BATTLE_LAYOUT_POLICY));

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', () => this.onPointerUp());

    // Every viewport signal only requests a reflow (never passes width/height);
    // the reflow reads this.scale.gameSize as the source of truth. The M3
    // coalescer collapses a simultaneous Phaser + browser burst to one reflow
    // per frame. subscribeViewportChanges catches signals Phaser's Scale resize
    // can miss (mobile URL-bar show/hide, rotation).
    const onResize = (): void => this.scheduleReflow();
    this.scale.on('resize', onResize);
    const unsubscribe = subscribeViewportChanges(() => this.scheduleReflow());

    // Tear down every listener on scene shutdown/destroy so a scene restart never
    // stacks handlers or reflows a dead scene.
    const teardown = (): void => {
      this.input.off('pointerdown');
      this.input.off('pointermove');
      this.input.off('pointerup');
      this.scale.off('resize', onResize);
      unsubscribe();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);

    // Lets Playwright wait for/assert on scene state via plain DOM reads,
    // since Phaser renders to canvas and isn't otherwise inspectable.
    document.body.setAttribute('data-scene', 'battle');
  }

  // Idempotent full redraw of every layer from the given layout. Each draw
  // method clears its own container first, so applying a layout twice yields
  // identical per-layer object counts (the reflow idempotency guarantee).
  private applyLayout(layout: BattleLayout): void {
    this.activeLayout = layout;
    this.drawBackground();
    this.drawEnvironment();
    this.drawTable();
    this.drawBoard();
    this.drawHp();
    this.drawCharacterPlaceholders();
    this.drawTraceLine(); // keeps an in-progress trace consistent if not cancelled
    if (isDefeated(this.monster)) this.checkVictory();
  }

  // Collapses a burst of resize/forceReflow calls to a single applied reflow on
  // the next frame (see update()). Never reflows synchronously inside a handler.
  private scheduleReflow(): void {
    this.reflowScheduled = true;
  }

  // Phaser calls this every frame. The deferred reflow is applied here, exactly
  // once per scheduled burst, with no tween.
  update(): void {
    if (!this.reflowScheduled) return;
    this.reflowScheduled = false;
    this.reflow();
  }

  // Recompute + apply the layout for the current (or one-shot overridden)
  // viewport. A mid-drag reflow cancels the selection WITHOUT resolving a turn,
  // and the reflow itself consumes no RNG and mutates no board state.
  private reflow(): void {
    if (this.dragging) {
      this.dragging = false;
      this.path = [];
      this.traceGraphics.clear();
      this.tracePointCount = 0;
    }
    const input = this.pendingDebugInput ?? this.buildViewportInput();
    this.pendingDebugInput = undefined; // consumed → cleared
    this.applyLayout(computeBattleLayout(input, DEFAULT_BATTLE_LAYOUT_POLICY));
    this.layoutRevision += 1; // completion signal (observable under ?debug=1)
  }

  // Hit-tests a pointer position against every cell's rendered center via the
  // shared board geometry — nearest admissible cell within hitRadius (or null),
  // the same function the Vitest/Playwright specs use.
  private cellAt(x: number, y: number): CellCoord | null {
    return cellAtPixel({ x, y }, getAllCells(), this.activeLayout.board);
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
    this.tracePointCount = 0;

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
    // Never stack banners: clear the transient layer before (re)adding, so a
    // reflow after victory re-lays-out a single banner rather than duplicating it.
    this.transientUiContainer.removeAll(true);
    if (isDefeated(this.monster)) {
      // Centered on the background, at the vertical center of the battle→table
      // transition (table rear edge → tile top), so the banner reads over both
      // the scene background and the table surface. All reads are global.
      const y = (this.activeLayout.table.y + this.activeLayout.board.tileBounds.y) / 2;
      const victoryText = this.add
        .text(this.activeLayout.background.width / 2, y, 'Victory!', { fontSize: '32px', color: '#ffffff' })
        .setOrigin(0.5, 0.5);
      this.transientUiContainer.add(victoryText);
      document.body.setAttribute('data-scene', 'victory');
    }
  }

  // Full redraw of every cell from current grid state — simple or
  // correct is preferred over incremental/animated updates for this
  // vertical slice.
  private drawBoard(): void {
    this.boardLayer.removeAll(true);
    const board = this.activeLayout.board;
    const radius = board.visualRadius;
    for (const cell of getAllCells()) {
      const { x, y } = cellToPixel(board, cell.row, cell.col);
      const content = this.grid.get(cell.row, cell.col);
      const graphics = this.add.graphics();
      this.boardLayer.add(graphics);
      if (content.type === 'stone') {
        graphics.fillStyle(COLOR_HEX[content.color], 1);
        graphics.fillCircle(x, y, radius);
      } else if (content.type === 'special') {
        graphics.fillStyle(0x888888, 1);
        graphics.fillCircle(x, y, radius);
        const label = this.add.text(x - 10, y - 11, TILE_LABEL[content.tile], {
          fontSize: '18px',
          color: '#000000',
        });
        this.boardLayer.add(label);
      } else if (content.type === 'portal') {
        graphics.fillStyle(0xaa66ff, 1);
        graphics.fillCircle(x, y, radius);
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
    if (this.path.length < 2) {
      this.tracePointCount = 0; // nothing drawn (empty/single-cell selection)
      return;
    }
    this.traceGraphics.lineStyle(4, 0xffffff, 1);
    this.traceGraphics.beginPath();
    const board = this.activeLayout.board;
    const first = cellToPixel(board, this.path[0].row, this.path[0].col);
    this.traceGraphics.moveTo(first.x, first.y);
    for (let i = 1; i < this.path.length; i++) {
      const p = cellToPixel(board, this.path[i].row, this.path[i].col);
      this.traceGraphics.lineTo(p.x, p.y);
    }
    this.traceGraphics.strokePath();
    this.tracePointCount = this.path.length; // one drawn point per selected cell
  }

  // Persistent full-canvas background placeholder (stand-in for a future
  // battle_background_* asset), replacing the flat Phaser config color. Two
  // broad value zones — a darker upper arena wall and a slightly warmer/deeper
  // lower work area behind the table — meet on a soft curved horizon (a wide
  // overlapping ellipse plus low-alpha feather bands) rather than a hard,
  // UI-like divider. Drawn ONCE; never touched by drawBoard(); non-interactive.
  private drawBackground(): void {
    this.backgroundContainer.removeAll(true); // idempotent: safe to redraw on reflow
    const bg = this.activeLayout.background;
    const g = this.add.graphics();
    const upper = 0x262042; // darker arena wall
    const lower = 0x2e2636; // slightly warmer/deeper work area behind the table
    // Base value covers the whole background/viewport.
    g.fillStyle(upper, 1);
    g.fillRect(bg.x, bg.y, bg.width, bg.height);
    // Lower work area; its top is softened into a curved horizon by a wide
    // ellipse that overlaps upward, so the two zones never meet on a straight line.
    const horizonY = this.activeLayout.environment.horizonY; // behind/above the table rear edge
    g.fillStyle(lower, 1);
    g.fillRect(bg.x, horizonY, bg.width, bg.height - horizonY);
    g.fillEllipse(bg.width / 2, horizonY, bg.width * 1.5, 150);
    // Low-alpha bands feather the meeting of the two zones (no UI divider).
    g.fillStyle(lower, 0.3);
    g.fillRect(bg.x, horizonY - 70, bg.width, 70);
    g.fillStyle(upper, 0.2);
    g.fillRect(bg.x, horizonY, bg.width, 50);
    this.backgroundContainer.add(g);
  }

  // Minimal, persistent environmental framing placeholder (stand-in for future
  // props). Controlled asymmetry — a heavier cupboard silhouette on the left, a
  // lighter set of hanging cookware on the right, and one off-center alcove arch
  // behind the boss — so it frames the monster instead of reading as a symmetric
  // dashboard. Flat Graphics only, non-interactive, all kept at y < 260 so no
  // prop touches the tile bounds. Drawn ONCE; never touched by drawBoard().
  private drawEnvironment(): void {
    this.environmentContainer.removeAll(true); // idempotent: safe to redraw on reflow
    const g = this.add.graphics();
    // Off-center alcove arch behind the monster (slightly lighter than the wall).
    g.fillStyle(0x2f2950, 1);
    g.fillEllipse(230, 70, 300, 220);
    // Left: a heavier cupboard/shelf silhouette.
    g.fillStyle(0x231c14, 1);
    g.fillRoundedRect(4, 84, 66, 168, 10);
    g.fillStyle(0x2c2318, 1);
    g.fillRect(10, 150, 54, 8); // one shelf line
    // Right: lighter hanging cookware — deliberately NOT a mirror of the left.
    g.fillStyle(0x241d16, 1);
    g.fillRect(436, 56, 6, 86); // hanging rod
    g.fillCircle(439, 150, 15); // a pan/ladle head
    g.fillRect(452, 56, 6, 60); // second, shorter rod
    g.fillRoundedRect(447, 116, 26, 16, 4); // a small hanging lantern/box
    this.environmentContainer.add(g);
  }

  // Persistent preparation-table surface, drawn ONCE in create(). Lives in
  // its own container below the tile layer; drawBoard() never touches it, so
  // rebuilding tiles can never destroy the table (a persistent layer). The
  // footprint is derived from the real tile bounds — the art fits the engine,
  // not the reverse.
  private drawTable(): void {
    this.tableContainer.removeAll(true); // idempotent: safe to redraw on reflow
    const t = this.activeLayout.table;
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
    const hud = this.activeLayout.bossHud;
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
    // Idempotent: this method draws into both the monster and hero containers,
    // so clear both before redrawing on a reflow.
    this.monsterContainer.removeAll(true);
    this.heroContainer.removeAll(true);
    // Monster: dominant silhouette + contact shadow, centered in the monster band.
    const m = this.activeLayout.boss;
    const mCenterX = m.x + m.width / 2;
    const mShadow = this.add.graphics();
    mShadow.fillStyle(0x000000, 0.25);
    mShadow.fillEllipse(mCenterX, m.y + m.height - 6, m.width * 0.7, 24);
    const mShape = this.add.graphics();
    mShape.fillStyle(0x7a4fb5, 1);
    mShape.fillRoundedRect(m.x, m.y, m.width, m.height, 28);
    // No internal name label: the boss name lives in the centered HP HUD, and a
    // label inside the shape made the silhouette read as a UI button.
    this.monsterContainer.add([mShadow, mShape]);

    // Heroes: one flat capsule per roster entry, evenly spaced across the
    // board width band (bottom-center anchored so future sprites can share
    // the footprint), each with a small contact shadow. Their lower edge sinks
    // behind the table's rear edge (grounded by the layout), so the table lip
    // masks the bottom few pixels. No name labels: the previous ones sat behind
    // the table and were never visible.
    ROSTER.forEach((character, i) => {
      const h = this.activeLayout.heroes[i];
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
