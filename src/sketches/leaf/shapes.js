// Leaf — leaf and sprig geometry, built on the CPU whenever a shape param changes.
//
// buildShapes() turns the params into one leaf mesh or, in stem mode, a few jittered leaf
// variants plus one sprig (a stem and its leaf placements).
// Everything is written into preallocated typed arrays: rebuilding allocates nothing, so it
// can run every frame while a slider is dragged or a category morphs.
//
// Coordinates: a leaf's blade runs from its base (0, 0) to its tip at about (1, 0); the
// petiole hangs back to (−petioleLength, 0). Compound leaves are normalised to about the same
// overall length. Every select param is a blend of option weights (see sketch.js), so each
// option is a set of continuous numbers that can be mixed with the others (knobs.js).
// Compound leaflet positions come from layouts.js.
//
// Vertex layout (STRIDE floats): x, y, nx, ny, hw, across, along, kind, seed.
//   fills:   across = −1…1 across the blade (0 on the midrib), along = 0…1; hw = the length of
//            the vertex's spoke (midrib anchor → margin), nrm = that spoke's direction on margin
//            vertices (0 on anchors), so the shader can grow the wash past the margin.
//   strokes: centre-line point plus unit normal and half-width; the vertex shader extrudes,
//            so lines can keep a minimum width in screen px. across = ±1, along = arc length.
//   kind:    KIND_* below.
//
// Fruit and flowers (emitClusters) hang from the sprig's nodes and tip, in sprig coordinates.

import { DEG, TAU, clamp, lerp, noise1, rnd, rnd2, smooth } from './util.js';
import { G, J, jitter, resolveKnobs } from './knobs.js';
import { MAX_SLOTS, SF, blendLayouts, pinnaN, pinnaSeg, rachisLen, slots } from './layouts.js';

export const STRIDE = 9;
export const MAX_VERTS = 420000;
export const MAX_VARIANTS = 16;
export const MAX_PLACE = 320;
// Nodes on a sprig (the Nodes param's max, with room to spare).
const MAX_NODES = 128;
// Fruit and flower clusters on a sprig: two bearers × (10 nodes + the tip), with room to spare.
const MAX_CL = 24;

export const KIND_FILL = 0, KIND_OUTLINE = 1, KIND_VEIN = 2, KIND_RIB = 3, KIND_STEM = 6, KIND_BUD = 7, KIND_FRUIT = 8,
  KIND_FLOWER = 9, KIND_CENTRE = 10, KIND_BRACT = 11, KIND_FLESH = 12, KIND_SEED = 13, KIND_HUSK = 14, KIND_SCAR = 15;
// Kind written by spokeVtx: leaf fill, or a bud, fruit, petal, flower centre, bract, cut flesh,
// nut (a seed), husk or a conker's scar (filled the same way, in their colours; only fruit and nuts take gloss). Shaders treat 0 and 7 and up as fills.
let fillKind = KIND_FILL;


// ---------------------------------------------------------------- output

// Draw segments: each leaf variant is a run of segments, so the renderer can clip veins to
// their own leaflet with the stencil buffer. Modes: SEG_PLAIN, SEG_FILL (marks the stencil),
// SEG_VEIN (drawn only where its leaflet's fill marked; edges then cores).
export const SEG_PLAIN = 0, SEG_FILL = 1, SEG_VEIN = 2;
const MAX_SEG = 6000;

export const geo = {
  seg: new Int32Array(MAX_SEG * 3),
  nSeg: 0,
  leafSegStart: new Int32Array(MAX_VARIANTS),
  leafSegCount: new Int32Array(MAX_VARIANTS),
  // How many of a leaf's first segments are its stalks (petiole, rachis, leaflet stalks, wing),
  // which the renderer draws in the back layer with the stem.
  leafStalkSegs: new Int32Array(MAX_VARIANTS),
  verts: new Float32Array(MAX_VERTS * STRIDE),
  count: 0,
  nLeaf: 0,
  leafStart: new Int32Array(MAX_VARIANTS),
  leafCount: new Int32Array(MAX_VARIANTS),
  leafAttach: new Float32Array(MAX_VARIANTS * 3),
  sprigStart: new Int32Array(MAX_VARIANTS),
  sprigCount: new Int32Array(MAX_VARIANTS),
  // The terminal bud, drawn after the leaves (it sits beyond them).
  budStart: new Int32Array(MAX_VARIANTS),
  budCount: new Int32Array(MAX_VARIANTS),
  // All the fruit and flowers (for the framing box), and each cluster's own run and node, so
  // the renderer can layer clusters among the leaves in stem order.
  fruitStart: new Int32Array(MAX_VARIANTS),
  fruitCount: new Int32Array(MAX_VARIANTS),
  nCl: 0,
  clStart: new Int32Array(MAX_CL),
  clCount: new Int32Array(MAX_CL),
  // How much of each cluster's run is its stalks (and bract), drawn in the back layer.
  clStalk: new Int32Array(MAX_CL),
  clNode: new Int32Array(MAX_CL),
  // The node each placement grows from (the tip is node sprigNodes), and how many nodes.
  placeNode: new Int32Array(MAX_PLACE),
  sprigNodes: 0,
  // Woody pegs under the leaves (back layer), and each node's sheaths (drawn after its leaves).
  pegStart: 0,
  pegCount: 0,
  sheathStart: new Int32Array(MAX_NODES + 1),
  sheathCount: new Int32Array(MAX_NODES + 1),
  // Per placement: leaf variant, mat2 column-major (a, b, c, d), tx, ty, presence (0–1).
  sprigPlace: new Float32Array(MAX_VARIANTS * MAX_PLACE * 8),
  sprigNPlace: new Int32Array(MAX_VARIANTS),
};

// ---------------------------------------------------------------- vertex buffers
// Staging buffers keep a leaf's layers in draw order: fills, then strokes. They are copied
// into geo.verts at the end.

function vbuf(cap) { return { a: new Float32Array(cap * STRIDE), n: 0, cap }; }
// sFill also takes the fruit and flowers (emitClusters stops adding them when it's full).
const sFill = vbuf(250000), sStroke = vbuf(130000);
// A blade's lines go to their own stages, appended in draw order (veinlets, other veins,
// midrib, outline), so nothing has to be reordered afterwards.
const sVeinlet = vbuf(60000), sRib = vbuf(8000), sOutline = vbuf(12000);

let curSeed = 0;

/** A fill vertex on the spoke from anchor (ax, ay) to margin point (ox, oy). */
function spokeVtx(b, ax, ay, ox, oy, outer, across, along) {
  const dx = ox - ax, dy = oy - ay, l = Math.hypot(dx, dy) || 1e-6;
  if (outer) vtx(b, ox, oy, dx / l, dy / l, l, across, along, fillKind);
  else vtx(b, ax, ay, 0, 0, l, 0, along, fillKind);
}
/** A fill quad between two spokes (a0 → o0) and (a1 → o1). */
function fillQuad(b, ax0, ay0, ox0, oy0, ax1, ay1, ox1, oy1, sg, u0, u1) {
  spokeVtx(b, ax0, ay0, ox0, oy0, false, 0, u0);
  spokeVtx(b, ax0, ay0, ox0, oy0, true, sg, u0);
  spokeVtx(b, ax1, ay1, ox1, oy1, true, sg, u1);
  spokeVtx(b, ax0, ay0, ox0, oy0, false, 0, u0);
  spokeVtx(b, ax1, ay1, ox1, oy1, true, sg, u1);
  spokeVtx(b, ax1, ay1, ox1, oy1, false, 0, u1);
}

function vtx(b, x, y, nx, ny, hw, across, along, kind) {
  if (b.n >= b.cap) return;
  const o = b.n * STRIDE, a = b.a;
  a[o] = x; a[o + 1] = y; a[o + 2] = nx; a[o + 3] = ny; a[o + 4] = hw;
  a[o + 5] = across; a[o + 6] = along; a[o + 7] = kind; a[o + 8] = curSeed;
  b.n++;
}

// ---------------------------------------------------------------- bends
// A bend is a curve the leaf's x axis is mapped onto: angle φ(x) = k·x + s·(x − x²), so k
// is a steady curve and s an S-curve that reverses halfway. Tabulated and integrated once
// per leaflet; a point (x, y) maps to M(x) + y·normal(x).

const BEND_N = 96;
function bendTable(x0, x1) {
  return { x0, x1, mx: new Float32Array(BEND_N + 1), my: new Float32Array(BEND_N + 1), ph: new Float32Array(BEND_N + 1) };
}
const leafBend = bendTable(-1.2, 1.8);
const bladeBend = bendTable(-0.6, 1.6);

function phiAt(x, k, s) { const xc = clamp(x, 0, 1); return k * x + s * (xc - xc * xc); }
function buildBend(t, k, s) {
  const dx = (t.x1 - t.x0) / BEND_N;
  t.mx[0] = 0; t.my[0] = 0; t.ph[0] = phiAt(t.x0, k, s);
  for (let i = 1; i <= BEND_N; i++) {
    const xm = t.x0 + (i - 0.5) * dx, pm = phiAt(xm, k, s);
    t.mx[i] = t.mx[i - 1] + Math.cos(pm) * dx;
    t.my[i] = t.my[i - 1] + Math.sin(pm) * dx;
    t.ph[i] = phiAt(t.x0 + i * dx, k, s);
  }
  // Re-origin so that x = 0 maps to (0, 0).
  const f = (0 - t.x0) / dx, i0 = Math.floor(f), u = f - i0;
  const ox = lerp(t.mx[i0], t.mx[i0 + 1], u), oy = lerp(t.my[i0], t.my[i0 + 1], u);
  for (let i = 0; i <= BEND_N; i++) { t.mx[i] -= ox; t.my[i] -= oy; }
}
let BX = 0, BY = 0;
function bendAt(t, x, y) {
  const f = (x - t.x0) / (t.x1 - t.x0) * BEND_N;
  let mx, my, ph;
  if (f <= 0) { ph = t.ph[0]; const d = (x - t.x0); mx = t.mx[0] + Math.cos(ph) * d; my = t.my[0] + Math.sin(ph) * d; }
  else if (f >= BEND_N) { ph = t.ph[BEND_N]; const d = (x - t.x1); mx = t.mx[BEND_N] + Math.cos(ph) * d; my = t.my[BEND_N] + Math.sin(ph) * d; }
  else {
    const i = Math.floor(f), u = f - i;
    mx = lerp(t.mx[i], t.mx[i + 1], u); my = lerp(t.my[i], t.my[i + 1], u); ph = lerp(t.ph[i], t.ph[i + 1], u);
  }
  BX = mx - Math.sin(ph) * y;
  BY = my + Math.cos(ph) * y;
}

// Leaflet placement inside the leaf: blade coords → (blade bend) → scale, rotate, move →
// (leaf bend) → final leaf coords. `bladeMode` false skips the blade stage (stalks, wings).
let plS = 1, plC = 1, plSn = 0, plX = 0, plY = 0, plMirror = 1, bladeMode = true;
let TX = 0, TY = 0;
function toFinal(x, y) {
  let px = x, py = y;
  if (bladeMode) {
    bendAt(bladeBend, x, y * plMirror);
    px = BX; py = BY * plMirror;
    const sx = px * plS, sy = py * plS;
    px = plX + sx * plC - sy * plSn;
    py = plY + sx * plSn + sy * plC;
  }
  bendAt(leafBend, px, py);
  TX = BX; TY = BY;
}

// ---------------------------------------------------------------- blade outline

const NMAX = 420;
const LX = [new Float32Array(NMAX + 1), new Float32Array(NMAX + 1)]; // lobed outline (blade coords)
const LY = [new Float32Array(NMAX + 1), new Float32Array(NMAX + 1)];
const FX = [new Float32Array(NMAX + 1), new Float32Array(NMAX + 1)]; // with margin
const FY = [new Float32Array(NMAX + 1), new Float32Array(NMAX + 1)];
const AX = new Float32Array(NMAX + 1); // midrib anchor for the fill
const ARC = new Float32Array(NMAX + 1);
let N = 64;
let stip = false; // building a stipule: plain ovate, no lobes, teeth or side veins
// Half-width of a winged petiole where it meets the blade (0 = no wing on this blade). The
// blade's base flares to at least this, so wing and blade share one margin.
let wingJoin = 0;
// How far the fill's anchors move from the midrib to the palm point (see emitBlade), and where
// that point is.
let palmFan = 0, palmX = 0.08;

// Final-coords scratch for strokes.
const PMAX = 4000;
const PX = new Float32Array(PMAX), PY = new Float32Array(PMAX), PW = new Float32Array(PMAX);
// Per-point opacity for stalks, midribs and veins: 1 = thick opaque stalk, 0 = translucent
// vein. Written into the `along` slot (the leaf shader doesn't use arc length for lines).
// Stalk and midrib are one vascular bundle, so this runs continuously across the junction.
const PO = new Float32Array(PMAX);
let useO = false;
// Opacity where the last stalk line ended, and where the next blade's midrib starts from.
let lastO = 1, ribO = 0.5;

// Teeth curve up to a point (a straight sawtooth looks stepped this large).
function sawTooth(f) { return f < 0.78 ? Math.pow(f / 0.78, 1.7) : Math.pow((1 - f) / 0.22, 0.8); }
function marginAt(ph) {
  const m = G.mw;
  let f = 0;
  if (m[1] > 0) { const fr = ph - Math.floor(ph); f += m[1] * (sawTooth(fr) - 0.5); }
  if (m[2] > 0) {
    const h = ph * 0.5, f1 = h - Math.floor(h), f2 = ph - Math.floor(ph);
    f += m[2] * ((sawTooth(f1) - 0.5) * 1.3 + (sawTooth(f2) - 0.5) * 0.45);
  }
  if (m[3] > 0) { const fr = ph - Math.floor(ph); f += m[3] * (Math.pow(1 - Math.abs(2 * fr - 1), 1.4) - 0.45) * 1.1; }
  if (m[4] > 0) { const fr = ph - Math.floor(ph); f += m[4] * (Math.sqrt(Math.sin(Math.PI * fr)) - 0.65); }
  if (m[5] > 0) f += m[5] * Math.sin(TAU * ph * 0.25) * 1.5;
  if (m[6] > 0) {
    const s = Math.sin(TAU * ph * 0.2);
    f += m[6] * (s * 1.6 + Math.pow(Math.max(0, s), 26) * 2.6);
  }
  return f;
}

