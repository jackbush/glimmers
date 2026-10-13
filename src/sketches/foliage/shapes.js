// Foliage — leaf and sprig geometry, built on the CPU whenever a shape param changes.
//
// buildShapes() turns the shared params into `variants` leaf meshes (each a jittered take on
// the same species) and, in stem mode, as many sprig meshes (a stem plus leaf placements).
// Everything is written into preallocated typed arrays: rebuilding allocates nothing, so it
// can run every frame while a slider is dragged or a category morphs.
//
// Coordinates: a leaf's blade runs from its base (0, 0) to its tip at about (1, 0); the
// petiole hangs back to (−petioleLength, 0). Compound leaves are normalised to about the same
// overall length. Every select param is a blend of option weights (see sketch.js), so each
// option below is a set of continuous numbers that can be mixed with the others.
//
// Vertex layout (STRIDE floats): x, y, nx, ny, hw, across, along, kind, fold, seed.
//   fills:   nrm = 0, hw = 0, across = −1…1 across the blade (0 on the midrib), along = 0…1.
//   strokes: centre-line point plus unit normal and half-width; the vertex shader extrudes,
//            so lines can keep a minimum width in screen px. across = ±1, along = arc length.
//   fold:    signed distance past the turnover fold line (< 0 = not folded away).
//   kind:    KIND_* below, + FLAP for the folded-over copy.

export const STRIDE = 10;
export const MAX_VERTS = 420000;
export const MAX_VARIANTS = 16;
export const MAX_CIRC = 32;
export const MAX_SPRIG_CIRC = 360;
export const MAX_PLACE = 56;

export const KIND_FILL = 0, KIND_OUTLINE = 1, KIND_VEIN = 2, KIND_RIB = 3, KIND_HAIR = 4, KIND_CREASE = 5, KIND_STEM = 6, FLAP = 8;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- option tables
// Each select option is a row of continuous numbers. sketch.js eases a weight per option,
// and the shape uses the weighted sum, so switching category morphs.

// Outline: [widest point (0 base … 1 tip), half-width per unit length, roundness exponent, cordate lobes]
const OUTLINE = {
  Linear: [0.5, 0.07, 0.35, 0],
  Lanceolate: [0.32, 0.15, 1.0, 0],
  Elliptic: [0.5, 0.27, 0.85, 0],
  Ovate: [0.36, 0.33, 0.85, 0],
  Obovate: [0.66, 0.3, 0.85, 0],
  Cordate: [0.3, 0.42, 0.8, 0.55],
  Orbicular: [0.5, 0.47, 0.6, 0.12],
  Deltoid: [0.1, 0.48, 0.9, 0],
  Needle: [0.5, 0.022, 0.25, 0],
};
// Base: [base exponent (1 = wedge, small = blunt), cordate lobes, asymmetry]
const BASE = {
  Cuneate: [1.25, 0, 0],
  Rounded: [0.55, 0, 0],
  Cordate: [0.5, 0.55, 0],
  Truncate: [0.2, 0, 0],
  Asymmetric: [0.6, 0.12, 1],
};
// Apex: [apex exponent, drawn-out tip, notch]
const APEX = {
  Acute: [1.0, 0, 0],
  Acuminate: [1.15, 1, 0],
  Obtuse: [0.62, 0, 0],
  Rounded: [0.4, 0, 0],
  Notched: [0.38, 0, 1],
};
// Lobing: [pinnate amount, palmate amount]
const LOBING = { Unlobed: [0, 0], 'Pinnately lobed': [1, 0], 'Palmately lobed': [0, 1] };

/** Turn a name-keyed table into rows in the param's option order (throws if one is missing). */
function rows(table, options, name) {
  return options.map((o) => {
    if (!table[o]) throw new Error('shapes.js: no ' + name + ' entry for "' + o + '"');
    return table[o];
  });
}

// ---------------------------------------------------------------- output

export const geo = {
  verts: new Float32Array(MAX_VERTS * STRIDE),
  count: 0,
  overflow: false,
  nLeaf: 0,
  leafStart: new Int32Array(MAX_VARIANTS),
  leafCount: new Int32Array(MAX_VARIANTS),
  leafCirc: new Float32Array(MAX_VARIANTS * MAX_CIRC * 3),
  leafNCirc: new Int32Array(MAX_VARIANTS),
  leafPivot: new Float32Array(MAX_VARIANTS * 2),
  leafArea: new Float32Array(MAX_VARIANTS),
  leafBound: new Float32Array(MAX_VARIANTS),
  leafGyr: new Float32Array(MAX_VARIANTS),
  /** Inked area (fills), in leaf units² — what Fill measures. */
  leafInk: new Float32Array(MAX_VARIANTS),
  /** Room a leaf takes when counting how many fit: its ink, or most of its hull if compound. */
  leafFoot: new Float32Array(MAX_VARIANTS),
  /** Area-weighted mean circle radius: how much the gap inflates the footprint. */
  leafRad: new Float32Array(MAX_VARIANTS),
  leafAttach: new Float32Array(MAX_VARIANTS * 3),
  nSprig: 0,
  sprigStart: new Int32Array(MAX_VARIANTS),
  sprigCount: new Int32Array(MAX_VARIANTS),
  sprigCirc: new Float32Array(MAX_VARIANTS * MAX_SPRIG_CIRC * 3),
  sprigNCirc: new Int32Array(MAX_VARIANTS),
  sprigPivot: new Float32Array(MAX_VARIANTS * 2),
  sprigArea: new Float32Array(MAX_VARIANTS),
  sprigBound: new Float32Array(MAX_VARIANTS),
  sprigGyr: new Float32Array(MAX_VARIANTS),
  sprigInk: new Float32Array(MAX_VARIANTS),
  sprigFoot: new Float32Array(MAX_VARIANTS),
  sprigRad: new Float32Array(MAX_VARIANTS),
  // Per placement: leaf variant, mat2 column-major (a, b, c, d), tx, ty, leaf index.
  sprigPlace: new Float32Array(MAX_VARIANTS * MAX_PLACE * 8),
  sprigNPlace: new Int32Array(MAX_VARIANTS),
};

// ---------------------------------------------------------------- small helpers

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function hash1(n) {
  n |= 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
/** Deterministic 0–1 random for (stream, index). */
function rnd(a, b) { return hash1(Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x3c6ef372, 0x165667b1)); }
/** Same, −1…1. */
function rnd2(a, b) { return rnd(a, b) * 2 - 1; }
function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const g0 = hash1(i) * 2 - 1, g1 = hash1(i + 1) * 2 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return 2 * (g0 * f * (1 - u) + g1 * (f - 1) * u);
}

// ---------------------------------------------------------------- vertex buffers
// Staging buffers keep a leaf's layers in draw order: fills, then strokes, then the
// turned-over flap (fill, then strokes). They are copied into geo.verts at the end.

function vbuf(cap) { return { a: new Float32Array(cap * STRIDE), n: 0, cap }; }
const sFill = vbuf(60000), sStroke = vbuf(110000), sFlapFill = vbuf(20000), sFlapStroke = vbuf(30000);

