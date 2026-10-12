// Seeded random numbers (mulberry32), so a sketch with a Seed param lays out the same way
// every time — and covers come out the same on every capture.

/**
 * @param {number} seed any number; fractional parts count
 * @returns {() => number} a function returning floats in [0, 1)
 */
export function rng(seed) {
  let a = Math.floor(seed * 1000) ^ 0x9e3779b9;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