/** Outline of one blade into LX/LY (lobed) and FX/FY (with margin), both sides. */
function bladeOutline(ls) {
  const W = stip ? 0.34 : J.W;
  const pw = stip ? 0.38 : J.pw;
  const gam = Math.log(0.5) / Math.log(pw);
  const be = stip ? 0.7 : G.baseE, ae = stip ? 0.9 : G.apexE, em = stip ? 1 : G.expMul;
  const acum = stip ? 0 : G.acum, notch = stip ? 0 : G.notch, cord = stip ? 0 : G.cord, asym = stip ? 0 : G.asym;
  const pinD = stip ? 0 : G.pin * J.lobeDepth, palD = stip ? 0 : G.palm * J.lobeDepth;
  const lobes = G.lobes, sharpE = lerp(1.2, 6, G.lobeSharp);
  // Palmate lobes radiate from a point just above the base.
  const pcx = 0.08, nl = Math.max(2, lobes);
  palmFan = smooth(0, 0.12, palD); palmX = pcx;
  const dTh = Math.min(1.15, 4.0 / (nl - 1 + 1e-3)), off = 0.25 * (1 + Math.cos(Math.PI * nl)); // odd 0, even ½, smooth between
  const thMax = ((nl - 1) / 2 + 0.55) * dTh;
  const wsc = 1 + G.variety * 0.12 * rnd2(ls, 21);

  for (let side = 0; side < 2; side++) {
    const sg = side === 0 ? 1 : -1;
    const lx = LX[side], ly = LY[side];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const t = Math.pow(u, gam);
      const sn = Math.max(0, Math.sin(Math.PI * t));
      const e = lerp(be, ae, smooth(0.12, 0.88, t)) * em;
      let w = W * wsc * Math.pow(sn, e);
      if (wingJoin > 0) {
        // Smooth max with the wing, fading out up the blade: the base flares into the wing.
        const hw = wingJoin * (1 - smooth(0, 0.35, u)), d = w - hw;
        w = (w + hw + Math.sqrt(d * d + 1e-4)) / 2;
      }
      w *= 1 - acum * 0.72 * smooth(0.5, 0.97, u);
      if (pinD > 0) {
        const ph = (u - 0.05) / 0.92 * lobes;
        const sinus = Math.pow(0.5 + 0.5 * Math.cos(TAU * ph), lerp(0.6, 2.5, G.lobeSharp));
        w *= 1 - pinD * 0.92 * sinus * smooth(0.02, 0.15, u) * (1 - smooth(0.88, 1, u));
      }
      let x = u;
      x -= notch * 0.08 * Math.pow(smooth(0.72, 1, u), 2);
      if (sg < 0 && asym > 0) x += asym * 0.15 * (1 - u) * (1 - u);
      let y = sg * w;
      if (cord > 0) {
        // Cordate: a notch (sinus) cut into the back of the blade, seen from a point on the
        // midrib, leaves two rounded lobes either side of the stalk.
        const dx = x - 0.3, r = Math.hypot(dx, y), th = Math.atan2(y, dx);
        const d = Math.PI - Math.abs(th);
        const r2 = r * (1 - cord * 0.8 * Math.exp(-(d / 0.42) * (d / 0.42)));
        x = 0.3 + Math.cos(th) * r2;
        y = Math.sin(th) * r2;
      }
      if (palD > 0) {
        const dx = x - pcx, r = Math.hypot(dx, y), th = Math.atan2(y, dx);
        const ph = th / dTh - off;
        const d = Math.abs(ph - Math.round(ph));
        const c = Math.pow(Math.cos(Math.PI * d), sharpE);
        const env = 1 - smooth(thMax, thMax + 0.5, Math.abs(th));
        const r2 = r * (1 - palD * 0.85 * (1 - c) * env) * (1 + palD * 0.3 * c * env);
        x = pcx + Math.cos(th) * r2;
        y = Math.sin(th) * r2;
      }
      lx[i] = x; ly[i] = y;
      if (side === 0) AX[i] = u;
    }
    if (side === 1) {
      // Fill anchors sit on the midrib, never behind where the blade meets it (the sinus)
      // nor past where it ends at the tip (a notch), or the fill would spill outside.
      const sx = Math.max(0, Math.min(LX[0][0], lx[0]));
      const ex = Math.min(1, Math.max(LX[0][N], lx[N]));
      for (let i = 0; i <= N; i++) AX[i] = clamp(AX[i], sx, Math.max(sx, ex));
    }
    // Margin: offset along the outward normal by a tooth profile running in arc length.
    let cum = 0;
    ARC[0] = 0;
    for (let i = 1; i <= N; i++) { cum += Math.hypot(lx[i] - lx[i - 1], ly[i] - ly[i - 1]); ARC[i] = cum; }
    const tot = Math.max(cum, 1e-6);
    const fx = FX[side], fy = FY[side];
    const tooth = stip ? 0 : J.toothDepth, wob = G.wobble;
    for (let i = 0; i <= N; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < N ? i + 1 : N;
      let tx = lx[i1] - lx[i0], ty = ly[i1] - ly[i0];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty * sg, ny = tx * sg;
      const u = i / N;
      const env = smooth(0, 0.07, u) * (1 - smooth(0.93, 1, u) * (1 - G.mw[6]));
      const ph = ARC[i] / tot * G.teeth;
      const d = tooth * marginAt(ph) * env + wob * noise1(ARC[i] * 9 + ls * 3.7 + side * 31) * smooth(0, 0.05, u) * (1 - smooth(0.95, 1, u));
      fx[i] = lx[i] + nx * d;
      fy[i] = ly[i] + ny * d;
    }
  }
}

// ---------------------------------------------------------------- stroke emission

/** Emit the polyline in PX/PY/PW (final coords) as a strip of triangles. */
function emitStroke(b, n, kind, closed) {
  if (n < 2) return;
  let orient = 1;
  if (closed) {
    let area = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += PX[i] * PY[j] - PX[j] * PY[i]; }
    orient = area > 0 ? -1 : 1; // make normals point outward
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    // Point normals from neighbouring points (no miters: lines are thin).
    const ia = closed ? (i - 1 + n) % n : Math.max(0, i - 1), ib = j;
    const ja = i, jb = closed ? (j + 1) % n : Math.min(n - 1, j + 1);
    let tx = PX[ib] - PX[ia], ty = PY[ib] - PY[ia], tl = Math.hypot(tx, ty) || 1;
    const n0x = -ty / tl * orient, n0y = tx / tl * orient;
    tx = PX[jb] - PX[ja]; ty = PY[jb] - PY[ja]; tl = Math.hypot(tx, ty) || 1;
    const n1x = -ty / tl * orient, n1y = tx / tl * orient;
    // `along` carries opacity here (see PO): stalks default opaque, veins translucent.
    const def = kind === KIND_STEM ? 1 : 0;
    const a0 = useO ? PO[i] : def, a1 = useO ? PO[j] : def;
    vtx(b, PX[i], PY[i], n0x, n0y, PW[i], -1, a0, kind);
    vtx(b, PX[i], PY[i], n0x, n0y, PW[i], 1, a0, kind);
    vtx(b, PX[j], PY[j], n1x, n1y, PW[j], 1, a1, kind);
    vtx(b, PX[i], PY[i], n0x, n0y, PW[i], -1, a0, kind);
    vtx(b, PX[j], PY[j], n1x, n1y, PW[j], 1, a1, kind);
    vtx(b, PX[j], PY[j], n1x, n1y, PW[j], -1, a1, kind);
  }
}

/** Line width with hand-cut swelling along its length. */
function inkW(base, s, k) { return base * (1 + 0.35 * noise1(s * 6 + k * 13.1)); }

// Interpolated lobed outline point at blade position u on one side.
let EX = 0, EY = 0;
function edgeAt(side, u) {
  const f = clamp(u, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)), t = f - i;
  EX = lerp(LX[side][i], LX[side][i + 1], t);
  EY = lerp(LY[side][i], LY[side][i + 1], t);
}

/** Add one blade point to the PX/PY/PW scratch, transformed to final coords. */
function push(n, x, y, w) {
  if (n >= PMAX) return n;
  toFinal(x, y);
  PX[n] = TX; PY[n] = TY; PW[n] = w;
  return n + 1;
}

// ---------------------------------------------------------------- one blade (leaflet)

let midribScale = 1;
/** Point on outline segment (i−1 → i) of `side` at distance `r` from (bx, 0), into EX/EY. */
function cutAt(side, i, bx, r) {
  const x0 = FX[side][i - 1], y0 = FY[side][i - 1], x1 = FX[side][i], y1 = FY[side][i];
  const d0 = Math.hypot(x0 - bx, y0), d1 = Math.hypot(x1 - bx, y1);
  const f = d1 > d0 ? clamp((r - d0) / (d1 - d0), 0, 1) : 1;
  EX = lerp(x0, x1, f); EY = lerp(y0, y1, f);
}
/** Is blade point (x, y) inside the (lobed) outline? Pinnate-lobed blades keep x ≈ u. */
function insideBlade(x, y) {
  edgeAt(y >= 0 ? 0 : 1, x);
  return Math.abs(y) < Math.abs(EY) * 0.96;
}
// Secondary veins of the current blade (x0, control x, control y, end x, end y; per side, k).
// Slot 0 and slot vc+1 per side are invisible guide veins near the base and tip, so the
// veinlets also fill the zones below the first vein and above the last.
const VEIN = new Float32Array(2 * 34 * 5);
/** Store an invisible guide vein in slot `slot`: from the midrib at x0 to the margin at u. */
function guideVein(slot, side, x0, u) {
  edgeAt(side, u);
  const ex = lerp(u, EX, 0.9), ey = EY * 0.9;
  const cv = clamp(G.veinCurve, -1, 1), o = slot * 5;
  VEIN[o] = x0; VEIN[o + 1] = x0 + (ex - x0) * (0.5 - 0.4 * cv); VEIN[o + 2] = ey * (0.5 + 0.4 * cv);
  VEIN[o + 3] = ex; VEIN[o + 4] = ey;
}
function veinPoint(o, t) {
  const it = 1 - t;
  EX = it * it * VEIN[o] + 2 * it * t * VEIN[o + 1] + t * t * VEIN[o + 3];
  EY = 2 * it * t * VEIN[o + 2] + t * t * VEIN[o + 4];
}
// Segments per vein, scaled with the outline's resolution so tiny leaflets stay cheap.
let VS = 12;

