import type Phaser from 'phaser'; // type-only: erased at runtime, so this module has no Phaser runtime dependency and stays Vitest-testable
import type { SpecialTileType } from '../core/grid';

// The presentation layer draws an icon for every special tile AND for the
// portal. `portal` is not a core `SpecialTileType` (it is its own CellContent),
// so the icon system speaks a superset union WITHOUT touching core types.
export type SpecialTileIconType = SpecialTileType | 'portal';

// Compile-time exhaustiveness for the icon roster: this Record literal fails to
// type-check if a `SpecialTileIconType` member is missing, so adding a new core
// SpecialTileType forces a new entry here (and a new `case` in `buildIcon`).
const ICON_PRESENCE: Record<SpecialTileIconType, true> = {
  bomb: true,
  sword: true,
  bow: true,
  dynamite: true,
  doubleSword: true,
  doubleArrowBow: true,
  portal: true,
};

export const SPECIAL_TILE_ICON_TYPES = Object.keys(ICON_PRESENCE) as SpecialTileIconType[];

export interface Vec {
  x: number;
  y: number;
}

// Deterministic drawing primitives. Every coordinate/radius is `center + radius *
// factor` and every width is `radius * factor`, so an icon is a pure function of
// (center, radius) — no font, emoji, asset, RNG, clock, tween, or DPR term.
export type IconPrimitive =
  | { kind: 'fillDisc'; cx: number; cy: number; r: number; color: number }
  | { kind: 'strokeRing'; cx: number; cy: number; r: number; color: number; width: number }
  | { kind: 'fillPoly'; points: Vec[]; color: number }
  | { kind: 'strokePath'; points: Vec[]; color: number; width: number }
  | { kind: 'strokeArc'; cx: number; cy: number; r: number; from: number; to: number; color: number; width: number };

// Coherent, project-owned palette (numeric — no theme/font lookup).
const COLOR = {
  bombBody: 0x2c3e50,
  shine: 0xd6dce2,
  fuse: 0x8b5a2b,
  spark: 0xf1c40f,
  blade: 0xbdc3c7,
  guard: 0xd4a017,
  wood: 0x8b5a2b,
  woodDark: 0x6b4423,
  steel: 0x7f8c8d,
  string: 0xecf0f1,
  fire: 0xe74c3c,
  dynamite: 0xc0392b,
  // element quartet, reused for the portal's "rainbow bridge" rings
  red: 0xe74c3c,
  green: 0x2ecc71,
  yellow: 0xf1c40f,
  blue: 0x3498db,
} as const;

// Shared family weights (as fractions of the tile radius) for a consistent
// apparent line thickness across every icon.
const STROKE = 0.1;
const THIN = 0.055;

const rad = (deg: number): number => (deg * Math.PI) / 180;

// Build the primitive list for one icon, centered at `center`, sized by `radius`.
// All geometry stays within ~0.72·radius of the center, so no icon leaves its stone.
export function buildSpecialTileIcon(type: SpecialTileIconType, center: Vec, radius: number): IconPrimitive[] {
  const { x: cx, y: cy } = center;
  const r = radius;
  // point at (fx, fy) in radius-relative units; width from a radius fraction
  const p = (fx: number, fy: number): Vec => ({ x: cx + fx * r, y: cy + fy * r });
  const w = (frac: number): number => r * frac;

  switch (type) {
    case 'portal':
      // Concentric rainbow rings + core: an unmistakable "portal" target,
      // distinct from the bomb's offset body.
      return [
        { kind: 'strokeRing', cx, cy, r: r * 0.68, color: COLOR.blue, width: w(STROKE) },
        { kind: 'strokeRing', cx, cy, r: r * 0.5, color: COLOR.green, width: w(STROKE) },
        { kind: 'strokeRing', cx, cy, r: r * 0.34, color: COLOR.yellow, width: w(STROKE) },
        { kind: 'fillDisc', cx, cy, r: r * 0.16, color: COLOR.red },
      ];

    case 'bomb':
      return [
        { kind: 'fillDisc', cx: cx, cy: cy + r * 0.1, r: r * 0.5, color: COLOR.bombBody },
        { kind: 'fillDisc', cx: cx - r * 0.18, cy: cy - r * 0.02, r: r * 0.1, color: COLOR.shine },
        { kind: 'strokePath', points: [p(0.16, -0.34), p(0.26, -0.46), p(0.36, -0.5)], color: COLOR.fuse, width: w(STROKE) },
        { kind: 'fillDisc', cx: cx + r * 0.4, cy: cy - r * 0.52, r: r * 0.1, color: COLOR.spark },
      ];

    case 'sword':
      return [
        // blade (point up), guard, handle, pommel
        { kind: 'fillPoly', points: [p(0, -0.62), p(0.11, -0.2), p(0.11, 0.1), p(-0.11, 0.1), p(-0.11, -0.2)], color: COLOR.blade },
        { kind: 'fillPoly', points: [p(-0.3, 0.08), p(0.3, 0.08), p(0.3, 0.2), p(-0.3, 0.2)], color: COLOR.guard },
        { kind: 'strokePath', points: [p(0, 0.2), p(0, 0.5)], color: COLOR.woodDark, width: w(0.13) },
        { kind: 'fillDisc', cx, cy: cy + r * 0.54, r: r * 0.09, color: COLOR.guard },
      ];

    case 'bow':
      return [...bowFrame(p, w), ...arrow(p, 0)];

    case 'dynamite':
      return [
        ...dynamiteStick(p, -0.28),
        ...dynamiteStick(p, 0),
        ...dynamiteStick(p, 0.28),
        { kind: 'fillPoly', points: [p(-0.42, 0.02), p(0.42, 0.02), p(0.42, 0.16), p(-0.42, 0.16)], color: COLOR.steel },
        { kind: 'strokePath', points: [p(0, -0.35), p(0.16, -0.52), p(0.3, -0.58)], color: COLOR.woodDark, width: w(0.08) },
        { kind: 'fillDisc', cx: cx + r * 0.34, cy: cy - r * 0.6, r: r * 0.1, color: COLOR.spark },
      ];

    case 'doubleSword':
      // Two crossed silver blades (an X) with gold pommels — reads as "crossed
      // swords" and is clearly distinct from the single upright sword.
      return [
        { kind: 'strokePath', points: [p(-0.48, 0.48), p(0.48, -0.48)], color: COLOR.blade, width: w(0.13) },
        { kind: 'strokePath', points: [p(0.48, 0.48), p(-0.48, -0.48)], color: COLOR.blade, width: w(0.13) },
        { kind: 'fillDisc', cx: cx - r * 0.48, cy: cy + r * 0.48, r: r * 0.11, color: COLOR.guard },
        { kind: 'fillDisc', cx: cx + r * 0.48, cy: cy + r * 0.48, r: r * 0.11, color: COLOR.guard },
      ];

    case 'doubleArrowBow':
      // Same bow frame as the single bow, but TWO stacked arrows — distinct from
      // the single bow while staying in the same visual family.
      return [...bowFrame(p, w), ...arrow(p, -0.18), ...arrow(p, 0.18)];

    default:
      return assertNever(type);
  }
}

