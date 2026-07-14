import { describe, it, expect } from 'vitest';
import {
  buildSpecialTileIcon,
  paintPrimitive,
  SPECIAL_TILE_ICON_TYPES,
  type IconPrimitive,
  type IconGraphics,
  type Vec,
} from '../../src/scenes/specialTileIcons';

const EXPECTED_TYPES = ['bomb', 'sword', 'bow', 'dynamite', 'doubleSword', 'doubleArrowBow', 'portal'] as const;
const CENTER: Vec = { x: 100, y: 200 };

// Max distance any painted point reaches from the tile center (including a
// primitive's own stroke/fill extent) — used to prove nothing leaves the stone.
function maxExtent(prim: IconPrimitive, center: Vec): number {
  const d = (x: number, y: number) => Math.hypot(x - center.x, y - center.y);
  switch (prim.kind) {
    case 'fillDisc':
      return d(prim.cx, prim.cy) + prim.r;
    case 'strokeRing':
      return d(prim.cx, prim.cy) + prim.r + prim.width / 2;
    case 'strokeArc': {
      // Sample the actual swept arc, not the full circle it belongs to.
      let m = 0;
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const a = prim.from + ((prim.to - prim.from) * i) / N;
        m = Math.max(m, d(prim.cx + prim.r * Math.cos(a), prim.cy + prim.r * Math.sin(a)));
      }
      return m + prim.width / 2;
    }
    case 'fillPoly':
      return Math.max(...prim.points.map((p) => d(p.x, p.y)));
    case 'strokePath':
      return Math.max(...prim.points.map((p) => d(p.x, p.y))) + prim.width / 2;
  }
}

describe('special-tile icon roster', () => {
  it('exposes exactly the six special tiles plus the portal', () => {
    expect([...SPECIAL_TILE_ICON_TYPES].sort()).toEqual([...EXPECTED_TYPES].sort());
  });

  it('produces a non-empty primitive list for every icon type', () => {
    for (const type of EXPECTED_TYPES) {
      expect(buildSpecialTileIcon(type, CENTER, 22).length).toBeGreaterThan(0);
    }
  });
});