function emitBlade(ls) {
  bladeOutline(ls);
  // Fill: quads from the midrib anchor out to the outline, per side. Palmate lobes push the
  // outline in and out along rays from the palm point, so in a deep sinus it doubles back on
  // itself as seen from the midrib, and quads from there crossed it and filled the notch. Seen
  // from the palm point it never doubles back, so with palmate lobing the anchors move there.
  for (let side = 0; side < 2; side++) {
    const sg = side === 0 ? 1 : -1, fx = FX[side], fy = FY[side];
    for (let i = 0; i < N; i++) {
      toFinal(lerp(AX[i], palmX, palmFan), 0); const ax0 = TX, ay0 = TY;
      toFinal(lerp(AX[i + 1], palmX, palmFan), 0); const ax1 = TX, ay1 = TY;
      toFinal(fx[i], fy[i]); const ox0 = TX, oy0 = TY;
      toFinal(fx[i + 1], fy[i + 1]); const ox1 = TX, oy1 = TY;
      const u0 = i / N, u1 = (i + 1) / N;
      fillQuad(sFill, ax0, ay0, ox0, oy0, ax1, ay1, ox1, oy1, sg, u0, u1);
    }
  }

  const ow = G.outlineW;
  // Outline: up one side, back down the other.
  let n = 0;
  // The outline opens where the stalk enters (it shouldn't cross it): points closer to the
  // midrib's base than the stalk's half-width are skipped. With a wing, the wing's edges
  // carry the outline on down the stalk.
  const trim = stip ? 0 : (G.midribWeight * midribScale * 1.2 + ow) / Math.max(plS, 1e-3);
  const bx = Math.max(0, LX[0][0]);
  let i0 = 0, i1 = 0;
  while (i0 < N && Math.hypot(FX[0][i0] - bx, FY[0][i0]) < trim) i0++;
  while (i1 < N && Math.hypot(FX[1][i1] - bx, FY[1][i1]) < trim) i1++;
  const open = wingJoin > 0 || i0 > 0 || i1 > 0;
  // Start (and end) exactly at the trim distance, not at the next outline point, which on a
  // round base can already be far from the stalk.
  if (i0 > 0) { cutAt(0, i0, bx, trim); n = push(n, EX, EY, inkW(ow, 0, ls)); }
  for (let i = i0; i <= N; i++) n = push(n, FX[0][i], FY[0][i], inkW(ow, i / N, ls));
  for (let i = N - 1; i >= (open ? i1 : 1); i--) n = push(n, FX[1][i], FY[1][i], inkW(ow, 2 - i / N, ls));
  if (i1 > 0) { cutAt(1, i1, bx, trim); n = push(n, EX, EY, inkW(ow, 2, ls)); }
  emitStroke(sOutline, n, KIND_OUTLINE, !open);

  // Midrib, from where the blade meets it; in a cordate notch the stalk runs up to there.
  const tipX = LX[0][N], baseX = Math.max(0, LX[0][0]);
  if (baseX > 0.01 && !stip) {
    n = 0;
    for (let i = 0; i <= 6; i++) { PO[n] = ribO; n = push(n, baseX * i / 6, 0, G.midribWeight * midribScale); }
    // With the fill, so it isn't clipped to the blade like the veins.
    useO = true;
    emitStroke(sFill, n, KIND_STEM, false);
    useO = false;
  }
  const mw = G.midribWeight * midribScale;
  n = 0;
  const ms = Math.max(6, Math.round(N / 5));
  for (let i = 0; i <= ms; i++) {
    const t = i / ms, x = baseX + (tipX * 0.97 - baseX) * t;
    // Starts exactly as the stalk ends (same width, no wobble or swelling yet), and clears
    // from opaque to translucent over the first ~15% as the bundle thins.
    const e = smooth(0, 0.12, t);
    PO[n] = ribO * (1 - smooth(0, 0.15, t));
    n = push(n, x, G.wobble * 0.5 * noise1(t * 5 + ls) * e, lerp(mw, inkW(mw * (1 - 0.82 * t), t, ls + 3), e));
  }
  useO = true;
  emitStroke(sRib, n, KIND_RIB, false);
  useO = false;
  if (stip) return;

  const vw = G.vw, vwt = G.veinWeight * midribScale;
  const vcF = J.veinCount, vc = Math.ceil(vcF - 1e-6), vcFrac = vcF - (vc - 1);
  const tanA = Math.tan(J.veinAngle);
  // Pinnate secondaries: off the midrib, curving forward to the margin (or into a lobe).
  if (vw[0] > 0.02) {
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      for (let k = 0; k < vc; k++) {
        const x0 = baseX + (0.05 + (k + 0.5 + 0.25 * rnd2(ls * 7 + side, k)) / vcF * 0.8) * (tipX - baseX);
        const grow = k === vc - 1 ? vcFrac : 1; // the newest vein grows in
        edgeAt(side, x0);
        let ut = clamp(x0 + Math.abs(EY) / tanA * 0.9, 0.02, 0.97);
        if (G.pin > 0) {
          // Into the nearest lobe tip, handing over smoothly between neighbours: a hard
          // snap made veins jump from lobe to lobe as the vein count eased.
          const ph = (ut - 0.05) / 0.92 * G.lobes - 0.5, li = Math.floor(ph);
          const pk = (li + smooth(0.3, 0.7, ph - li) + 0.5) / G.lobes * 0.92 + 0.05;
          ut = lerp(ut, clamp(pk, 0.05, 0.95), G.pin);
        }
        edgeAt(side, ut);
        const ex = lerp(ut, EX, 0.9), ey = EY * 0.9;
        // Control point: veins leave the midrib steeply and sweep toward the tip (curve > 0),
        // or run along the midrib before turning out (curve < 0).
        const cv = clamp(G.veinCurve, -1, 1);
        const px1 = x0 + (ex - x0) * (0.5 - 0.4 * cv), py1 = ey * (0.5 + 0.4 * cv);
        const vo = (side * 34 + k + 1) * 5;
        VEIN[vo] = x0; VEIN[vo + 1] = px1; VEIN[vo + 2] = py1; VEIN[vo + 3] = ex; VEIN[vo + 4] = ey;
        n = 0;
        for (let s = 0; s <= VS; s++) {
          const t = s / VS, it = 1 - t;
          const x = it * it * x0 + 2 * it * t * px1 + t * t * ex;
          const y = it * it * 0 + 2 * it * t * py1 + t * t * ey;
          // A vein aimed into a lobe can cross a sinus: stop where it leaves the blade.
          if (t > 0.2 && G.palm < 0.5 && !insideBlade(x, y)) break;
          n = push(n, x, y + G.wobble * 0.4 * noise1(t * 4 + k * 3 + ls), inkW(vwt * vw[0] * grow * (1 - 0.8 * t), t, ls + k + side * 50));
        }
        emitStroke(sStroke, n, KIND_VEIN, false);
      }
      // Veinlets: fine cross-veins between neighbouring secondaries.
      // Guide veins: one from the midrib's base out to the margin near the base, one from
      // high on the midrib out toward the tip. Not drawn; veinlets join them like real veins.
      guideVein(side * 34, side, baseX + 0.01, Math.max(0.03, VEIN[(side * 34 + 1) * 5] * 0.55));
      const xl = VEIN[(side * 34 + vc) * 5];
      guideVein(side * 34 + vc + 1, side, xl + (tipX * 0.97 - xl) * 0.55, 0.97);
      const vlF = G.veinlets, vlN = Math.ceil(vlF - 1e-6);
      for (let k = 0; k <= vc && vlF > 0.01; k++) {
        const a = (side * 34 + k) * 5, b = a + 5;
        for (let q = 0; q < vlN; q++) {
          const t = (q + 0.5 + 0.3 * rnd2(ls + k * 13 + side, q)) / vlF * 0.92;
          if (t > 0.98) continue;
          const vgrow = q === vlN - 1 ? vlF - (vlN - 1) : 1;
          veinPoint(a, t); const x0 = EX, y0 = EY;
          veinPoint(b, t * 0.9 + 0.04); const x1 = EX, y1 = EY;
          // Skip veinlets that would cross outside the blade (between lobes).
          if (G.palm < 0.5 && (!insideBlade(x0, y0) || !insideBlade(x1, y1) || !insideBlade((x0 + x1) / 2, (y0 + y1) / 2))) continue;
          n = 0;
          for (let s = 0; s <= 3; s++) {
            const f = s / 3, bow = Math.sin(Math.PI * f) * 0.012 * sg;
            n = push(n, lerp(x0, x1, f) - bow * 0.5, lerp(y0, y1, f) + bow, inkW(vwt * vw[0] * 0.32 * vgrow, f, ls + k * 7 + q));
          }
          emitStroke(sVeinlet, n, KIND_VEIN, false);
        }
      }
    }
  }
  // Palmate primaries: from the base out to each lobe tip.
  if (vw[1] > 0.02) {
    const nl = Math.max(2, Math.round(G.lobes));
    const dTh = Math.min(1.15, 4.0 / (nl - 1 + 1e-3));
    const pcx = 0.08;
    for (let j = 0; j < nl; j++) {
      const th = (j - (nl - 1) / 2) * dTh;
      if (Math.abs(th) < 0.05) continue;
      const side = th > 0 ? 0 : 1;
      // Outline point whose angle from the palm centre is closest to th.
      let best = 0, bd = 1e9;
      for (let i = 1; i < N; i++) {
        const a = Math.atan2(LY[side][i], LX[side][i] - pcx);
        const d = Math.abs(a - th);
        if (d < bd) { bd = d; best = i; }
      }
      const ex = pcx + (LX[side][best] - pcx) * 0.9, ey = LY[side][best] * 0.9;
      n = 0;
      for (let s = 0; s <= VS; s++) {
        const t = s / VS;
        const x = lerp(baseX + 0.02, ex, t), y = lerp(0, ey, t) + Math.sin(Math.PI * t) * 0.03 * Math.sign(th) * G.veinCurve;
        n = push(n, x, y, inkW(vwt * 1.25 * vw[1] * (1 - 0.75 * t), t, ls + j));
      }
      emitStroke(sStroke, n, KIND_VEIN, false);
    }
  }
  // Parallel: lengthways veins following the outline.
  if (vw[2] > 0.02) {
    const pvF = Math.min(vcF, 9), pv = Math.ceil(pvF - 1e-6);
    for (let side = 0; side < 2; side++) {
      for (let k = 1; k <= pv; k++) {
        const fr = k / (pvF + 1), grow = k === pv ? pvF - (pv - 1) : 1;
        if (fr >= 1) continue;
        n = 0;
        for (let i = 0; i <= N; i += Math.max(1, Math.floor(N / (VS * 2)))) {
          const x = lerp(AX[i], LX[side][i], fr), y = LY[side][i] * fr;
          n = push(n, x, y, inkW(vwt * 0.6 * vw[2] * grow, i / N, ls + k));
        }
        emitStroke(sStroke, n, KIND_VEIN, false);
      }
    }
  }
  // Arcuate: veins that arc forward along the margin toward the tip.
  if (vw[3] > 0.02) {
    const avF = Math.max(2, vcF * 0.6), av = Math.ceil(avF - 1e-6);
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < av; k++) {
        const x0 = baseX + (0.07 + (k + 0.3) / avF * 0.62) * (tipX - baseX), grow = k === av - 1 ? avF - (av - 1) : 1;
        n = 0;
        for (let s = 0; s <= VS; s++) {
          const t = s / VS;
          const u = x0 + t * (0.97 - x0) * 0.82;
          const fr = 0.86 * Math.pow(Math.sin(t * Math.PI / 2), 0.55);
          edgeAt(side, u);
          n = push(n, lerp(u, EX, fr), EY * fr, inkW(vwt * vw[3] * grow * (1 - 0.7 * t), t, ls + k));
        }
        emitStroke(sStroke, n, KIND_VEIN, false);
      }
    }
  }
}

const WAX = new Float32Array(13), WAY = new Float32Array(13);

function pushSeg(start, count, mode) {
  if (count <= 0 || geo.nSeg >= MAX_SEG) return;
  const o = geo.nSeg * 3;
  geo.seg[o] = start; geo.seg[o + 1] = count; geo.seg[o + 2] = mode;
  geo.nSeg++;
}
/**
 * Move the staged fills then lines into geo.verts and empty the stages, so each part
 * (stalks, then each leaflet) is drawn whole before the next covers it.
 */
function flushStaged(leaflet) {
  const c0 = geo.count;
  appendBuf(sFill);
  const c1 = geo.count;
  appendBuf(sVeinlet); appendBuf(sStroke); appendBuf(sRib);
  const c2 = geo.count;
  appendBuf(sOutline);
  const c3 = geo.count;
  if (leaflet) {
    // Fill marks the stencil; veins draw inside it; the outline on top.
    pushSeg(c0, c1 - c0, SEG_FILL);
    pushSeg(c1, c2 - c1, SEG_VEIN);
    pushSeg(c2, c3 - c2, SEG_PLAIN);
  } else pushSeg(c0, c3 - c0, SEG_PLAIN);
  sFill.n = sStroke.n = sVeinlet.n = sRib.n = sOutline.n = 0;
}

// Where appending stops: the buffer's end, or a leaf's own share on its last try (buildShapes).
let vertCap = MAX_VERTS;
function appendBuf(b) {
  const room = vertCap - geo.count;
  const n = Math.min(b.n, room);
  const src = b.a, dst = geo.verts, o = geo.count * STRIDE, m = n * STRIDE;
  for (let i = 0; i < m; i++) dst[o + i] = src[i];
  geo.count += n;
}

// ---------------------------------------------------------------- one leaf variant

function placeLeaflet(o, mirror) {
  plX = slots[o]; plY = slots[o + 1];
  const a = slots[o + 2];
  plC = Math.cos(a); plSn = Math.sin(a); plS = slots[o + 3];
  // Stalk (petiolule) before the blade: shift the base along the leaflet's direction.
  plX += plC * slots[o + 4]; plY += plSn * slots[o + 4];
  plMirror = mirror;
}

/** A plain stroke in leaf coords (no blade stage) from (x0,y0) to (x1,y1). */
function leafLine(x0, y0, x1, y1, w0, w1, kind, ls, oEnd = 1, wing = 0) {
  bladeMode = false;
  let n = 0;
  const steps = wing > 0 ? 24 : 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    toFinal(lerp(x0, x1, t), lerp(y0, y1, t));
    // Swelling fades out toward the end, so the width meets what comes next exactly.
    PX[n] = TX; PY[n] = TY; PW[n] = lerp(inkW(lerp(w0, w1, t), t, ls), lerp(w0, w1, t), smooth(0.6, 1, t));
    // Opaque stalk, clearing toward oEnd over its last stretch; inside a wing (leaf tissue
    // around the bundle) it reads as a vein.
    let o = lerp(1, oEnd, smooth(0.6, 1, t));
    if (wing > 0) {
      const h = G.wing * 0.075 * lerp(Math.pow(Math.sin(Math.PI * t), 0.7), Math.pow(t, 0.8), G.cw[0]);
      o = lerp(o, Math.min(o, 0.2), smooth(0, 2.5, h / Math.max(w0, 1e-4)));
    }
    PO[n] = o;
    lastO = o;
    n++;
  }
  useO = true;
  emitStroke(sStroke, n, kind, false);
  useO = false;
  bladeMode = true;
}

// Resolution divisor for a leaf that came out over its share of the vertex buffer (see
// buildShapes), and for leaves on a long shoot, which are small on screen: 1 up to 15 nodes,
// then 2, 4, 8 from 16, 32, 64 (whole steps, so outlines don't shimmer as counts ease).
let resDiv = 1, nodeDiv = 1;

