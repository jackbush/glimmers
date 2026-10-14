// Sprig — one leaf (or one sprig) centred on the screen, a botanical study on warm paper. Raw
// WebGL2.
//
// Each frame: ease the category morphs and every shape number toward the params → rebuild
// the geometry while anything is still easing (shapes.js) → ease the
// framing (tip up, Scale × 90% of the short side) → sway → draw the paper, then the leaves,
// fruit and flowers in stem order (shaders.js). With Sway at 0 and nothing changing, a frame draws nothing and the last
// image stays on screen.
//
// Smooth morphs: shape numbers are eased copies (counts go fractional, and shapes.js grows
// the newest node, leaflet pair, vein or fruit in as the fraction rises); categories, including
// arrangement, terminal, bud type and fruit, are eased weights; each leaf has a presence and is
// scaled about where it attaches, so leaves grow out of and shrink back into the stem.
// Presets instead morph on one clock: see beginMorph.
//
// Params without `uniform: false` are auto-declared in every shader as u_<key>; f_* are
// per-frame values computed here. The frame allocates nothing.

import * as SH from './shaders.js';
import { presets } from './params.js';
import { blades, presetSeconds } from './pace.js';
import { buildShapes, geo, STRIDE, MAX_VERTS, MAX_PLACE, SEG_FILL, SEG_VEIN, DRAW_LEAF, DRAW_CLUSTER, freezeOrder, setOrderMode } from './shapes.js';
import { rng } from '../../kit/random.js';
import { FULLSCREEN_VERT, paramDecls, program, shaderParams, uploadParams } from '../../kit/gl.js';

