// A random-number source: call it to get the next value in [0, 1).
// Every core module takes a RandomFn instead of calling Math.random()
// directly, so tests and e2e specs can inject a seeded, reproducible one.
export type RandomFn = () => number;

// Mulberry32: a small, fast, deterministic PRNG. Given the same seed it
// always produces the same sequence of numbers — this is what makes
// board state reproducible across unit tests, e2e tests (via ?seed=N),
// and manual debugging.
export function mulberry32(seed: number): RandomFn {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    // Two rounds of xorshift-multiply mixing to scramble the state.
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    // Fold the 32-bit integer state down into a float in [0, 1).
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