function buildLeafVariant(v, seed) {
  const vs = seed * 977 + v * 131 + 17;
  jitter(vs);
  blendLayouts();
  sFill.n = sStroke.n = sVeinlet.n = sRib.n = sOutline.n = 0;
  geo.leafStart[v] = geo.count;
  geo.leafSegStart[v] = geo.nSeg;
  const wS = G.cw[0];
  // Simple leaves bend as a whole; compound leaves bend along the rachis, leaflets a little.
  buildBend(leafBend, J.bend * lerp(0.6, 1, wS), J.sCurve * lerp(0.7, 1, wS));
  midribScale = lerp(0.6, 1, wS);
  // Count active leaflets to share the vertex budget.
  let active = 0;
  for (let j = 0; j < MAX_SLOTS; j++) if (slots[j * SF + 3] > 0.004) active++;
  const budget = Math.min(160000, MAX_VERTS / Math.max(1, geo.nLeaf + 1));
  // Vertices per leaflet ≈ 6 × (4N outline+fill + N/5 midrib + 2·veins·VS) — share the budget.
  // Resolution must not change frame to frame while things ease: resampling the outline makes
  // teeth and wobble shimmer. So it steps only with the leaflet count rounded up to a power of
  // two, and budgets for the most veins and veinlets the sliders allow.
  const bucket = Math.pow(2, Math.ceil(Math.log2(Math.max(1, active))));
  const veinsPer = 2 * 22 * (1 + 12 * 0.3); // veinlets are ~3 segments each
  N = clamp(Math.floor(budget / (bucket * 6 * (4.2 + veinsPer * 0.1))), 10, NMAX);
  N = Math.max(4, Math.floor(N / resDiv / nodeDiv));
  N -= N % 2;
  VS = clamp(Math.round(N / 8), 3, 40);
  curSeed = rnd(vs, 5);

  // Stalk: petiole (with optional wing), rachis, pinna rachises, leaflet stalks.
  const pl = J.petLen, mw = G.midribWeight;
  const stalkW = mw * (1 + 2.2 * G.petFlat);
  // The petiole ends at the midrib's (or rachis's) starting width and opacity.
  let petioleO = 0.5;
  if (pl > 0.002) leafLine(-pl, 0, 0, 0, stalkW * 1.1, lerp(mw * 0.9, mw * midribScale, wS), KIND_STEM, vs, lerp(1, 0.5, wS), G.wing);
  if (pl > 0.002) petioleO = lastO;
  if (rachisLen > 0.01) leafLine(0, 0, rachisLen, 0, mw * 0.9, mw * 0.45, KIND_STEM, vs + 1);
  if (G.cw[2] > 0.01) {
    for (let p = 0; p < pinnaN; p++) {
      const o = p * 4;
      const len = Math.hypot(pinnaSeg[o + 2] - pinnaSeg[o], pinnaSeg[o + 3] - pinnaSeg[o + 1]);
      if (len < 0.01) continue;
      // Pinna rachises grow out of the plain rachis as the morph proceeds.
      const t = G.cw[2];
      leafLine(pinnaSeg[o], pinnaSeg[o + 1], lerp(pinnaSeg[o], pinnaSeg[o + 2], t), lerp(pinnaSeg[o + 1], pinnaSeg[o + 3], t), mw * 0.5, mw * 0.3, KIND_STEM, vs + p);
    }
  }
  for (let j = 0; j < MAX_SLOTS; j++) {
    const o = j * SF;
    if (slots[o + 3] <= 0.004 || slots[o + 4] < 0.004) continue;
    const c = Math.cos(slots[o + 2]), s = Math.sin(slots[o + 2]);
    // Leaflet stalks start where the stalk or rachis they grow from is (palmate and trifoliate
    // ones right at the petiole's end), as wide as it is there, and taper into the midrib.
    const w0 = mw * lerp(0.9, 0.45, rachisLen > 0.01 ? clamp(slots[o] / rachisLen, 0, 1) : 0);
    leafLine(slots[o], slots[o + 1], slots[o] + c * slots[o + 4], slots[o + 1] + s * slots[o + 4], w0, G.midribWeight * midribScale, KIND_STEM, vs + j, 0.5);
  }
  if (G.wing > 0.01 && pl > 0.01) {
    // Wing: a leafy strip down each side of the petiole, widening toward the blade.
    bladeMode = false;
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      for (let i = 0; i <= 12; i++) {
        // Simple leaves: widening up to the blade, which flares to meet it (wingJoin).
        // Compound: no blade at the end, so it tapers to a point both ends.
        const t = i / 12;
        const prof = lerp(Math.pow(Math.sin(Math.PI * t), 0.7), Math.pow(t, 0.8), wS);
        const x = lerp(-pl, 0, t), h = G.wing * 0.075 * prof * sg;
        toFinal(x, 0); WAX[i] = TX; WAY[i] = TY;
        toFinal(x, h); PX[i] = TX; PY[i] = TY; PW[i] = inkW(G.outlineW, t, vs + side);
      }
      for (let i = 0; i < 12; i++) {
        const t0 = i / 12, t1 = (i + 1) / 12;
        fillQuad(sFill, WAX[i], WAY[i], PX[i], PY[i], WAX[i + 1], WAY[i + 1], PX[i + 1], PY[i + 1], sg, t0, t1);
      }
      emitStroke(sStroke, 13, KIND_OUTLINE, false);
    }
    bladeMode = true;
  }
  flushStaged(false);
  geo.leafStalkSegs[v] = geo.nSeg - geo.leafSegStart[v];
  // Stipules, over the stalk, each drawn whole (like a leaflet) so the second covers the first
  // where they overlap at their bases.
  if (G.stipules > 0.01) {
    stip = true;
    const keepN = N;
    N = 20;
    buildBend(bladeBend, 0.6, 0);
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      plX = -pl * 0.95; plY = 0; plS = 0.16 * G.stipules;
      plC = Math.cos(sg * 0.95); plSn = Math.sin(sg * 0.95); plMirror = sg;
      emitBlade(vs + 300 + side);
      flushStaged(true);
    }
    N = keepN;
    stip = false;
  }

  // Leaflets, each drawn whole (fill, then lines) over the stalks and earlier leaflets.
  for (let j = 0; j < MAX_SLOTS; j++) {
    const o = j * SF;
    if (slots[o + 3] <= 0.004) continue;
    const ls = vs * 31 + j * 7;
    // Leaflets on the lower side mirror, so they curve the same way relative to the axis.
    const mirror = slots[o + 2] < -0.01 ? -1 : 1;
    buildBend(bladeBend, (1 - wS) * J.bend * 0.5 * (1 + 0.5 * rnd2(ls, 1)), (1 - wS) * J.sCurve * 0.3);
    placeLeaflet(o, mirror);
    // The midrib carries on from its stalk's opacity (petiole, or the leaflet's stalk).
    ribO = j === 0 && wS > 0.5 && pl > 0.002 ? petioleO : 0.5;
    // Only the simple blade at the petiole's end joins the wing. Without a wing the base still
    // flares to a little more than the stalk, so a wedge-shaped base doesn't taper to nothing
    // where it meets it (which left the stalk wider than the leaf, and the midrib on bare paper).
    wingJoin = j === 0 && pl > 0.01 ? Math.max(G.wing * 0.075, G.midribWeight * 1.8) * wS : 0;
    // Leaflets flare the same way to meet their own stalks (blade units: divided by its scale).
    wingJoin = Math.max(wingJoin, (1 - wS) * G.midribWeight * midribScale * 1.8 / Math.max(plS, 1e-3));
    if (wingJoin < 0.002) wingJoin = 0;
    curSeed = rnd(ls, 2);
    emitBlade(ls);
    flushStaged(true);
  }
  wingJoin = 0;

  geo.leafCount[v] = geo.count - geo.leafStart[v];
  geo.leafSegCount[v] = geo.nSeg - geo.leafSegStart[v];

  // Attach point: the petiole's base, and the direction the leaf grows from it.
  bladeMode = false;
  toFinal(-pl, 0); const ax = TX, ay = TY;
  toFinal(-pl + 0.01, 0);
  geo.leafAttach[v * 3] = ax; geo.leafAttach[v * 3 + 1] = ay;
  geo.leafAttach[v * 3 + 2] = Math.atan2(TY - ay, TX - ax);
  bladeMode = true;

}

// ---------------------------------------------------------------- sprigs

const STEM_MAX = 800;
const SX = new Float32Array(STEM_MAX), SY = new Float32Array(STEM_MAX), SPH = new Float32Array(STEM_MAX), SS = new Float32Array(STEM_MAX);
// Sample kinds: 0 along the stem, 1 a node's leaf direction (the kink's bisector; not drawn),
// 2 the stem leaving a node (drawn, so the kink is exact).
const SKIND = new Uint8Array(STEM_MAX);
const NODE_S = new Float32Array(MAX_NODES), NODE_I = new Int32Array(MAX_NODES);

// Bud outlines: half-width along the bud (u 0 base … 1 tip), for each type.
function budWidth(type, u) {
  if (type === 'Pointed') return 0.22 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.8) * Math.pow(1 - u, 0.35);
  if (type === 'Plump') return 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.65);
  return 0.36 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.7); // Scaled
}
const BUD_LEN = { Pointed: 1.6, Plump: 0.9, Scaled: 1.0 };
// Bud type weights (Pointed, Plump, Scaled), so bud types morph into one another.
let bwP = 0, bwPl = 0, bwS = 1;
function budW(u) { return bwP * budWidth('Pointed', u) + bwPl * budWidth('Plump', u) + bwS * budWidth('Scaled', u); }

// Where emitShape writes: sFill, or sStroke for a shape that must sit under the stalks drawn
// there (a lime's bract).
let shapeBuf = sFill;
// Flat fills have no shaded half (spines, a cut face): every outer vertex gets one `across`
// value, inside the margin threshold, instead of ±1 by side.
let flatFill = false;

/**
 * A point on a curved axis, into EX/EY: u (0 … 1) along an axis `len` long leaving (bx, by) at
 * angle a and turning by `bend` radians along its length (an arc), then w across it (+ = left).
 */
function arcAt(bx, by, a, len, bend, u, w) {
  const th = a + bend * u;
  let x, y;
  if (Math.abs(bend) < 1e-4) { x = bx + u * len * Math.cos(a); y = by + u * len * Math.sin(a); }
  else { const r = len / bend; x = bx + r * (Math.sin(th) - Math.sin(a)); y = by - r * (Math.cos(th) - Math.cos(a)); }
  EX = x - w * Math.sin(th); EY = y + w * Math.cos(th);
}

/**
 * A filled shape with a pen outline, from (bx, by) along angle a, `len` long, its axis curving by
 * `bend` radians: `wfn(u, side)` is its half-width (in units of `wid`, usually its length) at u
 * (0 base … 1 tip) on side 0 (left) or 1 (right); `mir` 1 swaps the sides. `notch` (a share of
 * the length) cuts a V into a blunt tip: the fill's anchors stop short of it and the outline
 * dips in. Filled like a leaf (shaded half and all) in the colours of `kind`. Fill and outline
 * go to the same stage, so each shape is drawn whole before the next covers it.
 */
function emitShape(bx, by, a, len, wid, M, wfn, kind, mir, bend, notch) {
  const uMax = 1 - notch;
  fillKind = kind;
  for (let side = 0; side < 2; side++) {
    const sg = side === 0 ? 1 : -1;
    for (let i = 0; i < M; i++) {
      const u0 = i / M, u1 = (i + 1) / M;
      const w0 = wfn(u0, side ^ mir) * wid * sg, w1 = wfn(u1, side ^ mir) * wid * sg;
      arcAt(bx, by, a, len, bend, Math.min(u0, uMax), 0); const ax0 = EX, ay0 = EY;
      arcAt(bx, by, a, len, bend, Math.min(u1, uMax), 0); const ax1 = EX, ay1 = EY;
      arcAt(bx, by, a, len, bend, u0, w0); const ox0 = EX, oy0 = EY;
      arcAt(bx, by, a, len, bend, u1, w1);
      fillQuad(shapeBuf, ax0, ay0, ox0, oy0, ax1, ay1, EX, EY, flatFill ? 0.6 : sg, u0, u1);
    }
  }
  fillKind = KIND_FILL;
  // Outline: up one side, (into the notch,) down the other.
  let m = 0;
  for (let i = 0; i <= M; i++) {
    arcAt(bx, by, a, len, bend, i / M, wfn(i / M, mir) * wid);
    PX[m] = EX; PY[m] = EY; PW[m] = G.outlineW; m++;
  }
  if (notch > 0) { arcAt(bx, by, a, len, bend, uMax, 0); PX[m] = EX; PY[m] = EY; PW[m] = G.outlineW; m++; }
  for (let i = notch > 0 ? M : M - 1; i >= 1; i--) {
    arcAt(bx, by, a, len, bend, i / M, -wfn(i / M, 1 - mir) * wid);
    PX[m] = EX; PY[m] = EY; PW[m] = G.outlineW; m++;
  }
  emitStroke(shapeBuf, m, KIND_OUTLINE, true);
}

/**
 * A bud at (bx, by) pointing along angle a, `size` long (leaf units, scaled by type), as a
 * filled shape (KIND_BUD: shaded like a leaf, in bud colours); the scaled share gets
 * overlapping scales drawn in pen. Shape is the blend of the bud-type weights (bwP, bwPl, bwS).
 */
function emitBud(bx, by, a, size, seed) {
  if (size < 1e-4) return;
  const len = size * (bwP * BUD_LEN.Pointed + bwPl * BUD_LEN.Plump + bwS * BUD_LEN.Scaled);
  const c = Math.cos(a), sn = Math.sin(a);
  emitShape(bx, by, a, len, len, 20, budW, KIND_BUD, 0, 0, 0);
  if (bwS < 0.02) return;
  // Scales: arcs across the bud, alternating sides, each overlapping the next.
  for (let k = 0; k < 5; k++) {
    const u = 0.18 + k * 0.15, sg = k % 2 ? 1 : -1;
    let m = 0;
    for (let i = 0; i <= 8; i++) {
      const f = i / 8, x = (u + 0.14 * Math.sin(Math.PI * f) * (0.8 + 0.4 * rnd(seed, k))) * len;
      const w = sg * budW(u) * len * (1 - 2 * f) * 0.98;
      PX[m] = bx + x * c - w * sn; PY[m] = by + x * sn + w * c; PW[m] = G.outlineW * 0.8 * bwS; m++;
    }
    emitStroke(sFill, m, KIND_OUTLINE, false);
  }
}

// ---------------------------------------------------------------- fruit
// Fruit types are option weights like everything else, so one type morphs into another: the
// outline is the weighted blend of each type's, and each type's extras (a berry's crown, an
// acorn's cup, a key's veins, a burr's spines) scale with its weight.