describe('determinism (no font / emoji / RNG / clock)', () => {
  it('returns byte-identical primitives across repeated calls', () => {
    for (const type of EXPECTED_TYPES) {
      expect(buildSpecialTileIcon(type, CENTER, 22)).toEqual(buildSpecialTileIcon(type, CENTER, 22));
    }
  });

  it('does not read Math.random or Date.now', () => {
    const realRandom = Math.random;
    const realNow = Date.now;
    // Any dependency on RNG/clock would throw and fail the build call.
    Math.random = () => {
      throw new Error('icons must not use Math.random');
    };
    Date.now = () => {
      throw new Error('icons must not use Date.now');
    };
    try {
      for (const type of EXPECTED_TYPES) {
        expect(() => buildSpecialTileIcon(type, CENTER, 22)).not.toThrow();
      }
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });
});

describe('geometry derives from the supplied radius', () => {
  it('scales all geometry about the center proportionally to the radius', () => {
    const k = 2.5;
    for (const type of EXPECTED_TYPES) {
      const small = buildSpecialTileIcon(type, CENTER, 20);
      const large = buildSpecialTileIcon(type, CENTER, 20 * k);
      expect(large.length).toBe(small.length);
      for (let i = 0; i < small.length; i++) {
        expect(large[i].kind).toBe(small[i].kind);
        // scale-invariant fields (angles) must be untouched by radius
        if (small[i].kind === 'strokeArc' && large[i].kind === 'strokeArc') {
          expect((large[i] as any).from).toBeCloseTo((small[i] as any).from, 10);
          expect((large[i] as any).to).toBeCloseTo((small[i] as any).to, 10);
        }
        // colors never depend on radius
        expect(large[i].color).toBe(small[i].color);
      }
      // Point-level proof: every point p_large == center + k*(p_small - center).
      const smallPts = small.flatMap(pointsOf);
      const largePts = large.flatMap(pointsOf);
      expect(largePts.length).toBe(smallPts.length);
      for (let i = 0; i < smallPts.length; i++) {
        expect(largePts[i].x).toBeCloseTo(CENTER.x + k * (smallPts[i].x - CENTER.x), 6);
        expect(largePts[i].y).toBeCloseTo(CENTER.y + k * (smallPts[i].y - CENTER.y), 6);
      }
      // Length-level proof: every radius/width scales by exactly k.
      const smallLens = small.flatMap(lengthsOf);
      const largeLens = large.flatMap(lengthsOf);
      for (let i = 0; i < smallLens.length; i++) {
        expect(largeLens[i]).toBeCloseTo(k * smallLens[i], 6);
      }
    }
  });

  it('produces a degenerate (zero-size) icon at radius 0', () => {
    for (const type of EXPECTED_TYPES) {
      for (const prim of buildSpecialTileIcon(type, CENTER, 0)) {
        expect(maxExtent(prim, CENTER)).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('containment and color validity', () => {
  it('keeps every icon strictly inside its stone', () => {
    const radius = 22;
    for (const type of EXPECTED_TYPES) {
      for (const prim of buildSpecialTileIcon(type, CENTER, radius)) {
        expect(maxExtent(prim, CENTER)).toBeLessThanOrEqual(radius);
      }
    }
  });

  it('uses only integer colors in the 24-bit range', () => {
    for (const type of EXPECTED_TYPES) {
      for (const prim of buildSpecialTileIcon(type, CENTER, 22)) {
        expect(Number.isInteger(prim.color)).toBe(true);
        expect(prim.color).toBeGreaterThanOrEqual(0);
        expect(prim.color).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});

describe('paint dispatch', () => {
  it('issues draw calls for every primitive of every icon without throwing', () => {
    for (const type of EXPECTED_TYPES) {
      const rec = new RecordingGraphics();
      for (const prim of buildSpecialTileIcon(type, CENTER, 22)) paintPrimitive(rec, prim);
      // Each icon paints at least one fill/stroke operation.
      expect(rec.calls.length).toBeGreaterThan(0);
      expect(rec.calls).toContain('fillStyle|lineStyle');
    }
  });
});

// --- helpers -------------------------------------------------------------

function pointsOf(prim: IconPrimitive): Vec[] {
  switch (prim.kind) {
    case 'fillDisc':
    case 'strokeRing':
    case 'strokeArc':
      return [{ x: prim.cx, y: prim.cy }];
    case 'fillPoly':
    case 'strokePath':
      return prim.points;
  }
}

function lengthsOf(prim: IconPrimitive): number[] {
  switch (prim.kind) {
    case 'fillDisc':
      return [prim.r];
    case 'strokeRing':
      return [prim.r, prim.width];
    case 'strokeArc':
      return [prim.r, prim.width];
    case 'strokePath':
      return [prim.width];
    case 'fillPoly':
      return [];
  }
}

class RecordingGraphics implements IconGraphics {
  calls: string[] = [];
  private mark(name: string) {
    this.calls.push(name);
  }
  fillStyle() {
    this.mark('fillStyle|lineStyle');
    return this;
  }
  fillCircle() {
    this.mark('fillCircle');
    return this;
  }
  lineStyle() {
    this.mark('fillStyle|lineStyle');
    return this;
  }
  strokeCircle() {
    this.mark('strokeCircle');
    return this;
  }
  beginPath() {
    this.mark('beginPath');
    return this;
  }
  moveTo() {
    this.mark('moveTo');
    return this;
  }
  lineTo() {
    this.mark('lineTo');
    return this;
  }
  strokePath() {
    this.mark('strokePath');
    return this;
  }
  fillPoints() {
    this.mark('fillPoints');
    return this;
  }
  arc() {
    this.mark('arc');
    return this;
  }
}