// Current fold line (final leaf coords) for the leaflet being emitted.
let foldOn = false, fnx = 0, fny = 0, fd = 0, foldForce = NaN;
let curSeed = 0;

function foldAt(x, y) {
  if (foldForce === foldForce) return foldForce;
  return foldOn ? fnx * x + fny * y - fd : -1;
}

function vtx(b, x, y, nx, ny, hw, across, along, kind) {
  if (b.n >= b.cap) return;
  const o = b.n * STRIDE, a = b.a;
  a[o] = x; a[o + 1] = y; a[o + 2] = nx; a[o + 3] = ny; a[o + 4] = hw;
  a[o + 5] = across; a[o + 6] = along; a[o + 7] = kind; a[o + 8] = foldAt(x, y); a[o + 9] = curSeed;
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

// ---------------------------------------------------------------- resolved shape knobs

const G = {
  pw: 0.4, W: 0.3, expMul: 1, cord: 0, baseE: 1, asym: 0, apexE: 1, acum: 0, notch: 0,
  pin: 0, palm: 0, lobeDepth: 0, lobes: 5, lobeSharp: 0.5,
  mw: new Float32Array(7), teeth: 20, toothDepth: 0.02,
  vw: new Float32Array(4), veinCount: 8, veinAngle: 0.8, veinCurve: 0.3, veinWeight: 0.004, midribWeight: 0.008,
  cw: new Float32Array(5), leaflets: 7, leafletAngle: 1,
  bend: 0, sCurve: 0, petLen: 0.15, petFlat: 0, wing: 0, stipules: 0,
  hair: 0, turnovers: 0, outlineW: 0.005, wobble: 0.004, variety: 0.3,
};
// Per-variant jittered copy of the knobs that vary.
const J = { W: 0, lobeDepth: 0, toothDepth: 0, bend: 0, sCurve: 0, veinCount: 8, leafletAngle: 1, petLen: 0, pw: 0.4, veinAngle: 0.8 };

// Option rows, resolved against the params' option lists on first use.
let tOutline = null, tBase = null, tApex = null, tLobing = null;

function resolveKnobs(P, B) {
  if (!tOutline) {
    tOutline = rows(OUTLINE, P.outline.options, 'outline');
    tBase = rows(BASE, P.base.options, 'base');
    tApex = rows(APEX, P.apex.options, 'apex');
    tLobing = rows(LOBING, P.lobing.options, 'lobing');
  }
  let pw = 0, W = 0, em = 0, cord = 0;
  for (let i = 0; i < tOutline.length; i++) {
    const w = B.outline[i], r = tOutline[i];
    pw += w * r[0]; W += w * r[1]; em += w * r[2]; cord += w * r[3];
  }
  let be = 0, asym = 0, ae = 0, acum = 0, notch = 0;
  for (let i = 0; i < tBase.length; i++) { const w = B.base[i], r = tBase[i]; be += w * r[0]; cord += w * r[1]; asym += w * r[2]; }
  for (let i = 0; i < tApex.length; i++) { const w = B.apex[i], r = tApex[i]; ae += w * r[0]; acum += w * r[1]; notch += w * r[2]; }
  let pin = 0, palm = 0;
  for (let i = 0; i < tLobing.length; i++) { pin += B.lobing[i] * tLobing[i][0]; palm += B.lobing[i] * tLobing[i][1]; }
  G.pw = pw; G.W = W * P.width.value; G.expMul = em; G.cord = Math.min(cord, 0.9);
  G.baseE = be; G.asym = asym; G.apexE = ae; G.acum = acum; G.notch = notch;
  G.pin = pin; G.palm = palm; G.lobeDepth = P.lobeDepth.value; G.lobes = P.lobes.value; G.lobeSharp = P.lobeSharpness.value;
  for (let i = 0; i < 7; i++) G.mw[i] = B.margin[i];
  G.teeth = P.teeth.value; G.toothDepth = P.toothDepth.value;
  for (let i = 0; i < 4; i++) G.vw[i] = B.venation[i];
  G.veinCount = P.veinCount.value; G.veinAngle = P.veinAngle.value * DEG; G.veinCurve = P.veinCurve.value;
  G.veinWeight = P.veinWeight.value; G.midribWeight = P.midribWeight.value;
  for (let i = 0; i < 5; i++) G.cw[i] = B.compound[i];
  G.leaflets = P.leaflets.value; G.leafletAngle = P.leafletAngle.value * DEG;
  G.bend = P.bend.value; G.sCurve = P.sCurve.value;
  G.petLen = P.petioleLength.value; G.petFlat = P.petioleFlat.value; G.wing = P.petioleWing.value; G.stipules = P.stipules.value;
  G.hair = P.hairiness.value; G.turnovers = P.turnovers.value;
  G.outlineW = P.outlineWeight.value; G.wobble = P.wobble.value; G.variety = P.variety.value;
}

function jitter(vs) {
  const v = G.variety;
  J.W = G.W * (1 + v * 0.3 * rnd2(vs, 1));
  J.pw = clamp(G.pw + v * 0.06 * rnd2(vs, 2), 0.04, 0.96);
  J.lobeDepth = clamp(G.lobeDepth * (1 + v * 0.35 * rnd2(vs, 3)), 0, 1);
  J.toothDepth = G.toothDepth * (1 + v * 0.4 * rnd2(vs, 4));
  J.bend = G.bend + v * 0.7 * rnd2(vs, 5);
  J.sCurve = G.sCurve + v * 0.6 * rnd2(vs, 6);
  J.veinCount = Math.max(2, Math.round(G.veinCount + v * 2.2 * rnd2(vs, 7)));
  J.leafletAngle = G.leafletAngle + v * 0.25 * rnd2(vs, 8);
  J.petLen = G.petLen * (1 + v * 0.3 * rnd2(vs, 9));
  J.veinAngle = clamp(G.veinAngle + v * 0.15 * rnd2(vs, 10), 0.2, 1.5);
}

// ---------------------------------------------------------------- compound layouts
// Every layout fills the same slots, so a morph moves leaflets rather than swapping them:
// slot 0 is the terminal leaflet, then pairs from the tip back (upper, lower). Bipinnate
// puts each pinna's terminal leaflet in those slots and its side leaflets after them.
// Slot fields: x, y, angle, scale, stalk length.

const MAX_SLOTS = 80, SF = 5;
const LAYOUTS = [0, 1, 2, 3, 4].map(() => new Float32Array(MAX_SLOTS * SF));
const slots = new Float32Array(MAX_SLOTS * SF);
// Bipinnate pinna rachises: x0, y0, x1, y1 per pinna.
const pinnaSeg = new Float32Array(16 * 4);
let pinnaN = 0, rachisLen = 0;
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
      setSlot(L, n + p * 4 + q * 2, x, y, pa + ang * 0.9, sc, 0);
      setSlot(L, n + p * 4 + q * 2 + 1, x, y, pa - ang * 0.9, sc, 0);
    }
  }
  RACHIS[2] = rl / tot;
}
function layoutPalmate(L, n) {
  L.fill(0);
  const pairs = Math.floor(n / 2), term = n % 2;
  const step = Math.min(0.75, 4.7 / Math.max(n, 2));
  const ll = 0.78;
  if (term) setSlot(L, 0, 0.02, 0, 0, ll, 0.04);
  for (let k = 0; k < pairs; k++) {
    const a = step * (k + (term ? 1 : 0.5));
    const s = ll * (1 - 0.42 * Math.pow((k + 1) / (pairs + 0.5), 1.4));
    setSlot(L, 1 + 2 * k, 0.02, 0, a, s, 0.04);
    setSlot(L, 2 + 2 * k, 0.02, 0, -a, s, 0.04);
  }
  RACHIS[3] = 0;
}
function layoutTrifoliate(L, ang) {
  L.fill(0);
  setSlot(L, 0, 0.14, 0, 0, 0.6, 0.07);
  setSlot(L, 1, 0.02, 0, ang, 0.5, 0.03);
  setSlot(L, 2, 0.02, 0, -ang, 0.5, 0.03);
  RACHIS[4] = 0.14;
}