// Weights of Berry, Drupe, Nut, Key, Pod, Burr (the Fruit select after None), summing to 1.
const FW = new Float32Array(6);
// Length of each type per unit Fruit size: round fruit are as long as they are wide.
const FRUIT_LEN = [1, 1.05, 1.45, 3.2, 4.5, 1];
let fAsym = 0, fSeeds = 5, fCup = 0.5, cupEnd = 0.3, fSpines = 0, fSpineN = 24, fWander = 0, fCut = 0, fKernels = 1;
// The gloss highlight's radius, plus a margin for its wandering edge (0 = none); see inHighlight.
let hlR = 0, fLength = 1;
// The fruit or flower part being drawn: base, direction, length, width, curve (see fruitAt).
let fbx = 0, fby = 0, fa = 0, flen = 1, fwid = 1, fbend = 0, fmir = 1;

// A type's own extras (spines, a cut, a cup, veins, a crown; a flower type as a whole) at the
// type's weight w: gone by the time it falls to ½ and back only once it rises past ½. So in a
// morph they shrink away first, the shared body changes, then the next type's grow in, rather
// than a burr turning into a berry with its spines still out.
function extra(w) { return smooth(0.5, 1, w); }

function roundW(u) { return Math.sqrt(Math.max(0, u * (1 - u))); }
function nutW(u) { return 0.34 * Math.pow(Math.sin(Math.PI * Math.pow(clamp(u, 0, 1), 0.8)), 0.55) * (1 - 0.15 * u); }
// A key: the seed at the base, and a wing beyond it, to one side (sycamore) or both (ash).
function keyW(u, side) {
  const seed = 0.13 * Math.sqrt(Math.sin(Math.PI * clamp(u / 0.3, 0, 1)));
  const sym = 0.12 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.6);
  const one = side === 0 ? 0.26 * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.4)), 0.5) * smooth(0.12, 0.45, u) : 0.025 * Math.sin(Math.PI * u);
  return Math.max(seed * (side === 0 ? 1 : 0.9), lerp(sym, one, fAsym));
}
// A pod: long and flat with a beak, bulging over each seed; the lower edge (the seam) straighter.
function podW(u, side) {
  const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.35);
  const bump = Math.abs(Math.sin(Math.PI * fSeeds * clamp((u - 0.06) / 0.86, 0, 1))) - 0.6;
  return 0.11 * env * (side === 0 ? 1 + 0.25 * bump : 0.85 + 0.06 * bump);
}
function fruitW(u, side) {
  const r = roundW(u);
  return (FW[0] + FW[5]) * r + FW[1] * r * (0.92 + 0.16 * u) + FW[2] * nutW(u) + FW[3] * keyW(u, side) + FW[4] * podW(u, side);
}
// An acorn's cup, over the base of the nut (u in cup lengths, from just behind the nut's base
// to its rim, where it stays open).
function cupW(u) {
  const nu = lerp(-0.06, cupEnd, u);
  return extra(FW[2]) * (nutW(Math.max(nu, 0.03)) * 1.1 + 0.03) * Math.sqrt(smooth(0, 0.3, u)) / (cupEnd + 0.06);
}

/** Part coords (u along in lengths, w across in widths) → sprig coords, into EX/EY. */
function fruitAt(u, w) { arcAt(fbx, fby, fa, flen, fbend, u, w * fmir * fwid); }

/**
 * Is fruit point (u, w) under the gloss highlight? Mirrors the shader: there the highlight sits
 * at across 0.4, along 0.68 (across = the share of the half-width, + on the shape's side 0).
 */
function inHighlight(u, w) {
  if (hlR <= 0) return false;
  const gw = w * fmir, side = gw >= 0 ? 0 : 1;
  const hw = fruitW(u, side ^ (fmir < 0 ? 1 : 0));
  if (hw < 1e-4) return false;
  return Math.hypot(gw / hw - 0.4, (u - 0.68) * 2) < hlR;
}

/**
 * A pen line on a fruit or flower part, in its coords (u along in lengths, w across in widths),
 * bowed sideways by `bow`, half-width p0 → p1; broken where it crosses a fruit's highlight,
 * which leaves paper bare.
 */
function fruitLine(u0, w0, u1, w1, bow, p0, p1, steps) {
  const du = u1 - u0, dw = w1 - w0;
  let m = 0;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps, b = bow * Math.sin(Math.PI * f);
    const u = u0 + du * f - dw * b, w = w0 + dw * f + du * b;
    if (inHighlight(u, w)) { emitStroke(sFill, m, KIND_OUTLINE, false); m = 0; continue; }
    fruitAt(u, w);
    PX[m] = EX; PY[m] = EY; PW[m] = lerp(p0, p1, f); m++;
  }
  emitStroke(sFill, m, KIND_OUTLINE, false);
}

/** A pen line from (x0, y0) to (x1, y1), bowed sideways by `bow`, half-width w0 → w1. */
function penLine(x0, y0, x1, y1, bow, w0, w1, steps) {
  const dx = x1 - x0, dy = y1 - y0;
  let m = 0;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps, b = bow * Math.sin(Math.PI * f);
    PX[m] = x0 + dx * f - dy * b; PY[m] = y0 + dy * f + dx * b; PW[m] = lerp(w0, w1, f); m++;
  }
  emitStroke(sFill, m, KIND_OUTLINE, false);
}

/**
 * A stalk from (x, y) at angle a, `l` long, curving by `bend`, half-width w0 → w1 (× k), bowed a
 * little to one side by the stem's Wander (its ends stay put).
 */
function stalkLine(x, y, a, l, w0, w1, k, seed, bend, steps) {
  let m = 0;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    stalkAt(x, y, a, l, bend, seed, f);
    PX[m] = EX; PY[m] = EY; PW[m] = lerp(w0, w1, f) * k; m++;
  }
  emitStroke(sStroke, m, KIND_STEM, false);
}
/** The point f (0 … 1) along that stalk, wobble and bow included, into EX/EY. */
function stalkAt(x, y, a, l, bend, seed, f) {
  const bow = fWander * 0.15 * rnd2(seed, 77);
  arcAt(x, y, a, l, bend, f, (G.wobble * 0.3 * noise1(f * 3 + seed) + bow * Math.sin(Math.PI * f)) * l);
}

function spineW(u) { return 0.14 * (1 - u); }
// A nut in a cut burr with others (sweet chestnut, beech): a sector of the cavity, its round
// outer edge at u = 1, `wedgeN` (a whole number, at least 2) of them filling the circle. (The
// eased, fractional count gave tan(π / 1.5) and widths off the screen mid-morph.)
let wedgeN = 2;
function wedgeW(u) { return Math.min(u * Math.tan(Math.PI / wedgeN) * 0.9, Math.sqrt(Math.max(0, 1 - u * u)) * 0.98); }

/**
 * One fruit from (bx, by) along angle a, `size` its width (leaf units), with its extras; `mir`
 * 1 mirrors it (the left key of a pair), `bend` curves keys and pods.
 */
function emitFruit(bx, by, a, size, seed, mir, bend) {
  let lenK = 0;
  for (let t = 0; t < 6; t++) lenK += FW[t] * FRUIT_LEN[t];
  // Widths are in units of the natural length, so Fruit length stretches without widening.
  const wid = size * lenK, len = wid * fLength, c = Math.cos(a), sn = Math.sin(a), ow = G.outlineW;
  // Only keys and pods curve; round fruit, and the acorn's cup, stay straight.
  fbx = bx; fby = by; fa = a; flen = len; fwid = wid; fbend = bend * (FW[3] + FW[4]); fmir = mir ? -1 : 1;
  // Small fruit (the berries in a head) get fewer segments.
  const M = clamp(Math.round(size * 240), 12, 28);
  // Burr: spines all round (under the body, which covers their bases), except where the
  // stalk comes in. Flat and matte, each with its whole outline: shaded as cones, every spine
  // was a stripe of light and dark, and the burr read as a tangle.
  const spines = fSpines * extra(FW[5]);
  fruitAt(0.5, 0); const cx = EX, cy = EY;
  if (spines > 0.002) {
    flatFill = true;
    for (let k = 0; k < fSpineN; k++) {
      const th = (k + 0.5 * rnd(seed, 40 + k)) / fSpineN * TAU;
      if (Math.abs(Math.cos(th / 2)) < 0.2) continue; // th near π points back at the stalk
      const r = wid * 0.4, l = wid * spines * 0.5 * (0.7 + 0.6 * rnd(seed, 90 + k));
      emitShape(cx + Math.cos(a + th) * r, cy + Math.sin(a + th) * r, a + th, l + wid * 0.1, l + wid * 0.1, 2, spineW, KIND_HUSK, 0, 0, 0);
    }
    flatFill = false;
  }
  // A husk is matte (no gloss): mostly-burr fruit are drawn as husk.
  emitShape(bx, by, a, len, wid, M, fruitW, FW[5] > 0.5 ? KIND_HUSK : KIND_FRUIT, mir, fbend, 0);
  // Burr, cut open: sliced flat through the middle, so the cut face of the husk shows (flat, in
  // the flesh colour) round a cavity holding the nuts, whole and shiny. Grows from the centre
  // as Cut open eases in.
  const cut = fCut * extra(FW[5]);
  if (cut > 0.01) {
    const rf = wid * 0.5 * cut, rc = rf * 0.68, rk = rc * 0.94;
    flatFill = true;
    emitShape(cx - Math.cos(a) * rf, cy - Math.sin(a) * rf, a, 2 * rf, 2 * rf, M, roundW, KIND_FLESH, 0, 0, 0);
    flatFill = false;
    let m = 0;
    for (let i = 0; i < 32; i++) {
      const t = i / 32 * TAU;
      PX[m] = cx + Math.cos(t) * rc; PY[m] = cy + Math.sin(t) * rc; PW[m] = ow * 0.8; m++;
    }
    emitStroke(sFill, m, KIND_OUTLINE, true);
    const n = Math.max(1, Math.round(fKernels)), rot = a + rnd(seed, 7) * TAU;
    if (n === 1) {
      // A conker: round, with its pale scar (the hilum) away from the highlight.
      const hx = cx - Math.cos(rot) * rk, hy = cy - Math.sin(rot) * rk;
      emitShape(hx, hy, rot, 2 * rk, 2 * rk, M, roundW, KIND_SEED, 0, 0, 0);
      const hr = rk * 0.42, ha = rot + Math.PI * 0.8;
      const sx = cx + Math.cos(ha) * rk * 0.45, sy = cy + Math.sin(ha) * rk * 0.45;
      flatFill = true;
      emitShape(sx - Math.cos(ha) * hr, sy - Math.sin(ha) * hr, ha, 2 * hr, 2 * hr, 12, roundW, KIND_SCAR, 0, 0, 0);
      flatFill = false;
    } else {
      // Nuts packed like segments of an orange, a hair apart.
      wedgeN = n;
      for (let k = 0; k < n; k++) {
        const ph = rot + k * TAU / n, gap = rk * 0.04;
        emitShape(cx + Math.cos(ph) * gap, cy + Math.sin(ph) * gap, ph, rk - gap, rk, M, wedgeW, KIND_SEED, 0, 0, 0);
      }
    }
  }
  // Berry: the dried flower's crown at the far end.
  const crown = extra(FW[0]);
  if (crown > 0.02) {
    for (let k = 0; k < 5; k++) {
      const th = k * TAU / 5 + rnd(seed, k), l = 0.07 * crown;
      fruitLine(0.97, 0, 0.97 + Math.cos(th) * l, Math.sin(th) * l, 0, ow * 2 * crown, ow * crown, 1);
    }
  }
  // Drupe: the seam down one side.
  const seam = extra(FW[1]);
  if (seam > 0.02) {
    fruitLine(0.08, 0.05, 0.95, 0.04, -0.22, ow * 0.8 * seam, ow * 0.8 * seam, 16);
  }
  // Key: veins fanning from the seed into the wing.
  const veins = extra(FW[3]);
  if (veins > 0.02) {
    for (let k = 0; k < 5; k++) {
      const ua = 0.42 + k * 0.13, f = k / 4 - 0.5;
      fruitLine(0.16, 0, lerp(0.93, ua, fAsym), lerp(f * 0.12, 0.85 * keyW(ua, 0), fAsym), lerp(f * 0.04, 0.08, fAsym), ow * 0.7 * veins, ow * 0.4 * veins, 8);
    }
  }
  // Nut: its cup, over the base.
  if (extra(FW[2]) * fCup > 0.01) {
    cupEnd = 0.08 + 0.5 * fCup;
    const back = 0.06 * len, cl = (cupEnd + 0.06) * len, cw = (cupEnd + 0.06) * wid;
    const cbx = bx - c * back, cby = by - sn * back;
    emitShape(cbx, cby, a, cl, cw, 12, cupW, KIND_BUD, 0, 0, 0);
    // Its scales: rows of little arcs.
    for (let r = 0; r < 4; r++) {
      const u = 0.3 + r * 0.17, hw = cupW(u) * 0.8;
      for (let k = -2; k <= 2; k++) {
        const w = (k + 0.5 * (r % 2)) / 2.5 * hw;
        if (Math.abs(w) > hw) continue;
        const ex = cbx + u * cl * c - w * cw * sn, ey = cby + u * cl * sn + w * cw * c, d = hw * cw * 0.18;
        penLine(ex - sn * d, ey + c * d, ex + sn * d, ey - c * d, 0.5, ow * 0.7 * extra(FW[2]), ow * 0.7 * extra(FW[2]), 3);
      }
    }
  }
}

// ---------------------------------------------------------------- flowers
// Weights of Open, Cup, Pea, Catkin (the Flowers select after None). The types don't share an
// outline the way fruit do, so in a morph one shrinks away, then the next grows in (extra).
const FLW = new Float32Array(4);
let flPetals = 5, flNotch = 0, flStamens = 0.5, flFlare = 0.5, flLength = 1;