const MAX_INST = MAX_PLACE + 1, IFLOATS = 6;
const SELECTS = ['compound', 'outline', 'base', 'apex', 'lobing', 'margin', 'venation', 'arrangement', 'terminal', 'budType', 'fruit', 'fruitForm', 'flower', 'flowerForm'];
// The leaf's own shape (not the stem's): in a two-phase morph these swap while the leaves
// are shrunk to nothing (see beginMorph).
const LEAF_KEYS = new Set([
  'compound', 'outline', 'base', 'apex', 'lobing', 'margin', 'venation',
  'leaflets', 'leafletPairs', 'leafletTerm', 'leafletAngle', 'leafletFlop', 'width', 'bend', 'sCurve', 'lobeDepth', 'lobes', 'lobeSharpness',
  'teeth', 'toothDepth', 'veinCount', 'veinAngle', 'veinCurve', 'veinlets', 'veinWeight', 'midribWeight',
  'petioleLength', 'petioleFlat', 'petioleWing', 'stipules',
]);
// Params that change the geometry (selects in SELECTS morph and are tracked separately).
const GEOM_KEYS = [
  'seed', 'leaflets', 'leafletAngle', 'leafletFlop', 'width', 'bend', 'sCurve', 'lobeDepth', 'lobes', 'lobeSharpness',
  'teeth', 'toothDepth', 'veinCount', 'veinAngle', 'veinCurve', 'veinlets', 'veinWeight', 'midribWeight',
  'petioleLength', 'petioleFlat', 'petioleWing', 'stipules', 'outlineWeight', 'wobble',
  'arrangement', 'nodes', 'divergence', 'decussate', 'whorlCount', 'internode', 'internodeTaper', 'bareStem',
  'frontReach', 'thorns', 'thornAngle', 'thornPairs', 'foreshorten', 'perNode', 'bundleSpread', 'sheath', 'baseShrink', 'pegs',
  'spurs', 'spurEvery', 'spurLeaves', 'spurFan', 'spurLength', 'spurAngle',
  'sideShoots', 'sideEvery', 'sideLength', 'sideAngle', 'sideNodes', 'leaderScales',
  'insertion', 'tipInsertion', 'sizeGradient', 'stemWidth', 'stemTaper', 'stemCurve', 'stemDroop', 'zigzag', 'stemWander', 'spreadOut',
  'terminal', 'budType', 'budSize', 'budStem', 'leafVariety',
  'fruit', 'fruitNodes', 'fruitEvery', 'fruitTip', 'fruitCount', 'fruitSize', 'fruitLength', 'fruitPeduncle', 'fruitBudScales', 'fruitStalk', 'fruitHang', 'fruitSpread',
  'fruitForm', 'fruitAxis', 'fruitRays', 'fruitTaper', 'fruitPairs', 'fruitRaySpread', 'fruitBract', 'fruitCurve',
  'fruitAsym', 'fruitSeeds', 'fruitCup', 'fruitSpines', 'fruitSpineCount', 'fruitCut', 'fruitKernels', 'fruitConeRows', 'fruitNutShow',
  'flowerPairs', 'flowerRaySpread', 'flowerRings', 'flowerViews',
  'flower', 'flowerNodes', 'flowerEvery', 'flowerTip', 'flowerForm', 'flowerAxis', 'flowerRays', 'flowerTaper', 'flowerCount', 'flowerSize', 'flowerBudScales',
  'flowerLength', 'flowerPeduncle', 'flowerBract', 'flowerStalk', 'flowerHang', 'flowerSpread', 'flowerCurve', 'flowerPetals',
  'flowerNotch', 'flowerStamens', 'flowerFlare',
  // Pen lines on fruit stop at the highlight, so these move geometry too.
  'fruitGloss', 'fruitHighlightOpacity', 'washGapJitter',
];

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P, model, degrade }) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: true,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const uniformParams = shaderParams(model.params);
  const geomParams = GEOM_KEYS.map((k) => {
    if (!P[k]) throw new Error('sprig: unknown geometry param ' + k);
    return P[k];
  });

  // ---- category morphs: one eased weight per option
  /** @type {Record<string, Float32Array>} */
  const blend = {};
  const blendList = SELECTS.map((key) => {
    const p = P[key];
    const w = new Float32Array(p.options.length);
    w[p.options.indexOf(p.value)] = 1;
    blend[key] = w;
    // from: the weights when a preset morph started.
    return { p, w, from: new Float32Array(w.length), leaf: LEAF_KEYS.has(key) };
  });
  /** Move each select's weights a share `k` of the way to its value. Returns whether any moved. */
  function easeBlends(k) {
    let moving = false;
    for (let b = 0; b < blendList.length; b++) {
      const { p, w } = blendList[b];
      const target = p.options.indexOf(p.value);
      for (let i = 0; i < w.length; i++) {
        const t = i === target ? 1 : 0;
        const d = t - w[i];
        if (d === 0) continue;
        w[i] = Math.abs(d) < 1e-3 ? t : w[i] + d * k;
        moving = true;
      }
    }
    return moving;
  }
  function geomSig() {
    let s = 0;
    for (let i = 0; i < geomParams.length; i++) {
      const p = geomParams[i];
      const v = p.type === 'select' ? p.options.indexOf(p.value) : p.type === 'bool' ? (p.value ? 1 : 0) : p.value;
      s += (v + 0.37) * (i * 0.6180339 + 1.1);
    }
    return s;
  }

  // ---- eased shape numbers: geometry reads PE (P with eased copies of these), so a slider
  // or preset change glides. Bools (decussate) ease 0 → 1 too. The leaflet count eases as
  // pairs and terminal (see shapes.js blendLayouts), not as the raw count.
  /** @type {Record<string, any>} */
  const PE = {};
  const eased = [];
  for (const k in P) PE[k] = P[k];
  const ease1 = (key, p, target, eps) => {
    const e = { p, target, value: 0, from: 0, to: 0, eps, leaf: LEAF_KEYS.has(key), hold: -1 };
    PE[key] = e;
    eased.push(e);
  };
  for (const p of geomParams) {
    if (p.type !== 'range' && p.type !== 'bool') continue;
    if (p.key === 'seed' || p.key === 'leaflets') continue;
    if (p.type === 'bool') ease1(p.key, p, () => (p.value ? 1 : 0), 1e-3);
    else ease1(p.key, p, () => p.value, Math.max(1e-7, (p.max - p.min) * 1e-4));
  }
  ease1('leafletPairs', P.leaflets, () => Math.floor(P.leaflets.value / 2), 1e-3);
  ease1('leafletTerm', P.leaflets, () => P.leaflets.value % 2, 1e-3);
  // Whole-number spacings that rearrange where their feature sits, by the amount that shows it:
  // in a preset morph they change while it's faded out (see beginMorph), not in steps as it
  // fades (a larch's spurs hopping between nodes as Spur every rounded 4 → 3 → 2).
  const SPACING = { spurEvery: 'spurs', sideEvery: 'sideShoots', fruitEvery: 'fruit', flowerEvery: 'flower' };
  let easedInit = false;
  /** Move each eased number a share `k` of the way to its target. Returns whether any moved. */
  function easeNumbers(k) {
    let moving = false;
    for (let i = 0; i < eased.length; i++) {
      const e = eased[i];
      const t = e.target();
      if (!easedInit) { e.value = t; continue; }
      const d = t - e.value;
      if (d === 0) continue;
      e.value = Math.abs(d) < e.eps ? t : e.value + d * k;
      moving = true;
    }
    easedInit = true;
    return moving;
  }

  // ---- preset morphs: work out where everything ends, then move there on one curve
  // A preset's numbers and selects land in P at once (the kit glides only its colours, over the
  // same time and curve). The eased numbers and select weights then move from where they were
  // to their targets, and the framing from the box on screen to the final shape's box, all on
  // one ease-in-out clock, instead of each chasing its target on its own (which started
  // abruptly, finished at different times, and let the framing follow every wobble).
  // A slider change during a morph ends it, and everything chases as usual from there.
  // Two phases when the leaf type changes (simple ↔ compound, or one compound type to
  // another): blending a leaf into leaflets turned the old leaves into odd half-compound ones on
  // the way. Instead the old leaves shrink back into their nodes, the leaf's shape swaps while
  // they're gone, and the new ones grow out; the stem morphs throughout. Same-type morphs (oak
  // to elm) stay one continuous blend.
  let morphLen = 0, morphT = 0, morphSig = NaN, morphPending = -1, twoPhase = false;
  // Every leaf's presence is scaled by this (1 except mid two-phase morph).
  let leafGrow = 1;
  const viewFrom = new Float32Array(4), viewTo = new Float32Array(4);
  const smooth01 = (x) => x * x * (3 - 2 * x);
  /** A shape param as it is on screen (eased numbers, the leading option of each select). */
  function shown(key) {
    const w = blend[key];
    if (w) { let m = 0; for (let i = 1; i < w.length; i++) if (w[i] > w[m]) m = i; return P[key].options[m]; }
    if (key === 'leaflets') return 2 * PE.leafletPairs.value + PE.leafletTerm.value;
    return PE[key].value;
  }
  function target(key) { return P[key].value; }
  function beginMorph(seconds) {
    // Two phases when the leaf type changes, or the number of blades on show does by more than
    // about three times (three leaves to a hundred needles): the old leaves shrink into the stem,
    // the shape changes while they're small, the new ones grow out. Blended straight through,
    // big changes read as a scramble.
    twoPhase = shown('compound') !== P.compound.value || Math.abs(Math.log2((blades(target) + 1) / (blades(shown) + 1))) > 1.5;
    // The draw order: what's on screen now (rebuilt live), frozen for the first half.
    setOrderMode(0);
    rebuild();
    freezeOrder(1);
    leafGrow = 1; // (a new preset mid-dip starts its leaves from full)
    for (let i = 0; i < eased.length; i++) { const e = eased[i]; e.from = e.value; e.to = e.target(); e.hold = -1; }
    // A spacing whose feature is gone at the start takes its end value at once; one whose
    // feature is gone at the end keeps its start value throughout; otherwise it eases.
    for (const key in SPACING) {
      const e = PE[key], amount = SPACING[key];
      const off = (v) => (typeof v === 'string' ? v === 'None' : v < 1e-3);
      if (off(shown(amount))) e.hold = 1;
      else if (off(P[amount].value)) e.hold = 0;
    }
    for (let b = 0; b < blendList.length; b++) blendList[b].from.set(blendList[b].w);
    // The end: build the final shape once and measure its box.
    for (let i = 0; i < eased.length; i++) eased[i].value = eased[i].to;
    for (let b = 0; b < blendList.length; b++) {
      const { p, w } = blendList[b];
      w.fill(0);
      w[p.options.indexOf(p.value)] = 1;
    }
    rebuild();
    viewTo.set(box);
    freezeOrder(2); // the end's order, for the second half
    // Back to the start; the frame rebuilds from there.
    for (let i = 0; i < eased.length; i++) eased[i].value = eased[i].from;
    for (let b = 0; b < blendList.length; b++) blendList[b].w.set(blendList[b].from);
    viewFrom.set(viewBox);
    morphLen = seconds; morphT = 0; morphSig = geomSig();
    setOrderMode(1);
  }
  /** Advance the morph; returns false once it has landed (or was cut short). */
  function stepMorph(rdt) {
    if (geomSig() !== morphSig) { morphLen = 0; leafGrow = 1; setOrderMode(0); return false; }
    morphT = Math.min(morphLen, morphT + rdt);
    const k = morphT >= morphLen ? 1 : smooth01(morphT / morphLen);
    // The order swaps once, at the midpoint; at the end it goes live (and matches the end's).
    setOrderMode(morphT >= morphLen ? 0 : k < 0.5 ? 1 : 2);
    // Two phases: leaf shape holds at the start, then at the end, swapping at the midpoint while
    // the leaves are shrunk to nothing (out over 0–0.45, back over 0.55–1).
    const kl = twoPhase ? (k < 0.5 ? 0 : 1) : k;
    leafGrow = !twoPhase ? 1 : k < 0.5 ? 1 - smooth01(Math.min(1, k / 0.45)) : smooth01(Math.max(0, (k - 0.55) / 0.45));
    for (let i = 0; i < eased.length; i++) {
      const e = eased[i], ke = e.hold >= 0 ? (k >= 1 ? 1 : e.hold) : e.leaf ? kl : k;
      e.value = ke === 1 ? e.to : e.from + (e.to - e.from) * ke;
    }
    for (let b = 0; b < blendList.length; b++) {
      const { w, from, p, leaf } = blendList[b];
      const ti = p.options.indexOf(p.value), kb = leaf ? kl : k;
      for (let i = 0; i < w.length; i++) w[i] = from[i] + ((i === ti ? 1 : 0) - from[i]) * kb;
    }
    for (let i = 0; i < 4; i++) viewBox[i] = viewFrom[i] + (viewTo[i] - viewFrom[i]) * k;
    if (morphT >= morphLen) morphLen = 0;
    return true;
  }

  // ---- GL plumbing
  let ready = false;
  let progBg = null, progLeaf = null, vaoFull = null;
  // Geometry uploads rotate through RING fixed-size buffers (each with its own VAO). The GPU
  // runs a few frames behind, so writing a buffer it may still be reading made the driver
  // copy or wait (up to half a second, once per morph); reallocating each time did too.
  const RING = 2;
  const vbos = [null, null], vaos = [null, null], ibos = [null, null];
  let cur = 0;
  const UNIT_NOISE = 0;
  const fView = new Float32Array(2);
  let fPx = 1;

  function header() {
    return '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n' +
      'uniform vec2 f_view;\nuniform float f_px;\n' +
      paramDecls(uniformParams);
  }
  /** A program whose fragment shader (and the vertex shader, if it wants them) gets header(). */
  function makeProgram(vert, fragBody, name) {
    const prog = program(gl, vert, header() + fragBody, name);
    const loc = (n) => gl.getUniformLocation(prog, n);
    gl.useProgram(prog);
    gl.uniform1i(loc('u_noise'), UNIT_NOISE);
    return { prog, version: -1, fView: loc('f_view'), fPx: loc('f_px'), uPass: loc('u_pass'), uStemBase: loc('u_stemBase'), paramLocs: uniformParams.map((p) => loc('u_' + p.key)) };
  }
  function use(pr) {
    gl.useProgram(pr.prog);
    gl.uniform2fv(pr.fView, fView);
    gl.uniform1f(pr.fPx, fPx);
    if (pr.version !== model.version) {
      uploadParams(gl, pr.paramLocs, uniformParams);
      pr.version = model.version;
    }
  }

  /** Tileable value-noise texture: R fine fbm, G broad fbm (the mottling). */
  function buildNoise() {
    const S = 256, data = new Uint8Array(S * S * 4);
    const lat = new Float32Array(S * S);
    const r = rng(12.34);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const vn = (x, y, per) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const x0 = ((ix % per) + per) % per, x1 = (x0 + 1) % per, y0 = ((iy % per) + per) % per, y1 = (y0 + 1) % per;
      const a = lat[y0 * S + x0], b = lat[y0 * S + x1], c = lat[y1 * S + x0], d = lat[y1 * S + x1];
      return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
    };
    const fbm = (u, v, base, oct) => {
      let s = 0, amp = 0.5, tot = 0, f = base;
      for (let o = 0; o < oct; o++) { s += amp * vn(u * f, v * f, f); tot += amp; amp *= 0.5; f *= 2; }
      return s / tot;
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const o = (y * S + x) * 4;
        data[o] = Math.round(255 * fbm(x / S, y / S, 8, 4));
        data[o + 1] = Math.round(255 * fbm(x / S, y / S, 4, 3));
        data[o + 3] = 255;
      }
    }
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + UNIT_NOISE);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  function buildAll() {
    buildNoise();
    progBg = makeProgram(FULLSCREEN_VERT, SH.background, 'background');
    progLeaf = makeProgram(header() + SH.leafVert, SH.leafFrag, 'leaf');
    vaoFull = gl.createVertexArray();
    const B = STRIDE * 4;
    for (let k = 0; k < RING; k++) {
      vaos[k] = gl.createVertexArray();
      gl.bindVertexArray(vaos[k]);
      vbos[k] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbos[k]);
      gl.bufferData(gl.ARRAY_BUFFER, MAX_VERTS * STRIDE * 4, gl.DYNAMIC_DRAW);
      // One full-size upload now, so the driver sizes its upload staging for the largest
      // geometry up front (growing it mid-morph stalled for up to a second).
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.verts, 0, MAX_VERTS * STRIDE);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, B, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, B, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, B, 16);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, B, 32);
      ibos[k] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ibos[k]);
      gl.bufferData(gl.ARRAY_BUFFER, MAX_INST * IFLOATS * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(4); gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5); gl.vertexAttribDivisor(5, 1);
    }
    gl.bindVertexArray(null);
    cur = 0;
    geoUploaded = false;
    bufGen.fill(-1);
    needsDraw = true;
    ready = true;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ready = false;
    progBg = progLeaf = vaoFull = null;
    for (let k = 0; k < RING; k++) vbos[k] = vaos[k] = ibos[k] = null;
    degrade(0.6);
  });
  canvas.addEventListener('webglcontextrestored', buildAll);

  // ---- the object: bounds (leaf units, unrotated) of whatever is drawn
  let lastVersion = -1, lastSig = NaN, geoUploaded = false;
  // Which geometry generation each buffer of the pair holds.
  let geoGen = 0;
  const bufGen = new Int32Array([-1, -1]);
  // The leaf is still, so it's only drawn when something changes (see frame()).
  let needsDraw = true, drawnVersion = -1;
  // x0, y0, x1, y1 of the last rebuild.
  const box = new Float64Array([0, 0, 1, 1]);
  // The framing eases toward the rebuilt box, so the view doesn't jump as the shape changes.
  const viewBox = new Float32Array(4);
  let viewInit = false;
  const leafBox = new Float32Array(16 * 4);

  function rebuild() {
    buildShapes(PE, blend, PE.leafVariety.value);
    geoUploaded = false;
    // Each leaf variant's box, from its vertices.
    for (let v = 0; v < geo.nLeaf; v++) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = geo.leafStart[v]; i < geo.leafStart[v] + geo.leafCount[v]; i++) {
        const x = geo.verts[i * STRIDE], y = geo.verts[i * STRIDE + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      // A leaf with no vertices (cut off by a full buffer) adds nothing to the box.
      if (x0 > x1) x0 = y0 = x1 = y1 = 0;
      leafBox[v * 4] = x0; leafBox[v * 4 + 1] = y0; leafBox[v * 4 + 2] = x1; leafBox[v * 4 + 3] = y1;
    }
    // The stem's, bud's and fruit's vertices plus each placed leaf's box corners (at its presence).
    box[0] = box[1] = 1e9; box[2] = box[3] = -1e9;
    for (let i = geo.sprigStart[0]; i < geo.fruitStart[0] + geo.fruitCount[0]; i++) grow(geo.verts[i * STRIDE], geo.verts[i * STRIDE + 1]);
    for (let p = 0; p < geo.sprigNPlace[0]; p++) {
      placed(p, 0);
      const lv = geo.sprigPlace[p * 8];
      for (let c = 0; c < 4; c++) {
        const x = leafBox[lv * 4 + (c & 1 ? 2 : 0)], y = leafBox[lv * 4 + (c & 2 ? 3 : 1)];
        grow(pa * x + pc * y + px, pb * x + pd * y + py);
      }
    }
    if (box[0] > box[2]) { box[0] = box[1] = 0; box[2] = box[3] = 1; }
  }
  // Placement p's transform (leaf coords → sprig coords), scaled about where the leaf
  // attaches by its presence (so it grows from the stem) and swayed by angle th about the
  // same point. Into pa…pd (column-major mat2), px, py.
  let pa = 1, pb = 0, pc = 0, pd = 1, px = 0, py = 0;
  function placed(p, th) {
    const o = p * 8, lv = geo.sprigPlace[o];
    const qa = geo.sprigPlace[o + 1], qb = geo.sprigPlace[o + 2], qc = geo.sprigPlace[o + 3], qd = geo.sprigPlace[o + 4];
    const qx = geo.sprigPlace[o + 5], qy = geo.sprigPlace[o + 6], pres = geo.sprigPlace[o + 7] * leafGrow;
    const ax = geo.leafAttach[lv * 3], ay = geo.leafAttach[lv * 3 + 1];
    const nx = qa * ax + qc * ay + qx, ny = qb * ax + qd * ay + qy; // the node
    const c = Math.cos(th), s = Math.sin(th);
    // Q' = R · pres·Q;  q' = N + R · pres·(q − N)
    pa = pres * (c * qa - s * qb); pb = pres * (s * qa + c * qb);
    pc = pres * (c * qc - s * qd); pd = pres * (s * qc + c * qd);
    const dx = pres * (qx - nx), dy = pres * (qy - ny);
    px = nx + c * dx - s * dy; py = ny + s * dx + c * dy;
  }
  function grow(x, y) {
    if (x < box[0]) box[0] = x; if (x > box[2]) box[2] = x; if (y < box[1]) box[1] = y; if (y > box[3]) box[3] = y;
  }

  // ---- instances: the sprig's stem first, then its leaves in stem order.
  const inst = new Float32Array(MAX_INST * IFLOATS);
  let instTotal = 0;
  function putInst(slot, a, b, c, d, tx, ty) {
    const o = slot * IFLOATS;
    inst[o] = a; inst[o + 1] = b; inst[o + 2] = c; inst[o + 3] = d; inst[o + 4] = tx; inst[o + 5] = ty;
  }
  function buildInstances(cssW, cssH, t) {
    // Tip up, centred, the larger side of the (eased) box at Scale × 90% of the short side.
    const x0 = viewBox[0], y0 = viewBox[1], x1 = viewBox[2], y1 = viewBox[3];
    const sc = P.scale.value * 0.9 * Math.min(cssW, cssH) / Math.max(x1 - x0, y1 - y0, 1e-3);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // Sway: the whole sprig rocks about its base, each leaf about where it attaches, each on
    // its own slow rhythm (two sines, so it never quite repeats).
    const sw = P.sway.value, f = P.swaySpeed.value * 6.2831853;
    const ths = sw * 0.035 * (Math.sin(f * 0.6 * t) + 0.4 * Math.sin(f * 0.37 * t + 1.3));
    // m = R(−90°) · sc · R(ths), about the stem's base (sprig origin): leaf +x points up.
    const cs = Math.cos(ths), sn = Math.sin(ths);
    const m00 = sc * sn, m10 = -sc * cs, m01 = sc * cs, m11 = sc * sn;
    // The centre sits where it would unswayed, so the rocking is about the base, not the middle.
    const tx = cssW / 2 - sc * cy, ty = cssH / 2 + sc * cx;
    putInst(0, m00, m10, m01, m11, tx, ty);
    // In stem order (instance 1 + p), so the draw order of leaves is fixed.
    instTotal = 1 + geo.sprigNPlace[0];
    for (let p = 0; p < geo.sprigNPlace[0]; p++) {
      const ph = p * 2.39996; // golden angle: neighbours out of step
      const th = sw * 0.09 * (Math.sin(f * t + ph) + 0.5 * Math.sin(f * 1.73 * t + ph * 1.7));
      placed(p, th);
      // world = m · (Q' · v + q') + t
      putInst(1 + p,
        m00 * pa + m01 * pb, m10 * pa + m11 * pb, m00 * pc + m01 * pd, m10 * pc + m11 * pd,
        m00 * px + m01 * py + tx, m10 * px + m11 * py + ty);
    }
  }

  function drawRun(start, count, off, n) {
    if (n <= 0 || count <= 0) return;
    const b = off * IFLOATS * 4;
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, IFLOATS * 4, b);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, IFLOATS * 4, b + 16);
    gl.drawArraysInstanced(gl.TRIANGLES, start, count, n);
  }

  // One leaf instance, segment by segment. Stencil bits: 0x3f the leaflet's id (its fill
  // writes it, so veins never leave the blade), 0x40 pooled already, 0x80 inside a vein.
  // Veins draw as one network: pool once, mark insides, pen edges outside the insides,
  // then fill each inside pixel once.
  let stencilRef = 0;
  /** Segments s0 … s1 of leaf variant v, as instance `inst`. */
  function drawLeaf(v, inst, s0, s1) {
    const b = inst * IFLOATS * 4;
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, IFLOATS * 4, b);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, IFLOATS * 4, b + 16);
    for (let k = s0; k < s1; k++) {
      const start = geo.seg[k * 3], count = geo.seg[k * 3 + 1], mode = geo.seg[k * 3 + 2];
      if (mode === SEG_FILL) {
        if (++stencilRef > 63) { gl.stencilMask(0xff); gl.clear(gl.STENCIL_BUFFER_BIT); stencilRef = 1; }
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.ALWAYS, stencilRef, 0xff); gl.stencilMask(0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.drawArraysInstanced(gl.TRIANGLES, start, count, 1);
      } else if (mode === SEG_VEIN) {
        const R = stencilRef;
        gl.enable(gl.STENCIL_TEST);
        // 1. Pigment pooled along the veins (watercolour), each pixel once (INVERT sets 0x40,
        // and only pixels with it clear pass).
        gl.stencilFunc(gl.EQUAL, R, 0x7f); gl.stencilMask(0x40); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
        gl.uniform1f(progLeaf.uPass, 1);
        gl.drawArraysInstanced(gl.TRIANGLES, start, count, 1);
        // 2. Mark the insides of all the veins.
        gl.colorMask(false, false, false, false);
        // (REPLACE with the 0x80 bit in ref: sets it, idempotent where veins overlap.)
        gl.stencilFunc(gl.EQUAL, R | 0x80, 0x3f); gl.stencilMask(0x80); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.uniform1f(progLeaf.uPass, 3);
        gl.drawArraysInstanced(gl.TRIANGLES, start, count, 1);
        gl.colorMask(true, true, true, true);
        // 3. Pen edges, only outside every vein's inside.
        gl.stencilFunc(gl.EQUAL, R, 0xbf); gl.stencilMask(0); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.uniform1f(progLeaf.uPass, 4);
        gl.drawArraysInstanced(gl.TRIANGLES, start, count, 1);
        // 4. Fill the insides, each pixel once (clearing its mark as it goes).
        gl.stencilFunc(gl.EQUAL, R | 0x80, 0xbf); gl.stencilMask(0x80); gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
        gl.uniform1f(progLeaf.uPass, 2);
        gl.drawArraysInstanced(gl.TRIANGLES, start, count, 1);
        gl.uniform1f(progLeaf.uPass, 0);
        gl.stencilMask(0xff);
      } else {
        gl.disable(gl.STENCIL_TEST);
        gl.drawArraysInstanced(gl.TRIANGLES, start, count, 1);
      }
    }
    gl.disable(gl.STENCIL_TEST);
  }

  // ---- the preset's name, bottom left (Finish → Preset name), to tell presets apart
  // As far from the bottom and left edges as the back button is from the top and left. One
  // element, written only when it fades in or out (its name once per morph), never every frame.
  // It fades in over the last 300 ms of a morph (or as soon as the page's first preset lands),
  // and out over 300 ms once anything moves away from the preset.
  const label = document.createElement('div');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));'
    + 'pointer-events:none;white-space:nowrap;opacity:0;transition:opacity 300ms ease;'
    + 'font:italic 300 15px/1 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;letter-spacing:0.02em;';
  canvas.parentElement.appendChild(label);
  // Every preset's keys, listed once, so checking whether one still holds allocates nothing.
  const presetKeys = {};
  for (const name in presets) presetKeys[name] = Object.keys(presets[name]);
  let labelName = '', labelShown = false, labelCheck = false, morphEndAt = 0;
  // Not in capture mode: covers and share images don't carry it.
  const capturing = new URLSearchParams(location.search).has('capture');
  /** Do the params still hold preset `name`? */
  function presetHolds(name) {
    const keys = presetKeys[name], vals = presets[name];
    for (let i = 0; i < keys.length; i++) if (P[keys[i]] && P[keys[i]].value !== vals[keys[i]]) return false;
    return true;
  }
  /**
   * A preset's name as you'd say it: the menu's index form turned back round ('Oak, Holm' → 'Holm
   * oak', "Cherry, Japanese 'Kanzan'" → "Japanese cherry 'Kanzan'"); one-word names as they are.
   */
  function spoken(name) {
    const m = /^([^,]+), ([^']+?)( '.*')?$/.exec(name);
    return m ? m[2] + ' ' + m[1].toLowerCase() + (m[3] || '') : name;
  }
  function showLabel() {
    label.textContent = spoken(labelName);
    label.style.color = P.penColour.value;
    label.style.opacity = '0.7';
    labelShown = true;
  }
  function hideLabel() {
    if (!labelShown) return;
    label.style.opacity = '0';
    labelShown = false;
  }

  buildAll();

  return {
    resize(_w, _h, px) { fPx = px; needsDraw = true; },
    // Started on the next frame, from whatever is on screen then (0 = jump straight there).
    morph(seconds, name) { morphPending = seconds; morphLen = 0; hideLabel(); labelName = name; },
    presetSeconds(values) { return presetSeconds(P, values); },
    frame(t, dt, rt, rdt) {
      if (!ready) return;
      const cssW = canvas.width / fPx, cssH = canvas.height / fPx;
      // How far everything that chases its target (outside a preset morph) moves this frame.
      const chase = P.morph.value > 0 ? 1 - Math.exp(-rdt * 4.6 / P.morph.value) : 1;

      // Shapes: rebuild while a category or a shape number is still easing.
      if (morphPending >= 0) {
        if (morphPending > 0 && easedInit && viewInit) beginMorph(morphPending);
        morphPending = -1;
      }
      const morphing = morphLen > 0 && stepMorph(rdt);
      if (morphing && morphLen === 0) morphEndAt = rt;
      let dirty = morphing;
      if (!morphing) {
        if (easeBlends(chase)) dirty = true;
        if (easeNumbers(chase)) dirty = true;
      }
      if (model.version !== lastVersion) {
        lastVersion = model.version;
        labelCheck = true;
        const s = geomSig();
        if (s !== lastSig) { lastSig = s; dirty = true; }
      }
      if (dirty) rebuild();
      // A preset morph glides the framing from the first box to the last, but the shape between
      // can be bigger than both (forty nodes of oak leaves on the way to a pine): take in the
      // current box too, so nothing leaves the screen. At the end the two boxes are the same.
      if (morphing) {
        viewBox[0] = Math.min(viewBox[0], box[0]); viewBox[1] = Math.min(viewBox[1], box[1]);
        viewBox[2] = Math.max(viewBox[2], box[2]); viewBox[3] = Math.max(viewBox[3], box[3]);
      }
      // Ease the framing toward the box.
      let framing = morphing;
      if (!morphing) {
        const k = viewInit ? chase : 1;
        const eps = 1e-5 * Math.max(box[2] - box[0], box[3] - box[1], 1e-3);
        for (let i = 0; i < 4; i++) {
          const d = box[i] - viewBox[i];
          if (d === 0) continue;
          viewBox[i] = Math.abs(d) < eps ? box[i] : viewBox[i] + d * k;
          framing = true;
        }
        viewInit = true;
      }
      // The label: once a morph has landed (and the colours, gliding as long, with it), any edit
      // that moves away from the preset drops it; it shows over the morph's last 300 ms.
      if (labelCheck && !morphing && rt - morphEndAt > 0.35) {
        labelCheck = false;
        if (labelName && !presetHolds(labelName)) labelName = '';
      }
      const labelWanted = !capturing && labelName !== '' && P.presetLabel.value && viewInit && (!morphing || morphLen - morphT <= 0.3);
      if (labelWanted && !labelShown) showLabel();
      else if (!labelWanted && labelShown) hideLabel();
      const swaying = P.sway.value > 0 && dt > 0;
      // Nothing changed and nothing sways: leave the last frame on screen. WebGL keeps showing
      // it until we draw again, so a still leaf costs no GPU time (a constant heavy redraw
      // starved Chrome's own UI, which shares the GPU).
      if (!dirty && !framing && !swaying && !needsDraw && model.version === drawnVersion) return;
      needsDraw = false;
      drawnVersion = model.version;
      // Move on to the next buffer in the ring. New geometry goes in it; otherwise copy the
      // current geometry across if it holds an older generation.
      cur = (cur + 1) % RING;
      if (!geoUploaded || bufGen[cur] !== geoGen) {
        if (!geoUploaded) geoGen++;
        gl.bindBuffer(gl.ARRAY_BUFFER, vbos[cur]);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.verts, 0, Math.max(1, geo.count * STRIDE));
        bufGen[cur] = geoGen;
        geoUploaded = true;
      }
      buildInstances(cssW, cssH, t);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibos[cur]);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, instTotal * IFLOATS);

      fView[0] = cssW; fView[1] = cssH;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      // 1. Background.
      use(progBg);
      gl.bindVertexArray(vaoFull);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 2. The leaf (stem first).
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      use(progLeaf);
      gl.bindVertexArray(vaos[cur]);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibos[cur]);
      gl.uniform1f(progLeaf.uStemBase, 1);
      drawRun(geo.sprigStart[0], geo.sprigCount[0], 0, 1);
      gl.uniform1f(progLeaf.uStemBase, 0);
      gl.uniform1f(progLeaf.uPass, 0);
      stencilRef = 0;
      gl.stencilMask(0xff);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      // Behind everything, with the stem: the bud at its end, spur knobs, side-shoot axes and
      // pegs. Then each leaf, cluster and sheath whole, in the order shapes.js worked out (tree
      // order, overridden where something covers where another joins: see orderUnits).
      drawRun(geo.budStart[0], geo.budCount[0], 0, 1);
      drawRun(geo.pegStart, geo.pegCount, 0, 1);
      for (let k = 0; k < geo.nDraw; k++) {
        const kind = geo.drawKind[k], i = geo.drawIdx[k];
        if (kind === DRAW_LEAF) {
          if (geo.sprigPlace[i * 8 + 7] * leafGrow < 0.002) continue; // not grown in yet
          const v = geo.sprigPlace[i * 8], s0 = geo.leafSegStart[v];
          drawLeaf(v, 1 + i, s0, s0 + geo.leafSegCount[v]);
        } else if (kind === DRAW_CLUSTER) drawRun(geo.clStart[i], geo.clCount[i], 0, 1);
        else drawRun(geo.sheathStart[i], geo.sheathCount[i], 0, 1);
      }
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    },
  };
}
