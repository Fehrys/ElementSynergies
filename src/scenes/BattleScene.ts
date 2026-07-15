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
import { drawSpecialTileIcon } from './specialTileIcons';
import { DEPTH } from './depth';
import { parseArtReviewMode, parseArtGuides, parseAssetSlots, computeCoverFit } from './combatBackgroundReview';
import type { ArtReviewMode } from './combatBackgroundReview';
import { computeBattleEnvironmentLayout, placementToRect, DEFAULT_ENVIRONMENT_SLOT_POLICY } from './battleEnvironmentLayout';
import type { BattleEnvironmentRole } from '../assets/battleEnvironmentAssets';
import { BATTLE_ENVIRONMENT_ASSETS } from '../assets/battleEnvironmentAssets';
import combatBackgroundTargetUrl from '../../design/references/combat-background-target.png?url';

// Temporary art-review-only asset (see
// docs/superpowers/specs/2026-07-14-combat-background-art-review-design.md).
// Never loaded/used unless ?artReview=combatBackground is present.
const ART_REVIEW_BACKGROUND_KEY = 'combat-background-target';

// Diagnostic colors for the &assetSlots=1 lot-01 slot overlay — one distinct
// color per environment role (presentation only; geometry comes exclusively
// from battleEnvironmentLayout).
const ASSET_SLOT_COLORS: Record<BattleEnvironmentRole, number> = {
  upperArchitecture: 0x4d79ff,
  stoneFloor: 0x00c2a8,
  leftHearth: 0xff8c3a,
  rightLarder: 0x6fce44,
  prepTableBase: 0xd8a03c,
  cuttingBoard: 0xe85bd8,
};

// Where each slot's small technical label sits inside its rect, so labels of
// adjacent/nested slots never stack on the same corner.
const ASSET_SLOT_LABEL_ANCHORS: Record<BattleEnvironmentRole, { x: number; y: number }> = {
  upperArchitecture: { x: 0, y: 0 },
  stoneFloor: { x: 0, y: 0 },
  leftHearth: { x: 0, y: 0 },
  rightLarder: { x: 1, y: 0 },
  prepTableBase: { x: 0, y: 1 },
  cuttingBoard: { x: 0.5, y: 0 },
};

const COLOR_HEX: Record<ElementColor, number> = {
  red: 0xe74c3c,
  green: 0x2ecc71,
  yellow: 0xf1c40f,
  blue: 0x3498db,
};