// An open flower's petal: a narrow claw at the centre, widening to a round end. Petal notch
// blunts the end so emitShape can cut its notch.
function petalW(u) { return 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6) * (1 - 0.18 * flNotch)), 0.55); }
// A cup flower's petal (magnolia): broad and pointed.
function cupPetalW(u) { return 0.42 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.7); }
// A pea flower's keel and wings: a boat, deeper on its lower side.
function keelW(u, side) { return (side === 0 ? 0.3 : 0.18) * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.6); }
// Its calyx: a little green cup, open at the end.
function calyxW(u) { return 0.15 + 0.2 * u; }
// A catkin: a long cylinder with rounded ends.
function catkinW(u) { return 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.22); }
// A bract (lime): a long pale strap along the cluster's stalk.
function bractW(u) { return 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.6); }

/**
 * One flower at (bx, by), facing along angle a, `size` across (leaf units): each type at its
 * weight's size. `mir` mirrors it, `bend` curls a catkin.
 */
function emitFlower(bx, by, a, size, seed, mir, bend) {
  const ow = G.outlineW, sg = mir ? -1 : 1;
  // Open: petals round the centre, face on; stamens; the disc.
  if (extra(FLW[0]) > 0.02) {
    const s = size * extra(FLW[0]), n = Math.max(3, Math.round(flPetals)), rot = a + rnd(seed, 1) * TAU;
    const M = clamp(Math.round(6 + s * 60), 6, 20);
    for (let k = 0; k < n; k++) emitShape(bx, by, rot + k * TAU / n, s * 0.5 * flLength, s * 0.5, M, petalW, KIND_FLOWER, 0, 0, 0.18 * flNotch);
    if (flStamens > 0.01) {
      const ns = s > 0.06 ? 16 : 8, l = s * 0.32 * flStamens;
      for (let k = 0; k < ns; k++) {
        const th = rot + (k + 0.5 * rnd(seed, 10 + k)) / ns * TAU, ll = l * (0.7 + 0.5 * rnd(seed, 30 + k));
        const ex = bx + Math.cos(th) * ll, ey = by + Math.sin(th) * ll;
        penLine(bx, by, ex, ey, 0, ow * 0.7, ow * 0.5, 1);
        penLine(ex, ey, ex + Math.cos(th) * s * 0.03, ey + Math.sin(th) * s * 0.03, 0, s * 0.012, s * 0.012, 1); // anther
      }
    }
    const r = s * 0.09;
    emitShape(bx - Math.cos(rot) * r, by - Math.sin(rot) * r, rot, 2 * r, 2 * r, 8, roundW, KIND_CENTRE, 0, 0, 0);
  }
  // Cup (magnolia), side on: two petals flaring out behind, one in front.
  if (extra(FLW[1]) > 0.02) {
    const s = size * extra(FLW[1]), L = s * flLength, W = s * 0.55, fl = flFlare * 0.5;
    const M = clamp(Math.round(8 + s * 40), 8, 20);
    emitShape(bx, by, a + fl, L, W, M, cupPetalW, KIND_FLOWER, 0, fl * 0.6, 0);
    emitShape(bx, by, a - fl, L, W, M, cupPetalW, KIND_FLOWER, 0, -fl * 0.6, 0);
    emitShape(bx, by, a, L * 0.97, W * 0.85, M, cupPetalW, KIND_FLOWER, 0, 0, 0);
  }
  // Pea (laburnum, robinia), side on: the standard flung back, the keel and wings, the calyx.
  if (extra(FLW[2]) > 0.02) {
    const s = size * extra(FLW[2]), M = clamp(Math.round(6 + s * 50), 6, 16);
    emitShape(bx, by, a + sg * 1.1, s * 0.75, s * 0.8, M, roundW, KIND_FLOWER, 0, 0, 0);
    emitShape(bx, by, a, s * flLength, s * 0.9, M, keelW, KIND_FLOWER, mir, sg * 0.5, 0);
    emitShape(bx, by, a, s * 0.28, s * 0.5, 4, calyxW, KIND_FILL, 0, 0, 0);
  }
  // Catkin: a long, curling cylinder of overlapping scales.
  if (extra(FLW[3]) > 0.02) {
    const wid = size * extra(FLW[3]), len = wid * 5 * flLength;
    emitShape(bx, by, a, len, wid, 24, catkinW, KIND_FLOWER, 0, bend, 0);
    fbx = bx; fby = by; fa = a; flen = len; fwid = wid; fbend = bend; fmir = 1;
    const nr = clamp(Math.round(len / wid * 1.6), 4, 24);
    for (let r = 0; r < nr; r++) {
      const u = 0.06 + 0.88 * (r + 0.5) / nr;
      for (let k = -1; k <= 1; k++) {
        const w = k * 0.32 + (r % 2) * 0.16;
        if (Math.abs(w) > 0.42) continue;
        fruitLine(u, w - 0.12, u, w + 0.12, -0.08, ow * 0.7, ow * 0.7, 3);
      }
    }
  }
}

// ---------------------------------------------------------------- clusters
// Fruit and flowers share one cluster engine, each with its own params under its own prefix.
// Flowers count their nodes from the tip down (they're on the new growth), fruit from the base up.
const FRUIT_KEYS = {
  type: 'fruit', nodes: 'fruitNodes', every: 'fruitEvery', tip: 'fruitTip', form: 'fruitForm', axis: 'fruitAxis', rays: 'fruitRays', taper: 'fruitTaper',
  count: 'fruitCount', size: 'fruitSize', length: 'fruitLength', ped: 'fruitPeduncle', bract: 'fruitBract', stalk: 'fruitStalk',
  hang: 'fruitHang', spread: 'fruitSpread', curve: 'fruitCurve',
};
const FLOWER_KEYS = {
  type: 'flower', nodes: 'flowerNodes', every: 'flowerEvery', tip: 'flowerTip', form: 'flowerForm', axis: 'flowerAxis', rays: 'flowerRays', taper: 'flowerTaper',
  count: 'flowerCount', size: 'flowerSize', length: 'flowerLength', ped: 'flowerPeduncle', bract: 'flowerBract', stalk: 'flowerStalk',
  hang: 'flowerHang', spread: 'flowerSpread', curve: 'flowerCurve',
};

/**
 * Clusters of fruit or flowers in the axils (the At nodes nodes) and at the tip. Each is a
 * stalk (Cluster stalk, with an optional bract) ending in a cluster whose form is a blend of
 * Fan (every item from one point), Raceme (items in turn along a curving axis, smaller toward
 * its tip) and Corymb (rays fanning out to a flat top, each ending in its own little fan); the
 * weights move each item continuously, so forms morph. Presence scales whole clusters and the
 * newest item, so they grow out of the stem as counts ease in. Stalks go to sStroke, items to
 * sFill; a full sFill stops adding items rather than cutting them in half.
 */
function emitClusters(K, flower, P, B, stemW, ss) {
  const wT = B[K.type], there = 1 - wT[0];
  if (there < 0.001 || stemW < 0.001) return;
  if (flower) {
    for (let t = 0; t < 4; t++) FLW[t] = wT[t + 1] / there;
    flPetals = P.flowerPetals.value; flNotch = P.flowerNotch.value; flStamens = P.flowerStamens.value;
    flFlare = P.flowerFlare.value; flLength = P.flowerLength.value;
    hlR = 0;
  } else {
    for (let t = 0; t < 6; t++) FW[t] = wT[t + 1] / there;
    fAsym = P.fruitAsym.value; fSeeds = P.fruitSeeds.value; fCup = P.fruitCup.value;
    fSpines = P.fruitSpines.value; fSpineN = Math.round(P.fruitSpineCount.value);
    fLength = P.fruitLength.value; fCut = P.fruitCut.value; fKernels = P.fruitKernels.value;
    // The highlight (shader: radius 0.3 × Gloss, edge wandering ± half the Halo jitter), widened
    // a little so lines stop clear of it.
    const gloss = P.fruitGloss.value * (P.fruitHighlightOpacity.value > 0 ? 1 : 0);
    // (A burr's husk is matte, so its lines needn't stop for a highlight.)
    hlR = gloss > 0 ? (0.3 * gloss + 0.5 * P.washGapJitter.value + 0.04) * (FW[5] > 0.5 ? 0 : 1) : 0;
  }
  fWander = P.stemWander.value;
  const wF = B[K.form]; // Fan, Raceme, Corymb
  const v = G.variety, cF = Math.max(1, P[K.count].value), cN = Math.ceil(cF - 1e-6), fracC = cF - (cN - 1);
  const spread = P[K.spread].value * DEG, curve = P[K.curve].value;
  const size = P[K.size].value * there * stemW, stalk = P[K.stalk].value, ped = P[K.ped].value, bract = P[K.bract].value;
  const axis = P[K.axis].value, taper = P[K.taper].value;
  const rays = Math.max(1, P[K.rays].value);
  const sw = P.stemWidth.value * (1 - P.stemTaper.value) * 0.6;
  const seed0 = ss + (flower ? 9001 : 7001);
  // This bearer's clusters from the list (clusterSpecs), each turned by spreadOut.
  for (let c = 0; c < nCl; c++) {
    if (CL_FLOWER[c] !== (flower ? 1 : 0)) continue;
    const ni = CL_NI[c], si = CL_SI[c], side = CL_SIDE[c], pres = CL_PRES[c];
    const dir = CL_DIR[c] + SP_TURN[nSpLeaf + c];
    const pl = ped * pres * (1 + v * 0.3 * rnd2(seed0 + ni * 17, 9));
    if (bract > 0.002 && pl > 1e-4) {
      // Under the stalk, which runs down its middle.
      shapeBuf = sStroke;
      emitShape(SX[si], SY[si], dir, pl * 1.1, pl * bract * 0.3, 10, bractW, KIND_BRACT, 0, 0, 0);
      shapeBuf = sFill;
    }
    if (pl > 1e-4) stalkLine(SX[si], SY[si], dir, pl, sw, sw * 0.8, Math.sqrt(pres), ss + ni + (flower ? 500 : 0), 0, 6);
    arcAt(SX[si], SY[si], dir, pl, 0, 1, 0);
    const nx = EX, ny = EY;
    // The raceme's axis, as long as its form's weight makes it (the corymb's rays are drawn
    // with their items, below).
    const axL = axis * pres, axR = axL * wF[1], bendA = curve * side * wF[1], axSeed = seed0 + ni * 17 + 3;
    if (axR > 1e-4) stalkLine(nx, ny, dir, axR, sw * 0.8, sw * 0.5, Math.sqrt(pres), axSeed, bendA, 24);
    let lastRc = -1;
    for (let q = 0; q < cN; q++) {
      if (sFill.n > sFill.cap - 6000 || geo.count + sFill.n + sStroke.n > MAX_VERTS - 6000) break;
      const fs = seed0 + ni * 17 + q * 5;
      const p = pres * (q === cN - 1 ? fracC : 1);
      // Fan: from the stalk's end, spread across Spread.
      const f = (q - (cF - 1) / 2) / Math.max(1, cF - 1);
      const aFan = dir + side * spread * f;
      // Raceme: in turn along the axis, alternating sides, smaller toward its tip.
      // (On the drawn axis, wobble and all, so they sit on it.)
      const t = (q + 0.5) / cF, alt = q % 2 ? 1 : -1;
      if (axR > 1e-4) stalkAt(nx, ny, dir, axR, bendA, axSeed, t); else { EX = nx; EY = ny; }
      const rx = EX, ry = EY, aRac = dir + bendA * t + alt * spread * 0.5;
      // Corymb: on the rays (continuously between them as counts ease), each ray's items fanned.
      const x = (q + 0.5) / cF * rays - 0.5, xf = Math.floor(x);
      const rc = clamp(xf + smooth(0.3, 0.7, x - xf), 0, rays - 1);
      const ph = dir + side * (rays > 1 ? spread * (rc / (rays - 1) - 0.5) : 0);
      const L = axL / Math.max(0.5, Math.cos(ph - dir)) * wF[2];
      const aCor = ph + side * (x - rc) * (rays > 1 ? spread / (rays - 1) : spread * 0.5);
      const bx = rx + Math.cos(ph) * L, by = ry + Math.sin(ph) * L;
      // Each ray is drawn once, by the first item on it (items between rays, mid-morph, draw
      // their own), so every item's stalk starts on a ray.
      if (wF[2] > 0.002 && L > 1e-4 && Math.abs(rc - lastRc) > 1e-6) {
        stalkLine(rx, ry, ph, L, sw * 0.7, sw * 0.5, Math.sqrt(pres), seed0 + ni * 17 + 50 + Math.round(rc * 97), 0, 6);
        lastRc = rc;
      }
      const ang = (wF[0] * aFan + wF[1] * aRac + wF[2] * aCor) + v * 0.15 * rnd2(fs, 1);
      const sz = 1 - taper * t * wF[1];
      // A corymb's stalks vary in length, so its items stack into a head rather than a line.
      const sl = stalk * sz * p * (1 + v * 0.3 * rnd2(fs, 2)) * (1 + wF[2] * 0.45 * rnd2(fs, 6));
      const ca = Math.cos(ang), sa = Math.sin(ang);
      // Each item's stalk starts as wide as what it grows from: the cluster stalk, or the thinner
      // axis or ray.
      const w0 = lerp(pl > 1e-4 ? sw * 0.8 : sw, sw * 0.45, wF[1] + wF[2]);
      if (sl > 1e-4) stalkLine(bx, by, ang, sl, w0, Math.min(w0, sw * 0.6), Math.sqrt(p), fs, 0, 6);
      curSeed = rnd(fs, 3);
      // Items turned clockwise from their axis are mirrored, so a pair of keys spread their
      // wings outward, and pea flowers and catkins curl away from each other.
      const off = wF[0] * side * f + wF[1] * alt * 0.5 + wF[2] * side * ((q + 0.5) / cF - 0.5);
      const mir = off < -1e-3 ? 1 : 0, bendI = curve * side * (mir ? -1 : 1);
      const isz = size * sz * p * (1 + v * 0.12 * rnd2(fs, 4));
      if (flower) emitFlower(bx + ca * sl, by + sa * sl, ang, isz, fs, mir, bendI);
      else emitFruit(bx + ca * sl, by + sa * sl, ang, isz, fs, mir, bendI);
    }
    // The cluster as its own run (stalks, then items), so it can be layered among the leaves.
    geo.clStart[c] = geo.count;
    appendBuf(sStroke);
    geo.clStalk[c] = geo.count - geo.clStart[c];
    appendBuf(sFill);
    sStroke.n = sFill.n = 0;
    geo.clCount[c] = geo.count - geo.clStart[c];
    geo.clNode[c] = ni;
  }
}