function blendLayouts() {
  const n = Math.round(G.leaflets), ang = J.leafletAngle;
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

// ---------------------------------------------------------------- blade outline

const NMAX = 140;
const LX = [new Float32Array(NMAX + 1), new Float32Array(NMAX + 1)]; // lobed outline (blade coords)
const LY = [new Float32Array(NMAX + 1), new Float32Array(NMAX + 1)];
const FX = [new Float32Array(NMAX + 1), new Float32Array(NMAX + 1)]; // with margin
const FY = [new Float32Array(NMAX + 1), new Float32Array(NMAX + 1)];
const AX = new Float32Array(NMAX + 1); // midrib anchor for the fill
const ARC = new Float32Array(NMAX + 1);
let N = 64;
let stip = false; // building a stipule: plain ovate, no lobes, teeth or side veins

// Final-coords scratch for strokes.
const PMAX = 2400;
const PX = new Float32Array(PMAX), PY = new Float32Array(PMAX), PW = new Float32Array(PMAX);

function sawTooth(f) { return f < 0.78 ? f / 0.78 : (1 - f) / 0.22; }
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
  const dTh = Math.min(1.15, 4.0 / (nl - 1 + 1e-3)), off = nl % 2 ? 0 : 0.5;
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
      // Fill anchors sit on the midrib, never behind where the blade meets it (the sinus).
      const sx = Math.max(0, Math.min(LX[0][0], lx[0]));
      for (let i = 0; i <= N; i++) AX[i] = clamp(AX[i], sx, 1);
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
  let along = 0;
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
    const seg = Math.hypot(PX[j] - PX[i], PY[j] - PY[i]);
    const a0 = along, a1 = along + seg;
    vtx(b, PX[i], PY[i], n0x, n0y, PW[i], -1, a0, kind);
    vtx(b, PX[i], PY[i], n0x, n0y, PW[i], 1, a0, kind);
    vtx(b, PX[j], PY[j], n1x, n1y, PW[j], 1, a1, kind);
    vtx(b, PX[i], PY[i], n0x, n0y, PW[i], -1, a0, kind);
    vtx(b, PX[j], PY[j], n1x, n1y, PW[j], 1, a1, kind);
    vtx(b, PX[j], PY[j], n1x, n1y, PW[j], -1, a1, kind);
    along = a1;
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
// Segments per vein, scaled with the outline's resolution so tiny leaflets stay cheap.
let VS = 12;

function emitBlade(ls) {
  bladeOutline(ls);
  // Fill: quads from the midrib anchor out to the outline, per side.
  for (let side = 0; side < 2; side++) {
    const sg = side === 0 ? 1 : -1, fx = FX[side], fy = FY[side];
    for (let i = 0; i < N; i++) {
      toFinal(AX[i], 0); const ax0 = TX, ay0 = TY;
      toFinal(AX[i + 1], 0); const ax1 = TX, ay1 = TY;
      toFinal(fx[i], fy[i]); const ox0 = TX, oy0 = TY;
      toFinal(fx[i + 1], fy[i + 1]); const ox1 = TX, oy1 = TY;
      const u0 = i / N, u1 = (i + 1) / N;
      vtx(sFill, ax0, ay0, 0, 0, 0, 0, u0, KIND_FILL);
      vtx(sFill, ox0, oy0, 0, 0, 0, sg, u0, KIND_FILL);
      vtx(sFill, ox1, oy1, 0, 0, 0, sg, u1, KIND_FILL);
      vtx(sFill, ax0, ay0, 0, 0, 0, 0, u0, KIND_FILL);
      vtx(sFill, ox1, oy1, 0, 0, 0, sg, u1, KIND_FILL);
      vtx(sFill, ax1, ay1, 0, 0, 0, 0, u1, KIND_FILL);
    }
  }

  const ow = G.outlineW;
  // Outline: up one side, back down the other.
  let n = 0;
  for (let i = 0; i <= N; i++) n = push(n, FX[0][i], FY[0][i], inkW(ow, i / N, ls));
  for (let i = N - 1; i >= 1; i--) n = push(n, FX[1][i], FY[1][i], inkW(ow, 2 - i / N, ls));
  emitStroke(sStroke, n, KIND_OUTLINE, true);
  outlineN = n;
  for (let i = 0; i < n; i++) { OLX[i] = PX[i]; OLY[i] = PY[i]; }

  // Midrib, from where the blade meets it; in a cordate notch the stalk runs up to there.
  const tipX = LX[0][N], baseX = Math.max(0, LX[0][0]);
  if (baseX > 0.01 && !stip) {
    n = 0;
    for (let i = 0; i <= 6; i++) n = push(n, baseX * i / 6, 0, inkW(G.midribWeight * midribScale * 0.9, i / 6, ls + 5));
    emitStroke(sStroke, n, KIND_STEM, false);
  }
  const mw = G.midribWeight * midribScale;
  n = 0;
  const ms = Math.max(6, Math.round(N / 5));
  for (let i = 0; i <= ms; i++) {
    const t = i / ms, x = baseX + (tipX * 0.97 - baseX) * t;
    n = push(n, x, G.wobble * 0.5 * noise1(t * 5 + ls), inkW(mw * (1 - 0.82 * t), t, ls + 3));
  }
  emitStroke(sStroke, n, KIND_RIB, false);
  if (stip) return;

  const vw = G.vw, vwt = G.veinWeight * midribScale;
  const vc = J.veinCount;
  const tanA = Math.tan(J.veinAngle);
  // Pinnate secondaries: off the midrib, curving forward to the margin (or into a lobe).
  if (vw[0] > 0.02) {
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      for (let k = 0; k < vc; k++) {
        const x0 = 0.05 + (k + 0.5 + 0.25 * rnd2(ls * 7 + side, k)) / vc * 0.8;
        edgeAt(side, x0);
        let ut = clamp(x0 + Math.abs(EY) / tanA * 0.9, 0.02, 0.97);
        if (G.pin > 0) {
          const ph = (ut - 0.05) / 0.92 * G.lobes;
          const pk = (Math.round(ph - 0.5) + 0.5) / G.lobes * 0.92 + 0.05;
          ut = lerp(ut, clamp(pk, 0.05, 0.95), G.pin);
        }
        edgeAt(side, ut);
        const ex = lerp(ut, EX, 0.9), ey = EY * 0.9;
        // Control point: veins leave the midrib steeply and sweep toward the tip (curve > 0),
        // or run along the midrib before turning out (curve < 0).
        const cv = clamp(G.veinCurve, -1, 1);
        const px1 = x0 + (ex - x0) * (0.5 - 0.4 * cv), py1 = ey * (0.5 + 0.4 * cv);
        n = 0;
        for (let s = 0; s <= VS; s++) {
          const t = s / VS, it = 1 - t;
          const x = it * it * x0 + 2 * it * t * px1 + t * t * ex;
          const y = it * it * 0 + 2 * it * t * py1 + t * t * ey;
          n = push(n, x, y + G.wobble * 0.4 * noise1(t * 4 + k * 3 + ls), inkW(vwt * vw[0] * (1 - 0.8 * t), t, ls + k + side * 50));
        }
        emitStroke(sStroke, n, KIND_VEIN, false);
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
        const x = lerp(0.02, ex, t), y = lerp(0, ey, t) + Math.sin(Math.PI * t) * 0.03 * Math.sign(th) * G.veinCurve;
        n = push(n, x, y, inkW(vwt * 1.25 * vw[1] * (1 - 0.75 * t), t, ls + j));
      }
      emitStroke(sStroke, n, KIND_VEIN, false);
    }
  }
  // Parallel: lengthways veins following the outline.
  if (vw[2] > 0.02) {
    const pv = Math.min(vc, 9);
    for (let side = 0; side < 2; side++) {
      for (let k = 1; k <= pv; k++) {
        const fr = k / (pv + 1);
        n = 0;
        for (let i = 0; i <= N; i += Math.max(1, Math.floor(N / (VS * 2)))) {
          const x = lerp(AX[i], LX[side][i], fr), y = LY[side][i] * fr;
          n = push(n, x, y, inkW(vwt * 0.6 * vw[2], i / N, ls + k));
        }
        emitStroke(sStroke, n, KIND_VEIN, false);
      }
    }
  }
  // Arcuate: veins that arc forward along the margin toward the tip.
  if (vw[3] > 0.02) {
    const av = Math.max(2, Math.round(vc * 0.6));
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < av; k++) {
        const x0 = 0.07 + (k + 0.3) / av * 0.62;
        n = 0;
        for (let s = 0; s <= VS; s++) {
          const t = s / VS;
          const u = x0 + t * (0.97 - x0) * 0.82;
          const fr = 0.86 * Math.pow(Math.sin(t * Math.PI / 2), 0.55);
          edgeAt(side, u);
          n = push(n, lerp(u, EX, fr), EY * fr, inkW(vwt * vw[3] * (1 - 0.7 * t), t, ls + k));
        }
        emitStroke(sStroke, n, KIND_VEIN, false);
      }
    }
  }
  // Hairs: short ticks out from the margin, leaning toward the tip.
  if (G.hair > 0.01) {
    const step = Math.max(1, Math.round(N / (G.hair * 60)));
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      for (let i = 2; i < N - 1; i += step) {
        const tx = FX[side][i + 1] - FX[side][i - 1], ty = FY[side][i + 1] - FY[side][i - 1];
        const a = Math.atan2(ty, tx) + sg * (1.0 + 0.4 * rnd2(ls + i, side));
        const len = 0.012 * (0.5 + rnd(ls + i, side + 9)) * (0.5 + G.hair);
        n = 0;
        n = push(n, FX[side][i], FY[side][i], 0.001);
        n = push(n, FX[side][i] + Math.cos(a) * len, FY[side][i] + Math.sin(a) * len, 0.0004);
        emitStroke(sStroke, n, KIND_HAIR, false);
      }
    }
  }
}

