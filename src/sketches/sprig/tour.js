// Sprig — the order autoplay shows the presets in: a loop through all of them that keeps each
// morph as small as it can (by pace.js's measure), so neighbours are related trees and the big
// jumps (a fir to a hazel) are as few as they can be. Worked out once, when the manifest loads.

import schema, { presets } from './params.js';
import { presetSeconds } from './pace.js';

/** Every preset, in a loop with the smallest total morph time found. */
export function tour() {
  const names = Object.keys(presets), n = names.length;
  const defaults = {};
  for (const g of schema) for (const p of g.params) defaults[p.key] = p;
  // cost[a][b]: the morph from a to b, taken both ways (the loop runs one way, but should read
  // well whichever preset it opens on).
  const cost = names.map((a) => {
    const P = {};
    for (const k in defaults) P[k] = { ...defaults[k], value: k in presets[a] ? presets[a][k] : defaults[k].value };
    return names.map((b) => presetSeconds(P, presets[b]));
  });
  const d = (a, b) => cost[a][b] + cost[b][a];
  const length = (t) => t.reduce((s, a, i) => s + d(a, t[(i + 1) % n]), 0);
  // Nearest neighbour from every start, then 2-opt (reverse any stretch that shortens it).
  let best = null;
  for (let s = 0; s < n; s++) {
    const t = [s], used = new Set(t);
    while (t.length < n) {
      const last = t[t.length - 1];
      let next = -1;
      for (let b = 0; b < n; b++) if (!used.has(b) && (next < 0 || d(last, b) < d(last, next))) next = b;
      t.push(next); used.add(next);
    }
    for (let improved = true; improved;) {
      improved = false;
      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 2; j < n; j++) {
          const a = t[i], b = t[i + 1], c = t[j], e = t[(j + 1) % n];
          if (a === e) continue;
          if (d(a, c) + d(b, e) < d(a, b) + d(c, e) - 1e-9) {
            for (let l = i + 1, r = j; l < r; l++, r--) [t[l], t[r]] = [t[r], t[l]];
            improved = true;
          }
        }
      }
    }
    if (!best || length(t) < length(best)) best = t;
  }
  // Start at the first preset in the menu, for a steady order.
  const k = best.indexOf(0);
  return best.slice(k).concat(best.slice(0, k)).map((i) => names[i]);
}