// ---------------------------------------------------------------- spreading out
// The sprig's leaves and clusters, each seen as a capsule along its own direction from its
// node, turn away from those they overlap, about their nodes, a little each pass. The turn is
// a smooth function of the shape (continuous overlaps, a soft cap), so it moves continuously
// through morphs rather than jumping when one ends. Items under others are fine, as in a
// botanical drawing; spreading only makes more of each one show.

const MAX_SP = MAX_PLACE + MAX_CL;
// Points sampled along each capsule (see spreadOut).
const SPREAD_K = 5;
// Cluster list (clusterSpecs): bearer, node index, stem sample, side, presence, direction.
const CL_FLOWER = new Uint8Array(MAX_CL), CL_NI = new Int32Array(MAX_CL), CL_SI = new Int32Array(MAX_CL);
const CL_SIDE = new Float32Array(MAX_CL), CL_PRES = new Float32Array(MAX_CL), CL_DIR = new Float32Array(MAX_CL);
let nCl = 0;
// Queued leaf placements (placed after spreading).
const PL_LV = new Int32Array(MAX_PLACE), PL_SI = new Int32Array(MAX_PLACE), PL_NODE = new Int32Array(MAX_PLACE);
const PL_REL = new Float32Array(MAX_PLACE), PL_SIZE = new Float32Array(MAX_PLACE), PL_PRES = new Float32Array(MAX_PLACE);
// Capsules (leaves first, then clusters): node, direction, extent along it (r0 … r1), radius,
// weight (presence); the near and far points; each item's turn so far, and its capped turn.
const SP_NX = new Float32Array(MAX_SP), SP_NY = new Float32Array(MAX_SP), SP_ANG = new Float32Array(MAX_SP);
const SP_R0 = new Float32Array(MAX_SP), SP_R1 = new Float32Array(MAX_SP), SP_RAD = new Float32Array(MAX_SP);
const SP_W = new Float32Array(MAX_SP), SP_PX = new Float32Array(MAX_SP), SP_PY = new Float32Array(MAX_SP);
const SP_QX = new Float32Array(MAX_SP), SP_QY = new Float32Array(MAX_SP);
const SP_RAW = new Float32Array(MAX_SP), SP_TURN = new Float32Array(MAX_SP);
let nSpLeaf = 0;
// Each leaf variant's reach along its axis from where it attaches, and its half-width.
const VLEN = new Float32Array(MAX_VARIANTS), VWID = new Float32Array(MAX_VARIANTS);

/** Measure each leaf variant (in leaf coords, from its attach point along its direction). */
function measureVariants() {
  for (let v = 0; v < geo.nLeaf; v++) {
    const ax = geo.leafAttach[v * 3], ay = geo.leafAttach[v * 3 + 1], th = geo.leafAttach[v * 3 + 2];
    const c = Math.cos(th), sn = Math.sin(th);
    let L = 0, W = 0;
    for (let i = geo.leafStart[v]; i < geo.leafStart[v] + geo.leafCount[v]; i++) {
      const dx = geo.verts[i * STRIDE] - ax, dy = geo.verts[i * STRIDE + 1] - ay;
      L = Math.max(L, dx * c + dy * sn); W = Math.max(W, Math.abs(-dx * sn + dy * c));
    }
    VLEN[v] = L; VWID[v] = W;
  }
}

/**
 * Add this bearer's clusters to the list: one per node that bears them (the side away from
 * its leaf), then the tip, each with a capsule roughly covering it for spreadOut.
 */
function clusterSpecs(K, flower, P, B, nN, fracN, stemN, stemW) {
  const wT = B[K.type], there = 1 - wT[0];
  if (there < 0.001 || stemW < 0.001) return;
  const wF = B[K.form], hang = P[K.hang].value * DEG, spread = P[K.spread].value * DEG;
  const ped = P[K.ped].value, axis = P[K.axis].value, stalk = P[K.stalk].value;
  const size = P[K.size].value * there * stemW;
  // A rough length for one item: catkins are long, fruit a little longer than wide.
  const itemLen = size * P[K.length].value * (flower ? 1 + 4 * wT[4] / there : 1.5);
  // Every: only every nth node bears (spaced along a long needled shoot).
  const every = Math.max(1, Math.round(P[K.every].value));
  for (let i = 0; i <= nN && nCl < MAX_CL; i++) {
    const tip = i === nN, ni = tip ? nN : flower ? nN - 1 - i * every : i * every;
    if (!tip && (ni < 0 || ni >= nN)) continue;
    const pres = tip ? P[K.tip].value : clamp(P[K.nodes].value - i, 0, 1) * (ni === nN - 1 ? fracN : 1);
    if (pres < 0.002) continue;
    const si = tip ? stemN - 1 : NODE_I[ni], side = tip ? 1 : ni % 2 ? 1 : -1;
    const c = nCl++, k = nSpLeaf + c;
    CL_FLOWER[c] = flower ? 1 : 0; CL_NI[c] = ni; CL_SI[c] = si; CL_SIDE[c] = side; CL_PRES[c] = pres;
    CL_DIR[c] = SPH[si] + side * hang;
    SP_NX[k] = SX[si]; SP_NY[k] = SY[si]; SP_ANG[k] = CL_DIR[c];
    SP_R0[k] = ped * pres * 0.5;
    SP_R1[k] = (ped + axis * (wF[1] + wF[2])) * pres + stalk + itemLen;
    SP_RAD[k] = itemLen * 0.5 + (stalk + axis * wF[2] * pres) * Math.sin(Math.min(spread, Math.PI) / 2);
    SP_W[k] = pres;
  }
}

/** Turn the n capsules apart, into SP_TURN: at most ±0.6 rad × amount each. */
function spreadOut(n, amount) {
  for (let i = 0; i < n; i++) { SP_RAW[i] = 0; SP_TURN[i] = 0; }
  if (amount <= 0 || n < 2) return;
  const maxTurn = 0.6 * amount;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < n; i++) {
      const a = SP_ANG[i] + SP_TURN[i], c = Math.cos(a), sn = Math.sin(a);
      SP_PX[i] = SP_NX[i] + c * SP_R0[i]; SP_PY[i] = SP_NY[i] + sn * SP_R0[i];
      SP_QX[i] = SP_NX[i] + c * SP_R1[i]; SP_QY[i] = SP_NY[i] + sn * SP_R1[i];
    }
    for (let i = 0; i < n; i++) {
      if (SP_W[i] < 0.002) continue;
      let torque = 0;
      const a = SP_ANG[i] + SP_TURN[i], ca = Math.cos(a), sa = Math.sin(a);
      const mxi = (SP_PX[i] + SP_QX[i]) / 2, myi = (SP_PY[i] + SP_QY[i]) / 2, hi = (SP_R1[i] - SP_R0[i]) / 2;
      for (let j = 0; j < n; j++) {
        if (j === i || SP_W[j] < 0.002) continue;
        const rr = SP_RAD[i] + SP_RAD[j];
        // Far apart (midpoints further than both half-lengths and radii): nothing to do.
        const mx = (SP_PX[j] + SP_QX[j]) / 2 - mxi, my = (SP_PY[j] + SP_QY[j]) / 2 - myi, reach = hi + (SP_R1[j] - SP_R0[j]) / 2 + rr;
        if (mx * mx + my * my > reach * reach) continue;
        // A smooth sum over points along both capsules: each pair closer than the two radii
        // turns i away from the side of its axis that j's point is on (the sine of its angle
        // off the axis, seen from i's node). Every term is continuous, so the turn is too; a
        // single closest pair jumped when two spots were nearly as close.
        for (let k = 0; k < SPREAD_K; k++) {
          const fi = k / (SPREAD_K - 1), xi = lerp(SP_PX[i], SP_QX[i], fi), yi = lerp(SP_PY[i], SP_QY[i], fi);
          for (let l = 0; l < SPREAD_K; l++) {
            const fj = l / (SPREAD_K - 1), xj = lerp(SP_PX[j], SP_QX[j], fj), yj = lerp(SP_PY[j], SP_QY[j], fj);
            const d = Math.hypot(xi - xj, yi - yj);
            if (d >= rr) continue;
            const vx = xj - SP_NX[i], vy = yj - SP_NY[i], vl = Math.hypot(vx, vy);
            if (vl < 1e-6) continue;
            torque -= SP_W[j] * (rr - d) / rr * (ca * vy - sa * vx) / vl / SPREAD_K;
          }
        }
      }
      SP_RAW[i] += 0.5 * torque;
    }
    for (let i = 0; i < n; i++) SP_TURN[i] = maxTurn * Math.tanh(SP_RAW[i] / maxTurn);
  }
}


/**
 * The sprig, always built (no stem = a stem of zero length bearing only its terminal leaf).
 * Everything is weighted, so it morphs: arrangement weights (B.arrangement: no stem,
 * alternate, opposite, whorled) set each arrangement's leaves' presence; the stem grows from
 * its base as "no stem" fades; fractional node and whorl counts grow their newest leaves out
 * of the stem. Each placement stores its presence in slot 7: the renderer scales the leaf
 * about where it attaches, so leaves grow from and shrink into the stem.
 */
