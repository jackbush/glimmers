// Sprig — compound-leaf layouts: where each leaflet sits, blended across leaf types and counts.

import { clamp } from './util.js';
import { G, J } from './knobs.js';

// ---------------------------------------------------------------- compound layouts
// Every layout fills the same slots, so a morph moves leaflets rather than swapping them:
// slot 0 is the terminal leaflet, then pairs from the tip back (upper, lower). Bipinnate
// puts each pinna's terminal leaflet in those slots and its side leaflets after them.
// Slot fields: x, y, angle, scale, stalk length.

export const MAX_SLOTS = 80, SF = 5;
// Bipinnate side leaflets start at a fixed slot (past the most pinnae), so they keep their
// slots whatever the count.
const PINNA_SIDE = 17;
const LAYOUTS = [0, 1, 2, 3, 4].map(() => new Float32Array(MAX_SLOTS * SF));
export const slots = new Float32Array(MAX_SLOTS * SF);
// Bipinnate pinna rachises: x0, y0, x1, y1 per pinna.
export const pinnaSeg = new Float32Array(17 * 4);
export let pinnaN = 0, rachisLen = 0;
const RACHIS = new Float32Array(5);

function setSlot(L, i, x, y, a, s, st) { const o = i * SF; L[o] = x; L[o + 1] = y; L[o + 2] = a; L[o + 3] = s; L[o + 4] = st; }

function layoutSimple(L) { L.fill(0); setSlot(L, 0, 0, 0, 0, 1, 0); RACHIS[0] = 0; }

/** Pinnate positions for n leaflets of length ll; returns the rachis length. */
function pinnatePositions(L, n, ang, ll, first) {
  const pairs = Math.floor(n / 2), term = n % 2;
  const d = ll * 0.62;
  const rl = pairs * d + (term ? 0 : 0);
  setSlot(L, first, rl, 0, 0, term ? ll * 1.05 : 0, ll * 0.07);
  for (let k = 0; k < pairs; k++) {
    const x = rl - d * (k + (term ? 0.75 : 0));
    const s = ll * (1 - 0.22 * k / Math.max(1, pairs - 1));
    setSlot(L, first + 1 + 2 * k, x, 0, ang, s, ll * 0.035);
    setSlot(L, first + 2 + 2 * k, x, 0, -ang, s, ll * 0.035);
  }
  return rl;
}
function layoutPinnate(L, n, ang) {
  L.fill(0);
  const pairs = Math.floor(n / 2);
  const ll = 1 / (0.62 * pairs + 1.1);
  const rl = pinnatePositions(L, n, ang, ll, 0);
  // Normalise so the leaf (rachis + terminal) is about 1 long.
  const tot = rl + ll;
  for (let i = 0; i < MAX_SLOTS; i++) { const o = i * SF; L[o] /= tot; L[o + 3] /= tot; L[o + 4] /= tot; }
  RACHIS[1] = rl / tot;
}
function layoutBipinnate(L, n, ang) {
  L.fill(0);
  n = Math.min(n, 15); // (its side leaflets start at PINNA_SIDE, past the most pinnae)
  const pairs = Math.floor(n / 2);
  const lp = 1 / (0.62 * pairs + 1.1);
  const rl = pinnatePositions(L, n, ang, lp, 0);
  const tot = rl + lp;
  pinnaN = Math.min(n, 15);
  // Each pinna slot becomes a mini pinnate leaf: terminal leaflet plus two pairs.
  for (let p = 0; p < pinnaN; p++) {
    const o = p * SF;
    const px = L[o], py = L[o + 1], pa = L[o + 2], ps = L[o + 3] || (p === 0 ? 0 : lp);
    const len = ps > 0 ? ps : 0;
    const c = Math.cos(pa), s = Math.sin(pa);
    const tipD = len * 0.72, ll = len * 0.36;
    pinnaSeg[p * 4] = px / tot; pinnaSeg[p * 4 + 1] = py / tot;
    pinnaSeg[p * 4 + 2] = (px + c * tipD) / tot; pinnaSeg[p * 4 + 3] = (py + s * tipD) / tot;
    setSlot(L, p, (px + c * tipD) / tot, (py + s * tipD) / tot, pa, len > 0 ? ll * 1.05 / tot : 0, ll * 0.06 / tot);
    for (let q = 0; q < 2; q++) {
      const dd = len * (0.2 + 0.28 * q);
      const x = (px + c * dd) / tot, y = (py + s * dd) / tot;
      const sc = len > 0 ? ll * (0.85 + 0.15 * q) / tot : 0;
      setSlot(L, PINNA_SIDE + p * 4 + q * 2, x, y, pa + ang * 0.9, sc, 0);
      setSlot(L, PINNA_SIDE + p * 4 + q * 2 + 1, x, y, pa - ang * 0.9, sc, 0);
    }
  }
  RACHIS[2] = rl / tot;
}
function layoutPalmate(L, n) {
  L.fill(0);
  const pairs = Math.floor(n / 2), term = n % 2;
  const step = Math.min(0.75, 4.7 / Math.max(n, 2));
  const ll = 0.78;
  if (term) setSlot(L, 0, 0, 0, 0, ll, 0.04);
  for (let k = 0; k < pairs; k++) {
    const a = step * (k + (term ? 1 : 0.5));
    const s = ll * (1 - 0.42 * Math.pow((k + 1) / (pairs + 0.5), 1.4));
    setSlot(L, 1 + 2 * k, 0, 0, a, s, 0.04);
    setSlot(L, 2 + 2 * k, 0, 0, -a, s, 0.04);
  }
  RACHIS[3] = 0;
}
function layoutTrifoliate(L, ang) {
  L.fill(0);
  setSlot(L, 0, 0.14, 0, 0, 0.6, 0.07);
  setSlot(L, 1, 0, 0, ang, 0.5, 0.03);
  setSlot(L, 2, 0, 0, -ang, 0.5, 0.03);
  RACHIS[4] = 0.14;
}