// Final-coords outline of the last blade, for finding the fold crease.
const OLX = new Float32Array(PMAX), OLY = new Float32Array(PMAX);
const WAX = new Float32Array(13), WAY = new Float32Array(13);
let outlineN = 0;

/** Copy a range of staged vertices into a flap buffer, mirrored across the fold line. */
function copyFlap(src, from, to, dst) {
  for (let v = from; v < to && dst.n < dst.cap; v++) {
    const o = v * STRIDE, d = dst.n * STRIDE, a = src.a, b = dst.a;
    const s = a[o + 8];
    const x = a[o], y = a[o + 1], nx = a[o + 2], ny = a[o + 3];
    const nd = nx * fnx + ny * fny;
    b[d] = x - 2 * s * fnx; b[d + 1] = y - 2 * s * fny;
    b[d + 2] = nx - 2 * nd * fnx; b[d + 3] = ny - 2 * nd * fny;
    b[d + 4] = a[o + 4]; b[d + 5] = a[o + 5]; b[d + 6] = a[o + 6];
    b[d + 7] = a[o + 7] + FLAP; b[d + 8] = s; b[d + 9] = a[o + 9];
    dst.n++;
  }
}

function appendBuf(b) {
  const room = MAX_VERTS - geo.count;
  const n = Math.min(b.n, room);
  if (n < b.n) geo.overflow = true;
  const src = b.a, dst = geo.verts, o = geo.count * STRIDE, m = n * STRIDE;
  for (let i = 0; i < m; i++) dst[o + i] = src[i];
  geo.count += n;
}

// ---------------------------------------------------------------- collision circles
// A leaf's footprint for packing: up to MAX_CIRC circles inscribed in its shape, chosen
// biggest first until they cover the outline. Inscribed circles hug the shape (a covering
// hull would hold neighbours off at the narrow ends), and the Gap keeps the clearance.

const NB = 200, NCAND = 160;
const BPX = new Float32Array(NB), BPY = new Float32Array(NB), bCov = new Uint8Array(NB);
const CDX = new Float32Array(NCAND), CDY = new Float32Array(NCAND), CDR = new Float32Array(NCAND);