function buildSprigVariant(j, P, B, seed) {
  const ss = seed * 1931 + j * 211 + 5;
  const v = G.variety;
  const wA = B.arrangement, wT = B.terminal, wB = B.budType;
  const stemW = 1 - wA[0];
  const nodesF = Math.max(1, P.nodes.value), nN = Math.ceil(nodesF - 1e-6), fracN = nodesF - (nN - 1);
  const inter = P.internode.value, taper = P.internodeTaper.value;
  // Node positions along the stem; the newest node rises up from the tip as it grows in.
  let s = P.bareStem.value * (1 + 0.2 * v * rnd2(ss, 1));
  for (let i = 0; i < nN; i++) {
    NODE_S[i] = s;
    s += inter * (1 - taper * i / Math.max(1, nodesF - 1)) * (1 + 0.2 * v * rnd2(ss, 10 + i)) * (i === nN - 2 ? fracN : 1);
  }
  // The tip runs on past the last node by Bud stem (a bare tip a little further).
  const len = Math.max(1e-4, (NODE_S[nN - 1] + P.budStem.value + inter * 0.23 * wT[2]) * stemW);
  for (let i = 0; i < nN; i++) NODE_S[i] *= stemW;
  // Stem centre line: steady curve + droop toward the tip + a kink at each node.
  // Scaled by how much stem there is, so with no stem the lone leaf points straight up.
  const curve = (P.stemCurve.value + v * 0.4 * rnd2(ss, 2)) * stemW, droop = P.stemDroop.value * (1 + 0.3 * v * rnd2(ss, 3)) * stemW;
  const zig = P.zigzag.value * DEG * stemW, wander = P.stemWander.value * 0.3 * stemW, wo = 17.3 + ss % 101;
  // The kinks sit exactly on the nodes, not on the next sample: snapping them to a sample grid
  // that slides as the stem's length eases swung every leaf's angle back and forth mid-morph.
  const ds = Math.max(1e-4, len / (STEM_MAX - 3 - 2 * nN));
  let x = 0, y = 0, ph = 0, ni = 0, n = 0, sk = 0, k = 0;
  for (;;) {
    // Wander: noise in arc length (leaf units), so wiggles keep their size as the stem grows.
    const bendK = curve * (sk / len) + droop * (sk / len) * (sk / len) * 1.4 + wander * noise1(sk * 2.2 + wo);
    let kind = 0;
    while (ni < nN && NODE_S[ni] <= sk) {
      // The leaf sits on the bisector of the kink, in the angle between stem in and stem out.
      const kink = zig * (ni % 2 ? 1 : -1) * (ni === nN - 1 ? fracN : 1);
      NODE_I[ni] = n;
      SX[n] = x; SY[n] = y; SPH[n] = ph + bendK + kink / 2; SS[n] = sk; SKIND[n] = 1; n++;
      ph += kink; ni++; kind = 2;
    }
    const phk = ph + bendK;
    SX[n] = x; SY[n] = y; SPH[n] = phk; SS[n] = sk; SKIND[n] = kind; n++;
    if (sk >= len || n >= STEM_MAX - 2) break;
    let next = Math.min((k + 1) * ds, len);
    if (ni < nN && NODE_S[ni] < next) next = NODE_S[ni]; else k++;
    x += Math.cos(phk) * (next - sk); y += Math.sin(phk) * (next - sk);
    sk = next;
  }
  const stemN = n;

  // Stem mesh.
  sFill.n = sStroke.n = 0;
  curSeed = rnd(ss, 4);
  const sw = P.stemWidth.value * Math.sqrt(stemW), st = P.stemTaper.value;
  let m = 0;
  // Every few samples, plus each node (so kinks stay sharp) and the tip, where the bud sits.
  // A bare tip (Terminal Bare) tapers to a point past the last node instead of ending square.
  const every = Math.max(1, Math.floor(stemN / 120));
  const lastNode = NODE_S[nN - 1], tipEnd = Math.max(len, lastNode + 1e-4);
  for (let i = 0, c = 0; i < stemN; i++) {
    if (SKIND[i] === 1) continue;
    if (SKIND[i] === 0 && c++ % every !== 0 && i !== stemN - 1) continue;
    const f = SS[i] / len, point = 1 - 0.85 * wT[2] * smooth(lastNode, tipEnd, SS[i]);
    PX[m] = SX[i] + G.wobble * 0.3 * noise1(f * 7 + ss); PY[m] = SY[i]; PW[m] = inkW(sw * (1 - st * f), f, ss) * point; m++;
  }
  if (stemW > 0.001) emitStroke(sStroke, m, KIND_STEM, false);
  // Terminal bud, its type blended: Cluster adds two plump side buds to a scaled main bud.
  const budSize = P.budSize.value * wT[1] * stemW;
  if (budSize > 1e-4) {
    // The bud's base sits just inside the end of the stem, so it grows out of it.
    const bp = SPH[stemN - 1], tipW = sw * (1 - st);
    const bx = PX[m - 1] - Math.cos(bp) * tipW, by = PY[m - 1] - Math.sin(bp) * tipW;
    if (wB[3] > 0.001) {
      bwP = 0; bwPl = 1; bwS = 0;
      emitBud(bx, by, bp - 1.05, budSize * 0.55 * wB[3], ss + 1);
      emitBud(bx, by, bp + 1.05, budSize * 0.55 * wB[3], ss + 2);
    }
    bwP = wB[0]; bwPl = wB[1]; bwS = wB[2] + wB[3];
    emitBud(bx, by, bp, budSize, ss);
  }

  geo.sprigStart[j] = geo.count;
  appendBuf(sStroke);
  geo.sprigCount[j] = geo.count - geo.sprigStart[j];
  geo.budStart[j] = geo.count;
  appendBuf(sFill); appendBuf(sOutline);
  sOutline.n = 0;
  geo.budCount[j] = geo.count - geo.budStart[j];

  // Leaf placements, base to tip; each arrangement's leaves weighted by its blend. Queued, so
  // they can be spread out (with the clusters) before they're placed.
  const po = j * MAX_PLACE * 8;
  let np = 0;
  const nLeaf = Math.max(1, geo.nLeaf);
  const div = P.divergence.value * DEG, dec = Number(P.decussate.value);
  const perF = Math.max(1, P.whorlCount.value), perN = Math.ceil(perF - 1e-6), fracW = perF - (perN - 1);
  // Alternate leaves in bundles (pine's pairs): Per node of them, fanned across Bundle spread.
  const bunF = Math.max(1, P.perNode.value), bunN = Math.ceil(bunF - 1e-6), fracB = bunF - (bunN - 1), bunSpread = P.bundleSpread.value * DEG;
  const ins0 = P.insertion.value * DEG, ins1 = P.tipInsertion.value * DEG, grad = P.sizeGradient.value;
  const fore = P.foreshorten.value, baseShrink = P.baseShrink.value;
  for (let i = 0; i < nN; i++) {
    const fi = nodesF > 1 ? Math.min(1, i / (nodesF - 1)) : 0;
    const nodeGrow = i === nN - 1 ? fracN : 1;
    for (let a = 1; a <= 3; a++) {
      const wa = wA[a] * stemW;
      if (wa < 0.001) continue;
      const per = a === 1 ? bunN : a === 2 ? 2 : perN;
      for (let q = 0; q < per && np < MAX_PLACE; q++) {
        const key = i * 8 + q;
        const beta = lerp(ins0, ins1, fi) + v * 0.12 * rnd2(ss, 40 + key);
        // Pressed flat, as on a herbarium sheet: every leaf keeps its true shape and lies to
        // one side of the stem at an angle `rel` from it (+ = the stem's left).
        let rel, pres = wa * nodeGrow, fsh = 1;
        if (a === 1) {
          // Alternate: pressed, the sides simply alternate; leaves that faced front or back in
          // life (by their turn around the stem) press nearer it, and with Foreshorten look
          // shorter, as they point toward or away from you. Taking the side from parity, not
          // the turn, stops leaves swinging across the stem as divergence eases.
          const c = Math.cos(i * div), sd = i % 2 ? -1 : 1;
          rel = sd * beta * (0.5 + 0.5 * Math.abs(c));
          fsh = lerp(1, 0.35 + 0.65 * Math.abs(c), fore);
          // A bundle fans about that direction, on the same side; its newest leaf grows in.
          rel += sd * bunSpread * ((q - (bunF - 1) / 2) / Math.max(1, bunF - 1));
          if (q === bunN - 1) pres *= fracB;
        } else if (a === 2) {
          // Opposite: a pair, one each side. Decussate pairs alternate wide and narrow.
          rel = (q === 0 ? 1 : -1) * beta * (i % 2 ? lerp(1, 0.55, dec) : 1);
        } else {
          // Whorled: fanned evenly across ±insertion, every other ring staggered narrower;
          // the newest leaf in a ring grows in as the count rises.
          rel = beta * (2 * q / Math.max(1, perF - 1) - 1) * (i % 2 ? 0.75 : 1);
          if (q === perN - 1) pres *= fracW;
        }
        // Smaller toward the tip (Size gradient) and, with Base shrink, toward the base too.
        const size = (1 - grad * fi) * (1 - baseShrink * (1 - smooth(0, 0.6, fi))) * fsh * (1 + v * 0.12 * rnd2(ss, 70 + key));
        // The same node and position keep the same leaf shape across arrangements.
        np = queuePlace(np, (i * 3 + q * 5) % nLeaf, NODE_I[i], i, rel, size, pres);
      }
    }
  }
  // The terminal leaf: all there is with no stem; otherwise weighted by Terminal = Leaf.
  const tipPres = wA[0] + stemW * wT[0];
  if (tipPres > 0.001 && np < MAX_PLACE) np = queuePlace(np, 0, stemN - 1, nN, 0, lerp(1, (1 - grad) * 0.9, stemW), tipPres);

  // Spread the leaves and clusters apart, then place them.
  nSpLeaf = np; nCl = 0;
  for (let p = 0; p < np; p++) {
    const lv = PL_LV[p], si = PL_SI[p], sz = Math.max(0.05, PL_SIZE[p]);
    SP_NX[p] = SX[si]; SP_NY[p] = SY[si]; SP_ANG[p] = SPH[si] + PL_REL[p];
    SP_R0[p] = VLEN[lv] * sz * 0.35; SP_R1[p] = VLEN[lv] * sz * 0.85; SP_RAD[p] = VWID[lv] * sz * 0.75;
    SP_W[p] = PL_PRES[p];
  }
  clusterSpecs(FRUIT_KEYS, false, P, B, nN, fracN, stemN, stemW);
  clusterSpecs(FLOWER_KEYS, true, P, B, nN, fracN, stemN, stemW);
  spreadOut(np + nCl, P.spreadOut.value * stemW);
  for (let p = 0; p < np; p++) {
    // A leaf can turn toward the stem, but not across it.
    const rel = PL_REL[p], r = rel + SP_TURN[p], lim = Math.min(Math.abs(rel), 0.1);
    const relT = rel > 1e-3 ? Math.max(r, lim) : rel < -1e-3 ? Math.min(r, -lim) : r;
    place(po, p, PL_LV[p], PL_SI[p], relT, PL_SIZE[p], PL_PRES[p]);
    geo.placeNode[p] = PL_NODE[p];
    PL_REL[p] = relT;
  }
  emitNodeParts(P, np, nN, stemW, ss);
  geo.sprigNPlace[j] = np;
  geo.sprigNodes = nN;

  // Fruit and flowers: each cluster its own run, layered among the leaves by the renderer.
  sFill.n = sStroke.n = 0;
  geo.fruitStart[j] = geo.count;
  emitClusters(FRUIT_KEYS, false, P, B, stemW, ss);
  emitClusters(FLOWER_KEYS, true, P, B, stemW, ss);
  geo.nCl = nCl;
  geo.fruitCount[j] = geo.count - geo.fruitStart[j];
}

/**
 * Pegs (spruce: a short woody stub under each leaf, in the back layer with the stem) and sheaths
 * (pine: a papery sleeve round the base of each bundle, drawn over it), each from its leaf's node
 * along its direction, scaled with the leaf.
 */
function emitNodeParts(P, np, nN, stemW, ss) {
  const pegs = P.pegs.value * stemW, sheath = P.sheath.value * stemW;
  const pw = P.stemWidth.value * (1 - P.stemTaper.value) * 0.7;
  sStroke.n = sFill.n = 0;
  geo.pegStart = geo.count;
  for (let p = 0; p < np && pegs > 0.002; p++) {
    const si = PL_SI[p], sz = PL_SIZE[p] * PL_PRES[p];
    if (PL_NODE[p] >= nN || sz < 1e-3) continue;
    stalkLine(SX[si], SY[si], SPH[si] + PL_REL[p], pegs * 0.1 * sz, pw, pw * 0.8, 1, ss + 300 + p, 0, 2);
  }
  appendBuf(sStroke); sStroke.n = 0;
  geo.pegCount = geo.count - geo.pegStart;
  // One sheath per bundle: at the first leaf of each node, pointing along the bundle's middle.
  let p = 0;
  for (let n = 0; n <= nN; n++) {
    geo.sheathStart[n] = geo.count;
    let a = 0, sz = 0, k = 0;
    const p0 = p;
    for (; p < np && PL_NODE[p] === n; p++) { a += PL_REL[p]; sz += PL_SIZE[p] * PL_PRES[p]; k++; }
    if (sheath > 0.002 && k > 0 && n < nN) {
      const si = PL_SI[p0], L = sheath * 0.16 * sz / k;
      emitShape(SX[si], SY[si], SPH[si] + a / k, L, L, 6, sheathW, KIND_BUD, 0, 0, 0);
      appendBuf(sFill); sFill.n = 0;
    }
    geo.sheathCount[n] = geo.count - geo.sheathStart[n];
  }
}
// A sheath: a narrow papery sleeve, open at its end.
function sheathW(u) { return 0.12 + 0.06 * u; }

/** Queue one leaf placement (see buildSprigVariant); returns the new count. */
function queuePlace(np, lv, si, node, rel, size, pres) {
  PL_LV[np] = lv; PL_SI[np] = si; PL_NODE[np] = node; PL_REL[np] = rel; PL_SIZE[np] = size; PL_PRES[np] = pres;
  return np + 1;
}


/** Add one leaf placement at stem sample si; returns the new count. */
function place(po, np, lv, si, rel, size, pres) {
  const flip = rel >= 0 ? 1 : -1;
  const sph = SPH[si], nx = SX[si], ny = SY[si];
  const A = lv * 3, axp = geo.leafAttach[A], ayp = geo.leafAttach[A + 1], th = geo.leafAttach[A + 2];
  const g = sph + rel, cg = Math.cos(g), sgn = Math.sin(g), cA = Math.cos(th), sA = Math.sin(th);
  const sx = Math.max(0.05, size), sy = Math.max(0.05, size) * flip;
  // Q = R(g) · diag(sx, sy) · R(−th);  T = node − Q · attach
  const q00 = cg * sx * cA + sgn * sy * sA, q01 = cg * sx * sA - sgn * sy * cA;
  const q10 = sgn * sx * cA - cg * sy * sA, q11 = sgn * sx * sA + cg * sy * cA;
  const tx = nx - (q00 * axp + q01 * ayp), ty = ny - (q10 * axp + q11 * ayp);
  const o = po + np * 8;
  geo.sprigPlace[o] = lv; geo.sprigPlace[o + 1] = q00; geo.sprigPlace[o + 2] = q10; geo.sprigPlace[o + 3] = q01;
  geo.sprigPlace[o + 4] = q11; geo.sprigPlace[o + 5] = tx; geo.sprigPlace[o + 6] = ty; geo.sprigPlace[o + 7] = pres;
  return np + 1;
}

// ---------------------------------------------------------------- entry point

/**
 * Rebuild from the params and the current option weights (B: one weight array per select,
 * including arrangement, terminal, budType and fruit). `variety` is how much sprig leaves differ.
 * Params may be eased, fractional copies (see sketch.js), so counts can be fractional.
 */
export function buildShapes(P, B, variety) {
  resolveKnobs(P, B, variety);
  // No stem at all: one leaf. Any stem: a few variants so the sprig's leaves differ.
  const nv = B.arrangement[0] < 0.999 ? 6 : 1;
  nodeDiv = nv > 1 ? clamp(Math.pow(2, Math.floor(Math.log2(Math.max(1, P.nodes.value / 8)))), 1, 8) : 1;
  const seed = P.seed.value;
  geo.count = 0;
  geo.nSeg = 0;
  geo.nLeaf = nv;
  // Each leaf gets an equal share of the buffer, with one share kept for the sprig. A leaf over
  // its share (many leaflets, mostly mid-morph between two compound types, when both layouts'
  // leaflets are out at once) is rebuilt at half the resolution, then a quarter. Without this
  // the buffer overflowed: the last leaves and the stem were cut off, and an empty leaf's box
  // threw the framing out.
  const share = Math.floor(Math.min(160000, MAX_VERTS / (nv + 1)));
  for (let v = 0; v < nv; v++) {
    const c0 = geo.count, s0 = geo.nSeg;
    for (resDiv = 1; ; resDiv *= 2) {
      // Last try: still too many (veins cost the same at any resolution), so cut it at its
      // share rather than starve the leaves after it and the stem.
      if (resDiv === 4) vertCap = c0 + share;
      buildLeafVariant(v, seed);
      if (geo.count - c0 <= share || resDiv >= 4) break;
      geo.count = c0; geo.nSeg = s0;
    }
    vertCap = MAX_VERTS;
  }
  resDiv = 1;
  measureVariants();
  buildSprigVariant(0, P, B, seed);
}