// Special-tile and portal glyphs are drawn by the deterministic, project-owned
// vector icon renderer in ./specialTileIcons (no system font / emoji), so they
// rasterize identically on every platform. See
// docs/superpowers/plans/2026-07-14-special-tile-icons-decision.md.

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
  getArtReviewInfo(): { mode: ArtReviewMode; guides: boolean } | null; // art review debug surface
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
  // Art review mode only (see combatBackgroundReview.ts): always created, but
  // stays empty and unused whenever artReviewMode === 'none'.
  private artReviewBackgroundContainer!: Phaser.GameObjects.Container;
  private artGuidesContainer!: Phaser.GameObjects.Container;
  private assetSlotsContainer!: Phaser.GameObjects.Container;
  private artReviewBackgroundSprite?: Phaser.GameObjects.Image;
  private artReviewMode: ArtReviewMode = 'none';
  private artGuidesEnabled = false;
  private assetSlotsEnabled = false;
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

  // Runs before preload()/create(): parses the art-review query flags once,
  // deterministically, so the mode is known before the first load or layout.
  init(): void {
    this.artReviewMode = parseArtReviewMode(window.location.search);
    this.artGuidesEnabled = parseArtGuides(window.location.search);
    this.assetSlotsEnabled = parseAssetSlots(window.location.search);
  }

  // Queues the art-review reference image only when the mode is active, so
  // normal play never loads or references this asset. Phaser's scene
  // lifecycle blocks create() until the load queue completes, so by the time
  // create() runs the texture is guaranteed available — no extra "loaded"
  // signal is needed.
  preload(): void {
    if (this.artReviewMode === 'combatBackground') {
      this.load.image(ART_REVIEW_BACKGROUND_KEY, combatBackgroundTargetUrl);
    }
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
          artReviewBackground: this.artReviewBackgroundContainer.length,
          artGuides: this.artGuidesContainer.length,
          assetSlots: this.assetSlotsContainer.length,
        }),
        getSelectionLength: () => this.path.length,
        getTracePointCount: () => this.tracePointCount,
        getArtReviewInfo: () =>
          this.artReviewMode === 'none' ? null : { mode: this.artReviewMode, guides: this.artGuidesEnabled },
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
    // Art review mode only: created unconditionally (cheap, empty) so normal
    // play carries the same nine-container structure it always has, plus two
    // inert containers that only ever receive content when the mode is active.
    this.artReviewBackgroundContainer = this.add.container(0, 0).setDepth(DEPTH.BACKGROUND);
    this.artGuidesContainer = this.add.container(0, 0).setDepth(DEPTH.DEBUG);
    this.assetSlotsContainer = this.add.container(0, 0).setDepth(DEPTH.DEBUG);

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

    // Art review DOM surface: only present when the mode is active, so normal
    // play's DOM is completely unaffected. By this point preload() already
    // blocked until the texture loaded and applyLayout() above already placed
    // it and drew every gameplay layer, so "ready" can be set unconditionally.
    if (this.artReviewMode !== 'none') {
      document.body.setAttribute('data-art-review', this.artReviewMode);
      document.body.setAttribute('data-art-guides', String(this.artGuidesEnabled));
      document.body.setAttribute('data-art-review-ready', 'true');
      // Lot-01 slot overlay surface: `ready` is only set here, AFTER the first
      // applyLayout() above already ran drawAssetSlots() over a fully computed
      // layout — so waiting on it guarantees the six slots exist and
      // data-asset-slots-layout holds the first complete computation.
      if (this.assetSlotsEnabled) {
        document.body.setAttribute('data-asset-slots', 'true');
        document.body.setAttribute('data-asset-slots-ready', 'true');
      }
    }
  }

  // Idempotent full redraw of every layer from the given layout. Each draw
  // method clears its own container first, so applying a layout twice yields
  // identical per-layer object counts (the reflow idempotency guarantee).
  private applyLayout(layout: BattleLayout): void {
    this.activeLayout = layout;
    this.drawBackground();
    this.drawArtReviewBackground(); // no-op unless artReviewMode === 'combatBackground'
    this.drawEnvironment();
    this.drawTable();
    this.drawBoard();
    this.drawHp();
    this.drawCharacterPlaceholders();
    this.drawArtGuides(); // no-op unless artReviewMode === 'combatBackground' && artGuidesEnabled
    this.drawAssetSlots(); // no-op unless artReviewMode === 'combatBackground' && assetSlotsEnabled
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
        drawSpecialTileIcon(this, this.boardLayer, content.tile, { x, y }, radius);
      } else if (content.type === 'portal') {
        graphics.fillStyle(0xaa66ff, 1);
        graphics.fillCircle(x, y, radius);
        drawSpecialTileIcon(this, this.boardLayer, 'portal', { x, y }, radius);
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
    // Art review mode masks the provisional colored background: the review
    // background (the master reference image) is drawn separately, in its own
    // container, by drawArtReviewBackground().
    if (this.artReviewMode === 'combatBackground') return;
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
    // Art review mode masks the provisional arch/cupboard/cookware silhouettes:
    // the master reference image already provides this framing.
    if (this.artReviewMode === 'combatBackground') return;
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

  // Persistent lower-composition-band placeholder, drawn ONCE in create(). Lives in
  // its own container below the tile layer; drawBoard() never touches it. Since
  // 2026-07-14 `layout.table` is a full-bleed rect from the combat/prep separation
  // line to the bottom of the viewport (see battleLayout.ts), not a tile-hugging box,
  // so it's rendered as a flat full-width panel rather than a tile-fitted rounded card.
  private drawTable(): void {
    this.tableContainer.removeAll(true); // idempotent: safe to redraw on reflow
    // Art review mode masks the full brown table placeholder: the master
    // reference image's chopping board must stay visible behind the board.
    if (this.artReviewMode === 'combatBackground') return;
    const t = this.activeLayout.table;
    const g = this.add.graphics();
    g.fillStyle(0x6b4a30, 1);
    g.fillRect(t.x, t.y, t.width, t.height);
    // A slightly darker rear-edge band to hint thickness/depth — still flat,
    // no gradient/asset.
    g.fillStyle(0x543a25, 1);
    g.fillRect(t.x, t.y, t.width, 18);
    this.tableContainer.add(g);
  }

  // Art review mode only. No-op (and keeps the container empty) unless
  // artReviewMode === 'combatBackground'. The sprite is created ONCE, lazily,
  // then only resized/repositioned on every subsequent call — never destroyed
  // or recreated — so a reflow can never duplicate it. Placement always comes
  // from computeCoverFit() over the live texture size and the current
  // activeLayout.background, never a hard-coded number.
  private drawArtReviewBackground(): void {
    if (this.artReviewMode !== 'combatBackground') {
      this.artReviewBackgroundContainer.removeAll(true);
      this.artReviewBackgroundSprite = undefined;
      return;
    }
    if (!this.artReviewBackgroundSprite) {
      this.artReviewBackgroundSprite = this.add.image(0, 0, ART_REVIEW_BACKGROUND_KEY).setOrigin(0.5, 0.5);
      this.artReviewBackgroundContainer.add(this.artReviewBackgroundSprite);
    }
    const source = this.textures.get(ART_REVIEW_BACKGROUND_KEY).getSourceImage();
    const viewport = this.activeLayout.background;
    const fit = computeCoverFit(source.width, source.height, viewport.width, viewport.height);
    this.artReviewBackgroundSprite.setDisplaySize(fit.displayWidth, fit.displayHeight);
    this.artReviewBackgroundSprite.setPosition(fit.x, fit.y);
    document.body.setAttribute('data-art-background-loaded', 'true');
    document.body.setAttribute('data-art-review-info', JSON.stringify(fit));
  }

  // Art review mode only. No-op (and keeps the container empty) unless both
  // artReviewMode === 'combatBackground' and artGuidesEnabled. Every guide is
  // read directly from activeLayout — no hand-copied coordinate — so a resize
  // recomputes them for free through the existing applyLayout()/reflow path.
  private drawArtGuides(): void {
    this.artGuidesContainer.removeAll(true); // idempotent: safe to redraw on reflow
    if (this.artReviewMode !== 'combatBackground' || !this.artGuidesEnabled) return;
    const layout = this.activeLayout;
    const g = this.add.graphics();

    const strokeRect = (r: { x: number; y: number; width: number; height: number }): void => {
      g.strokeRect(r.x, r.y, r.width, r.height);
    };

    g.lineStyle(1, 0x00ffff, 0.7);
    strokeRect(layout.boss);
    for (const hero of layout.heroes) strokeRect(hero);
    strokeRect(layout.table);
    strokeRect(layout.board.tileBounds);

    g.lineStyle(1, 0x00ff88, 0.5);
    strokeRect(layout.gameplayColumn);

    g.lineStyle(1, 0xffff00, 0.35);
    const col = layout.gameplayColumn;
    for (const band of Object.values(layout.bands)) {
      g.lineBetween(col.x, band.top, col.x + col.width, band.top);
      g.lineBetween(col.x, band.bottom, col.x + col.width, band.bottom);
    }

    // Very-low-alpha hit-radius guides per cell, kept faint enough not to
    // compete with the tile art or the other guides.
    g.lineStyle(1, 0xff00ff, 0.1);
    for (const cell of getAllCells()) {
      const p = cellToPixel(layout.board, cell.row, cell.col);
      g.strokeCircle(p.x, p.y, layout.board.hitRadius);
    }

    this.artGuidesContainer.add(g);
  }

  // Lot-01 production overlay (&assetSlots=1, only inside the combatBackground
  // review mode). Draws the six FUTURE environment assets' placements as
  // semi-transparent role-colored rects + one small technical label each
  // (diagnostic only — no UI panel). Geometry comes exclusively from
  // computeBattleEnvironmentLayout(activeLayout) — no hand-copied coordinate —
  // so every reflow recomputes the slots for free through applyLayout(), and
  // the removeAll(true) keeps the redraw idempotent (no accumulation).
  private drawAssetSlots(): void {
    this.assetSlotsContainer.removeAll(true);
    if (this.artReviewMode !== 'combatBackground' || !this.assetSlotsEnabled) return;
    const env = computeBattleEnvironmentLayout(this.activeLayout);
    const g = this.add.graphics();
    this.assetSlotsContainer.add(g);
    for (const def of BATTLE_ENVIRONMENT_ASSETS) {
      const rect = placementToRect(env[def.role]);
      const color = ASSET_SLOT_COLORS[def.role];
      g.fillStyle(color, 0.18);
      g.fillRect(rect.x, rect.y, rect.width, rect.height);
      g.lineStyle(1, color, 0.9);
      g.strokeRect(rect.x, rect.y, rect.width, rect.height);

      const anchor = ASSET_SLOT_LABEL_ANCHORS[def.role];
      const label = this.add
        .text(rect.x + 4 + anchor.x * (rect.width - 8), rect.y + 4 + anchor.y * (rect.height - 8), def.key, {
          fontSize: '10px',
          color: `#${color.toString(16).padStart(6, '0')}`,
          backgroundColor: 'rgba(0,0,0,0.6)',
        })
        .setOrigin(anchor.x, anchor.y);
      this.assetSlotsContainer.add(label);
    }
    // Serialized six-slot layout + the active slot policy, observable without
    // canvas reads (and without ?debug=1): e2e cross-checks both against the
    // same pure module in Node.
    document.body.setAttribute('data-asset-slots-layout', JSON.stringify(env));
    document.body.setAttribute('data-asset-slots-policy', JSON.stringify(DEFAULT_ENVIRONMENT_SLOT_POLICY));
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