function fitCircles(start, count, out, oo, pad, maxC, hull) {
  const a = geo.verts;
  // Boundary points: fill vertices on the outline. Candidates: along each quad's spoke from
  // the midrib anchor toward the outline. Fill quads are 6 vertices: anchor, outline, …
  let nFillQuads = 0;
  for (let v = start; v + 5 < start + count; v += 6) if ((a[v * STRIDE + 7] & 7) === KIND_FILL) nFillQuads++;
  if (nFillQuads === 0) { out[oo] = 0; out[oo + 1] = 0; out[oo + 2] = 0.1; return 1; }
  let qStride = Math.max(1, Math.floor(nFillQuads / NB));
  let nb = 0, nc = 0, qi = 0;
  const cStride = Math.max(1, Math.ceil(nFillQuads * 3 / NCAND));
  let ci = 0;
  for (let v = start; v + 5 < start + count; v += 6) {
    const o = v * STRIDE;
    if ((a[o + 7] & 7) !== KIND_FILL) continue;
    const ax = a[o], ay = a[o + 1], ox = a[o + STRIDE], oy = a[o + STRIDE + 1];
    if (qi++ % qStride === 0 && nb < NB) { BPX[nb] = ox; BPY[nb] = oy; nb++; }
    for (let k = 0; k < 3; k++) {
      if (ci++ % cStride !== 0 || nc >= NCAND) continue;
      const t = k * 0.3;
      CDX[nc] = ax + (ox - ax) * t; CDY[nc] = ay + (oy - ay) * t; nc++;
    }
  }
  if (hull) return fitHull(out, oo, pad, maxC, nb);
  // Inscribed radius: distance to the nearest boundary point.
  for (let c = 0; c < nc; c++) {
    let d2 = 1e9;
    for (let b = 0; b < nb; b++) { const dx = BPX[b] - CDX[c], dy = BPY[b] - CDY[c], d = dx * dx + dy * dy; if (d < d2) d2 = d; }
    CDR[c] = Math.sqrt(d2);
  }
  // Greedy by gain: each round takes the circle covering the most still-uncovered outline,
  // until nearly all of it is covered (the last few points are tooth tips).
  bCov.fill(0, 0, nb);
  const tol = 0.04;
  let n = 0, left = nb;
  while (n < maxC && left > nb * 0.03) {
    let best = -1, bestGain = 1;
    for (let c = 0; c < nc; c++) {
      const r = CDR[c] + tol, r2 = r * r;
      let gain = 0;
      for (let b = 0; b < nb; b++) {
        if (bCov[b]) continue;
        const dx = BPX[b] - CDX[c], dy = BPY[b] - CDY[c];
        if (dx * dx + dy * dy < r2) gain++;
      }
      if (gain > bestGain) { bestGain = gain; best = c; }
    }
    if (best < 0) break;
    const r = CDR[best] + tol, r2 = r * r;
    for (let b = 0; b < nb; b++) {
      const dx = BPX[b] - CDX[best], dy = BPY[b] - CDY[best];
      if (!bCov[b] && dx * dx + dy * dy < r2) { bCov[b] = 1; left--; }
    }
    out[oo + n * 3] = CDX[best]; out[oo + n * 3 + 1] = CDY[best]; out[oo + n * 3 + 2] = CDR[best] + pad;
    n++;
  }
  return Math.max(1, n);
}

/**
 * Compound leaves: a covering hull instead. Cells along and across the leaf's main axis, one
 * circle per occupied cell, sized to cover its outline points. Gaps between leaflets are
 * too small to be worth filling with another leaf anyway.
 */
function fitHull(out, oo, pad, maxC, nb) {
  let mx = 0, my = 0;
  for (let i = 0; i < nb; i++) { mx += BPX[i]; my += BPY[i]; }
  mx /= nb; my /= nb;
  let cxx = 0, cyy = 0, cxy = 0;
  for (let i = 0; i < nb; i++) { const dx = BPX[i] - mx, dy = BPY[i] - my; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy), c = Math.cos(th), s = Math.sin(th);
  let p0 = 1e9, p1 = -1e9, q0 = 1e9, q1 = -1e9;
  for (let i = 0; i < nb; i++) {
    const dx = BPX[i] - mx, dy = BPY[i] - my, p = dx * c + dy * s, q = -dx * s + dy * c;
    if (p < p0) p0 = p; if (p > p1) p1 = p; if (q < q0) q0 = q; if (q > q1) q1 = q;
  }
  const cells = Math.min(maxC, 12);
  const nq = clamp(Math.round(Math.sqrt(cells / ((p1 - p0) / Math.max(q1 - q0, 1e-3)))), 1, 4);
  const np = clamp(Math.floor(cells / nq), 1, cells);
  const bw = (p1 - p0) / np + 1e-6, bh = (q1 - q0) / nq + 1e-6;
  for (let b = 0; b < np * nq; b++) { const o = b * 6; CS[o] = 1e9; CS[o + 1] = -1e9; CS[o + 2] = 1e9; CS[o + 3] = -1e9; CS[o + 5] = 0; }
  for (let i = 0; i < nb; i++) {
    const dx = BPX[i] - mx, dy = BPY[i] - my, p = dx * c + dy * s, q = -dx * s + dy * c;
    const o = cellOf(p, q, p0, q0, bw, bh, np, nq) * 6;
    if (p < CS[o]) CS[o] = p; if (p > CS[o + 1]) CS[o + 1] = p;
    if (q < CS[o + 2]) CS[o + 2] = q; if (q > CS[o + 3]) CS[o + 3] = q;
  }
  for (let i = 0; i < nb; i++) {
    const dx = BPX[i] - mx, dy = BPY[i] - my, p = dx * c + dy * s, q = -dx * s + dy * c;
    const o = cellOf(p, q, p0, q0, bw, bh, np, nq) * 6;
    const d = Math.hypot(p - (CS[o] + CS[o + 1]) / 2, q - (CS[o + 2] + CS[o + 3]) / 2);
    if (d > CS[o + 5]) CS[o + 5] = d;
  }
  let n = 0;
  for (let b = 0; b < np * nq; b++) {
    const o = b * 6;
    if (CS[o] > CS[o + 1]) continue;
    const p = (CS[o] + CS[o + 1]) / 2, q = (CS[o + 2] + CS[o + 3]) / 2;
    out[oo + n * 3] = mx + p * c - q * s;
    out[oo + n * 3 + 1] = my + p * s + q * c;
    out[oo + n * 3 + 2] = CS[o + 5] + pad;
    n++;
  }
  return Math.max(1, n);
}
function cellOf(p, q, p0, q0, bw, bh, np, nq) {
  const a = Math.min(np - 1, Math.max(0, Math.floor((p - p0) / bw)));
  const b = Math.min(nq - 1, Math.max(0, Math.floor((q - q0) / bh)));
  return b * np + a;
}
const CS = new Float32Array(16 * 6);