// Pairs and terminal are fractional while morphing: blend the four layouts around them (pairs
// either side, with and without a terminal). Slots keep their identity across all four, so a
// new pair grows out of the rachis base and the terminal grows at the tip, each moving once.
const slotsAcc = new Float32Array(MAX_SLOTS * SF), pinnaAcc = new Float32Array(17 * 4), pinnaW = new Float32Array(17);
export function blendLayouts() {
  const pF = Math.max(1, G.lPairs), p0 = Math.floor(pF), fp = pF - p0, tau = clamp(G.lTerm, 0, 1);
  slotsAcc.fill(0); pinnaAcc.fill(0); pinnaW.fill(0);
  let r = 0, pn = 0;
  for (let c = 0; c < 4; c++) {
    const w = (c & 1 ? fp : 1 - fp) * (c & 2 ? tau : 1 - tau);
    if (w < 1e-6) continue;
    blendLayoutsN(2 * (p0 + (c & 1)) + (c >> 1));
    for (let i = 0; i < slots.length; i++) slotsAcc[i] += w * slots[i];
    // A pinna only some layouts have keeps its full rachis; its leaflets' scale grows it in.
    for (let p = 0; p < pinnaN; p++) {
      pinnaW[p] += w;
      for (let k = 0; k < 4; k++) pinnaAcc[p * 4 + k] += w * pinnaSeg[p * 4 + k];
    }
    r += w * rachisLen;
    pn = Math.max(pn, pinnaN);
  }
  slots.set(slotsAcc);
  for (let p = 0; p < pn; p++) for (let k = 0; k < 4; k++) pinnaSeg[p * 4 + k] = pinnaAcc[p * 4 + k] / pinnaW[p];
  rachisLen = r;
  pinnaN = pn;
}
function blendLayoutsN(n) {
  const ang = J.leafletAngle;
  const w = G.cw;
  if (w[0] > 0) layoutSimple(LAYOUTS[0]);
  if (w[1] > 0) layoutPinnate(LAYOUTS[1], n, ang);
  pinnaN = 0;
  if (w[2] > 0) layoutBipinnate(LAYOUTS[2], n, ang);
  if (w[3] > 0) layoutPalmate(LAYOUTS[3], n);
  if (w[4] > 0) layoutTrifoliate(LAYOUTS[4], ang);
  slots.fill(0);
  rachisLen = 0;
  for (let t = 0; t < 5; t++) {
    if (w[t] <= 0) continue;
    const L = LAYOUTS[t];
    for (let i = 0; i < MAX_SLOTS * SF; i++) slots[i] += w[t] * L[i];
    rachisLen += w[t] * RACHIS[t];
  }
}