// A left-facing bow arc plus its straight string, shared by both bow variants.
function bowFrame(p: (fx: number, fy: number) => Vec, w: (frac: number) => number): IconPrimitive[] {
  return [
    { kind: 'strokeArc', cx: p(0.2, 0).x, cy: p(0.2, 0).y, r: (p(0.95, 0).x - p(0.2, 0).x), from: rad(128), to: rad(232), color: COLOR.wood, width: w(STROKE) },
    { kind: 'strokePath', points: [p(-0.262, 0.591), p(-0.262, -0.591)], color: COLOR.string, width: w(THIN) },
  ];
}

// One horizontal arrow at vertical offset `oy` (radius-relative), pointing right.
function arrow(p: (fx: number, fy: number) => Vec, oy: number): IconPrimitive[] {
  return [
    { kind: 'strokePath', points: [p(-0.262, oy), p(0.44, oy)], color: COLOR.steel, width: (p(0, 0.07).y - p(0, 0).y) },
    { kind: 'fillPoly', points: [p(0.58, oy), p(0.4, oy - 0.12), p(0.4, oy + 0.12)], color: COLOR.fire },
  ];
}

// One vertical dynamite cylinder centered at horizontal offset `ox`.
function dynamiteStick(p: (fx: number, fy: number) => Vec, ox: number): IconPrimitive[] {
  return [
    { kind: 'fillPoly', points: [p(ox - 0.09, -0.35), p(ox + 0.09, -0.35), p(ox + 0.09, 0.55), p(ox - 0.09, 0.55)], color: COLOR.dynamite },
  ];
}

function assertNever(x: never): never {
  throw new Error(`Unhandled special-tile icon type: ${String(x)}`);
}

// Minimal structural surface for painting — a subset of Phaser.GameObjects.Graphics.
// Typed here (not imported) so this module keeps no Phaser runtime dependency.
export interface IconGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  lineStyle(lineWidth: number, color: number, alpha?: number): unknown;
  strokeCircle(x: number, y: number, radius: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  strokePath(): unknown;
  fillPoints(points: Vec[], closePath?: boolean): unknown;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): unknown;
}

// Paint one primitive onto a Graphics-like surface. Pure dispatch — no icon
// selection logic (that lives entirely in `buildSpecialTileIcon`).
export function paintPrimitive(g: IconGraphics, prim: IconPrimitive): void {
  switch (prim.kind) {
    case 'fillDisc':
      g.fillStyle(prim.color, 1);
      g.fillCircle(prim.cx, prim.cy, prim.r);
      return;
    case 'strokeRing':
      g.lineStyle(prim.width, prim.color, 1);
      g.strokeCircle(prim.cx, prim.cy, prim.r);
      return;
    case 'fillPoly':
      g.fillStyle(prim.color, 1);
      g.fillPoints(prim.points, true);
      return;
    case 'strokePath':
      g.lineStyle(prim.width, prim.color, 1);
      g.beginPath();
      g.moveTo(prim.points[0].x, prim.points[0].y);
      for (let i = 1; i < prim.points.length; i++) g.lineTo(prim.points[i].x, prim.points[i].y);
      g.strokePath();
      return;
    case 'strokeArc':
      g.lineStyle(prim.width, prim.color, 1);
      g.beginPath();
      g.arc(prim.cx, prim.cy, prim.r, prim.from, prim.to, false);
      g.strokePath();
      return;
    default:
      return assertNever(prim);
  }
}

// Public entry point BattleScene calls. Creates one Graphics owned by `container`
// (so board redraw's removeAll(true) destroys it) and paints the icon into it.
export function drawSpecialTileIcon(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  type: SpecialTileIconType,
  center: Vec,
  radius: number,
): void {
  const g = scene.add.graphics();
  container.add(g);
  for (const prim of buildSpecialTileIcon(type, center, radius)) paintPrimitive(g, prim);
}