/** Pivot (area-weighted centre), bound radius, union area and radius of gyration² of circles. */
let cPivX = 0, cPivY = 0, cBound = 0, cArea = 0, cGyr = 0, cRad = 0;
function circleStats(arr, o, nc) {
  let sw = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < nc; i++) {
    const x = arr[o + i * 3], y = arr[o + i * 3 + 1], r = arr[o + i * 3 + 2], w = r * r;
    sw += w; sx += x * w; sy += y * w;
    if (x - r < x0) x0 = x - r; if (x + r > x1) x1 = x + r; if (y - r < y0) y0 = y - r; if (y + r > y1) y1 = y + r;
  }
  cPivX = sx / sw; cPivY = sy / sw;
  let r3 = 0;
  for (let i = 0; i < nc; i++) { const r = arr[o + i * 3 + 2]; r3 += r * r * r; }
  cRad = r3 / sw;
  cBound = 0; cGyr = 0;
  for (let i = 0; i < nc; i++) {
    const x = arr[o + i * 3] - cPivX, y = arr[o + i * 3 + 1] - cPivY, r = arr[o + i * 3 + 2];
    const d = Math.hypot(x, y) + r;
    if (d > cBound) cBound = d;
    cGyr += r * r * (x * x + y * y + r * r * 0.5);
  }
  cGyr /= sw;
  const G2 = 28;
  let hit = 0;
  for (let gy = 0; gy < G2; gy++) {
    for (let gx = 0; gx < G2; gx++) {
      const px = x0 + (gx + 0.5) / G2 * (x1 - x0), py = y0 + (gy + 0.5) / G2 * (y1 - y0);
      for (let i = 0; i < nc; i++) {
        const dx = px - arr[o + i * 3], dy = py - arr[o + i * 3 + 1], r = arr[o + i * 3 + 2];
        if (dx * dx + dy * dy < r * r) { hit++; break; }
      }
    }
  }
  cArea = hit / (G2 * G2) * (x1 - x0) * (y1 - y0);
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
function leafLine(x0, y0, x1, y1, w0, w1, kind, ls) {
  bladeMode = false;
  let n = 0;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    toFinal(lerp(x0, x1, t), lerp(y0, y1, t));
    PX[n] = TX; PY[n] = TY; PW[n] = inkW(lerp(w0, w1, t), t, ls); n++;
  }
  emitStroke(sStroke, n, kind, false);
  bladeMode = true;
}

function buildLeafVariant(v, seed) {
  const vs = seed * 977 + v * 131 + 17;
  jitter(vs);
  blendLayouts();
  sFill.n = sStroke.n = sFlapFill.n = sFlapStroke.n = 0;
  const wS = G.cw[0];
  // Simple leaves bend as a whole; compound leaves bend along the rachis, leaflets a little.
  buildBend(leafBend, J.bend * lerp(0.6, 1, wS), J.sCurve * lerp(0.7, 1, wS));
  midribScale = lerp(0.6, 1, wS);
  // Count active leaflets to share the vertex budget.
  let active = 0;
  for (let j = 0; j < MAX_SLOTS; j++) if (slots[j * SF + 3] > 0.004) active++;
  const budget = Math.min(24000, MAX_VERTS / Math.max(1, geo.nLeaf + 1));
  // Vertices per leaflet ≈ 6 × (4N outline+fill + N/5 midrib + 2·veins·VS) — share the budget.
  const veinsPer = 2 * Math.max(2, J.veinCount);
  N = clamp(Math.floor(budget / (Math.max(1, active) * 6 * (4.2 + veinsPer * 0.1))), 10, NMAX);
  N -= N % 2;
  VS = clamp(Math.round(N / 10), 3, 12);
  const turned = rnd(vs, 99) < G.turnovers;
  curSeed = rnd(vs, 5);
  foldOn = false; foldForce = NaN;

  // Stalk: petiole (with optional wing), rachis, pinna rachises, leaflet stalks.
  const pl = J.petLen, mw = G.midribWeight;
  const stalkW = mw * (1 + 2.2 * G.petFlat);
  if (pl > 0.002) leafLine(-pl, 0, 0, 0, stalkW * 1.1, stalkW * 0.9, KIND_STEM, vs);
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
    leafLine(slots[o], slots[o + 1], slots[o] + c * slots[o + 4], slots[o + 1] + s * slots[o + 4], mw * 0.5, mw * 0.4, KIND_STEM, vs + j);
  }
  if (G.wing > 0.01 && pl > 0.01) {
    // Wing: a leafy strip down each side of the petiole, widening toward the blade.
    bladeMode = false;
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, x = lerp(-pl, 0, t), h = G.wing * 0.075 * Math.pow(t, 0.8) * sg;
        toFinal(x, 0); WAX[i] = TX; WAY[i] = TY;
        toFinal(x, h); PX[i] = TX; PY[i] = TY; PW[i] = inkW(G.outlineW, t, vs + side);
      }
      for (let i = 0; i < 12; i++) {
        const t0 = i / 12, t1 = (i + 1) / 12;
        vtx(sFill, WAX[i], WAY[i], 0, 0, 0, 0, t0, KIND_FILL);
        vtx(sFill, PX[i], PY[i], 0, 0, 0, sg, t0, KIND_FILL);
        vtx(sFill, PX[i + 1], PY[i + 1], 0, 0, 0, sg, t1, KIND_FILL);
        vtx(sFill, WAX[i], WAY[i], 0, 0, 0, 0, t0, KIND_FILL);
        vtx(sFill, PX[i + 1], PY[i + 1], 0, 0, 0, sg, t1, KIND_FILL);
        vtx(sFill, WAX[i + 1], WAY[i + 1], 0, 0, 0, 0, t1, KIND_FILL);
      }
      emitStroke(sStroke, 13, KIND_OUTLINE, false);
    }
    bladeMode = true;
  }
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
    }
    N = keepN;
    stip = false;
  }

  // Leaflets.
  for (let j = 0; j < MAX_SLOTS; j++) {
    const o = j * SF;
    if (slots[o + 3] <= 0.004) continue;
    const ls = vs * 31 + j * 7;
    // Leaflets on the lower side mirror, so they curve the same way relative to the axis.
    const mirror = slots[o + 2] < -0.01 ? -1 : 1;
    buildBend(bladeBend, (1 - wS) * J.bend * 0.5 * (1 + 0.5 * rnd2(ls, 1)), (1 - wS) * J.sCurve * 0.3);
    placeLeaflet(o, mirror);
    curSeed = rnd(ls, 2);
    const fill0 = sFill.n, str0 = sStroke.n;
    if (turned && j === 0) {
      // Fold line: across the blade toward the tip, tilted; in final coords.
      const uf = 0.58 + 0.2 * rnd(vs, 61), tilt = 0.55 * rnd2(vs, 62);
      toFinal(uf, 0); const fx = TX, fy = TY;
      toFinal(uf + 0.01, 0);
      let tx = TX - fx, ty = TY - fy;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const c = Math.cos(tilt), s = Math.sin(tilt);
      fnx = tx * c - ty * s; fny = tx * s + ty * c;
      fd = fnx * fx + fny * fy;
      foldOn = true;
    }
    emitBlade(ls);
    if (foldOn) {
      copyFlap(sFill, fill0, sFill.n, sFlapFill);
      copyFlap(sStroke, str0, sStroke.n, sFlapStroke);
      // Crease: where the fold line crosses the outline.
      let found = 0, cx0 = 0, cy0 = 0, cx1 = 0, cy1 = 0;
      for (let i = 0; i < outlineN && found < 2; i++) {
        const k = (i + 1) % outlineN;
        const s0 = fnx * OLX[i] + fny * OLY[i] - fd, s1 = fnx * OLX[k] + fny * OLY[k] - fd;
        if ((s0 < 0) !== (s1 < 0)) {
          const t = s0 / (s0 - s1);
          const x = lerp(OLX[i], OLX[k], t), y = lerp(OLY[i], OLY[k], t);
          if (found === 0) { cx0 = x; cy0 = y; } else { cx1 = x; cy1 = y; }
          found++;
        }
      }
      if (found === 2) {
        foldForce = 0.0005;
        let n = 0;
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          PX[n] = lerp(cx0, cx1, t); PY[n] = lerp(cy0, cy1, t); PW[n] = inkW(G.outlineW * 0.85, t, ls); n++;
        }
        emitStroke(sFlapStroke, n, KIND_CREASE + FLAP, false);
        foldForce = NaN;
      }
      foldOn = false;
    }
  }

  // Inked area: the front fills' triangles.
  let ink = 0;
  for (let t = 0; t + 2 < sFill.n; t += 3) {
    const a = sFill.a, o = t * STRIDE;
    ink += Math.abs((a[o + STRIDE] - a[o]) * (a[o + 2 * STRIDE + 1] - a[o + 1]) - (a[o + 2 * STRIDE] - a[o]) * (a[o + STRIDE + 1] - a[o + 1])) / 2;
  }
  geo.leafInk[v] = ink;

  geo.leafStart[v] = geo.count;
  appendBuf(sFill); appendBuf(sStroke); appendBuf(sFlapFill); appendBuf(sFlapStroke);
  geo.leafCount[v] = geo.count - geo.leafStart[v];

  // Attach point: the petiole's base, and the direction the leaf grows from it.
  bladeMode = false;
  toFinal(-pl, 0); const ax = TX, ay = TY;
  toFinal(-pl + 0.01, 0);
  geo.leafAttach[v * 3] = ax; geo.leafAttach[v * 3 + 1] = ay;
  geo.leafAttach[v * 3 + 2] = Math.atan2(TY - ay, TX - ax);
  bladeMode = true;

  const co = v * MAX_CIRC * 3;
  // The blade gets inscribed circles; the petiole a chain of small ones.
  const nPet = pl > 0.03 ? Math.min(4, Math.ceil(pl / 0.12)) : 0;
  let nc = fitCircles(geo.leafStart[v], geo.leafCount[v], geo.leafCirc, co, G.outlineW, MAX_CIRC - nPet, wS < 0.5);
  bladeMode = false;
  for (let k = 0; k < nPet; k++) {
    toFinal(-pl * (k + 0.5) / nPet, 0);
    geo.leafCirc[co + nc * 3] = TX; geo.leafCirc[co + nc * 3 + 1] = TY;
    geo.leafCirc[co + nc * 3 + 2] = Math.max(pl / nPet * 0.55, stalkW + 0.005);
    nc++;
  }
  bladeMode = true;
  geo.leafNCirc[v] = nc;
  circleStats(geo.leafCirc, co, nc);
  geo.leafPivot[v * 2] = cPivX; geo.leafPivot[v * 2 + 1] = cPivY;
  geo.leafBound[v] = cBound; geo.leafArea[v] = cArea; geo.leafGyr[v] = cGyr;
  geo.leafFoot[v] = Math.max(geo.leafInk[v], cArea * 0.8);
  geo.leafRad[v] = cRad;
}

