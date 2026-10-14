// Leaf — small maths and deterministic noise shared by the geometry modules.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export function hash1(n) {
  n |= 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
/** Deterministic 0–1 random for (stream, index). */
export function rnd(a, b) { return hash1(Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x3c6ef372, 0x165667b1)); }
/** Same, −1…1. */
export function rnd2(a, b) { return rnd(a, b) * 2 - 1; }
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const g0 = hash1(i) * 2 - 1, g1 = hash1(i + 1) * 2 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return 2 * (g0 * f * (1 - u) + g1 * (f - 1) * u);
}