// ---------------------------------------------------------------- sprigs

const STEM_MAX = 400;
const SX = new Float32Array(STEM_MAX), SY = new Float32Array(STEM_MAX), SPH = new Float32Array(STEM_MAX), SS = new Float32Array(STEM_MAX);
const NODE_S = new Float32Array(16);

function stemAt(s, n) {
  // Interpolate stem sample at arc length s.
  for (let i = 1; i < n; i++) {
    if (SS[i] >= s || i === n - 1) {
      const t = clamp((s - SS[i - 1]) / Math.max(SS[i] - SS[i - 1], 1e-6), 0, 1);
      EX = lerp(SX[i - 1], SX[i], t); EY = lerp(SY[i - 1], SY[i], t);
      return lerp(SPH[i - 1], SPH[i], t);
    }
  }
  EX = SX[0]; EY = SY[0];
  return SPH[0];
}

function buildSprigVariant(j, P, seed, arrangement) {
  const ss = seed * 1931 + j * 211 + 5;
  const v = G.variety;
  const nodes = Math.round(P.nodes.value);
  const inter = P.internode.value, taper = P.internodeTaper.value;
  // Node positions along the stem.
  let s = P.bareStem.value * (1 + 0.2 * v * rnd2(ss, 1));
  for (let i = 0; i < nodes; i++) {
    NODE_S[i] = s;
    s += inter * (1 - taper * i / Math.max(1, nodes - 1)) * (1 + 0.2 * v * rnd2(ss, 10 + i));
  }
  const terminal = P.terminal.value;
  const len = NODE_S[nodes - 1] + (terminal === 'Bare' ? inter * 0.35 : inter * 0.12);
  // Stem centre line: steady curve + droop toward the tip + a kink at each node.
  const curve = P.stemCurve.value + v * 0.4 * rnd2(ss, 2), droop = P.stemDroop.value * (1 + 0.3 * v * rnd2(ss, 3));
  const zig = P.zigzag.value * DEG;
  const ds = Math.max(0.01, len / (STEM_MAX - 2));
  let x = 0, y = 0, ph = 0, ni = 0, n = 0;
  for (let k = 0; k * ds <= len && n < STEM_MAX - 1; k++) {
    const sk = k * ds;
    while (ni < nodes && NODE_S[ni] <= sk) { ph += zig * (ni % 2 ? 1 : -1); ni++; }
    const f = sk / len;
    const phk = ph + curve * f + droop * f * f * 1.4;
    SX[n] = x; SY[n] = y; SPH[n] = phk; SS[n] = sk; n++;
    x += Math.cos(phk) * ds; y += Math.sin(phk) * ds;
  }
  SX[n] = x; SY[n] = y; SPH[n] = SPH[n - 1]; SS[n] = n * ds; n++;
  const stemN = n;

  // Stem mesh.
  sFill.n = sStroke.n = 0;
  curSeed = rnd(ss, 4);
  foldOn = false;
  const sw = P.stemWidth.value, st = P.stemTaper.value;
  let m = 0;
  const every = Math.max(1, Math.floor(stemN / 120));
  for (let i = 0; i < stemN; i += every) {
    const f = SS[i] / len;
    PX[m] = SX[i] + G.wobble * 0.3 * noise1(f * 7 + ss); PY[m] = SY[i]; PW[m] = inkW(sw * (1 - st * f), f, ss); m++;
  }
  emitStroke(sStroke, m, KIND_STEM, false);
  if (terminal === 'Bud') {
    const bp = SPH[stemN - 1], bx = SX[stemN - 1], by = SY[stemN - 1];
    const c = Math.cos(bp), sn = Math.sin(bp), bl = 0.09, bw = 0.026;
    m = 0;
    for (let i = 0; i <= 16; i++) {
      const a = i / 16 * TAU;
      const u = (1 - Math.cos(a)) / 2;
      const r = bw * Math.sin(Math.PI * Math.pow(u, 0.7)) * Math.sign(Math.sin(a));
      const lx = u * bl, ly = r;
      PX[m] = bx + lx * c - ly * sn; PY[m] = by + lx * sn + ly * c; PW[m] = G.outlineW * 0.8; m++;
      if (i > 0) {
        vtx(sFill, bx, by, 0, 0, 0, 0, 0.5, KIND_FILL);
        vtx(sFill, PX[m - 2], PY[m - 2], 0, 0, 0, 1, 0.5, KIND_FILL);
        vtx(sFill, PX[m - 1], PY[m - 1], 0, 0, 0, 1, 0.5, KIND_FILL);
      }
    }
    emitStroke(sStroke, m - 1, KIND_OUTLINE, true);
  }
  geo.sprigStart[j] = geo.count;
  appendBuf(sStroke); appendBuf(sFill);
  geo.sprigCount[j] = geo.count - geo.sprigStart[j];

  // Leaf placements.
  const po = j * MAX_PLACE * 8;
  let np = 0;
  const co = j * MAX_SPRIG_CIRC * 3;
  let nc = 0;
  const nLeaf = Math.max(1, geo.nLeaf);
  let ink = len * sw * 2;
  const div = P.divergence.value * DEG, dec = P.decussate.value, whorl = Math.round(P.whorlCount.value);
  const ins0 = P.insertion.value * DEG, ins1 = P.tipInsertion.value * DEG, grad = P.sizeGradient.value;
  const per = arrangement === 1 ? 1 : arrangement === 2 ? 2 : whorl;
  const total = nodes * per + (terminal === 'Leaf' ? 1 : 0);
  for (let L = 0; L < total && np < MAX_PLACE; L++) {
    const isTip = L >= nodes * per;
    const i = isTip ? nodes - 1 : Math.floor(L / per), q = isTip ? 0 : L % per;
    let psi, beta, size, sAt;
    const fi = nodes > 1 ? i / (nodes - 1) : 0;
    if (isTip) { psi = Math.PI / 2; beta = 0.02; size = (1 - grad) * 0.9; sAt = len; }
    else {
      if (arrangement === 1) psi = i * div;
      else if (arrangement === 2) psi = (dec ? i * Math.PI / 2 : 0) + q * Math.PI;
      else psi = i * Math.PI / per + q * TAU / per;
      beta = lerp(ins0, ins1, fi) + v * 0.12 * rnd2(ss, 40 + L);
      size = (1 - grad * fi) * (1 + v * 0.12 * rnd2(ss, 70 + L));
      sAt = NODE_S[i];
    }
    // Leaf direction in 3D around the stem, projected onto the page: the part toward or away
    // from the viewer is lost, so those leaves look shorter.
    const along = Math.cos(beta), side = Math.sin(beta) * Math.cos(psi);
    const fore = Math.max(0.3, Math.hypot(along, side));
    const rel = Math.atan2(side, along);
    const flip = side >= 0 ? 1 : -1;
    const sph = stemAt(sAt, stemN);
    const nx = EX, ny = EY;
    const lv = (j * 7 + L * 3) % nLeaf;
    const A = lv * 3, axp = geo.leafAttach[A], ayp = geo.leafAttach[A + 1], th = geo.leafAttach[A + 2];
    const g = sph + rel, cg = Math.cos(g), sgn = Math.sin(g), cA = Math.cos(th), sA = Math.sin(th);
    const sx = Math.max(0.05, size) * fore, sy = Math.max(0.05, size) * flip;
    // Q = R(g) · diag(sx, sy) · R(−th);  T = node − Q · attach
    const q00 = cg * sx * cA + sgn * sy * sA, q01 = cg * sx * sA - sgn * sy * cA;
    const q10 = sgn * sx * cA - cg * sy * sA, q11 = sgn * sx * sA + cg * sy * cA;
    const tx = nx - (q00 * axp + q01 * ayp), ty = ny - (q10 * axp + q11 * ayp);
    const o = po + np * 8;
    geo.sprigPlace[o] = lv; geo.sprigPlace[o + 1] = q00; geo.sprigPlace[o + 2] = q10; geo.sprigPlace[o + 3] = q01;
    geo.sprigPlace[o + 4] = q11; geo.sprigPlace[o + 5] = tx; geo.sprigPlace[o + 6] = ty; geo.sprigPlace[o + 7] = L;
    np++;
    ink += geo.leafFoot[lv] * Math.abs(q00 * q11 - q01 * q10);
    // Collision circles: the leaf's own, carried along.
    const lco = lv * MAX_CIRC * 3, sc = Math.max(0.05, size);
    // The biggest few circles are enough per leaf (they come biggest first), plus the petiole's.
    const lnc = geo.leafNCirc[lv];
    for (let c = 0; c < lnc && nc < MAX_SPRIG_CIRC; c++) {
      if (c >= 6 && c < lnc - 2) continue;
      const lx = geo.leafCirc[lco + c * 3], ly = geo.leafCirc[lco + c * 3 + 1], r = geo.leafCirc[lco + c * 3 + 2];
      geo.sprigCirc[co + nc * 3] = q00 * lx + q01 * ly + tx;
      geo.sprigCirc[co + nc * 3 + 1] = q10 * lx + q11 * ly + ty;
      geo.sprigCirc[co + nc * 3 + 2] = r * sc;
      nc++;
    }
  }
  geo.sprigNPlace[j] = np;
  geo.sprigInk[j] = ink;
  geo.sprigFoot[j] = ink; // finished below, once the hull is known
  // Stem circles.
  const sr = sw + 0.02;
  for (let sAt = 0; sAt <= len && nc < MAX_SPRIG_CIRC; sAt += sr * 1.6) {
    stemAt(sAt, stemN);
    geo.sprigCirc[co + nc * 3] = EX; geo.sprigCirc[co + nc * 3 + 1] = EY; geo.sprigCirc[co + nc * 3 + 2] = sr; nc++;
  }
  geo.sprigNCirc[j] = nc;
  circleStats(geo.sprigCirc, co, nc);
  geo.sprigPivot[j * 2] = cPivX; geo.sprigPivot[j * 2 + 1] = cPivY;
  geo.sprigBound[j] = cBound; geo.sprigArea[j] = cArea; geo.sprigGyr[j] = cGyr; geo.sprigRad[j] = cRad;
  // Sprigs interlock poorly (stems and leaves at angles), so they need more room than their hull.
  geo.sprigFoot[j] = Math.max(ink, cArea * 1.5);
}

// ---------------------------------------------------------------- entry point

/**
 * Rebuild every leaf variant (and sprig variant in stem mode) from the params and the
 * current option weights. `arrangement` is 0 for no stem, else 1 alternate, 2 opposite,
 * 3 whorled.
 */
export function buildShapes(P, B, arrangement) {
  resolveKnobs(P, B);
  const nv = clamp(Math.round(P.variants.value), 1, MAX_VARIANTS);
  const seed = P.seed.value;
  geo.count = 0;
  geo.overflow = false;
  geo.nLeaf = nv;
  for (let v = 0; v < nv; v++) buildLeafVariant(v, seed);
  geo.nSprig = 0;
  if (arrangement > 0) {
    geo.nSprig = nv;
    for (let j = 0; j < nv; j++) buildSprigVariant(j, P, seed, arrangement);
  }
}
