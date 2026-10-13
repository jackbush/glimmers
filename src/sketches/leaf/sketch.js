// Leaf — one leaf (or one sprig) centred on the screen, backlit on a light table. Raw WebGL2.
//
// Each frame: ease the category morphs and every shape number toward the params → rebuild
// the geometry while anything is still easing (shapes.js) → ease the
// framing (tip up, Scale × 90% of the short side) → sway → draw the paper, then the leaf
// (shaders.js). With Sway at 0 and nothing changing, a frame draws nothing and the last
// image stays on screen.
//
// Smooth morphs: shape numbers are eased copies (counts go fractional, and shapes.js grows
// the newest node, leaflet pair or vein in as the fraction rises); categories, including
// arrangement, terminal and bud type, are eased weights; each leaf has a presence and is
// scaled about where it attaches, so leaves grow out of and shrink back into the stem.
// Presets instead morph on one clock: see beginMorph.
//
// Params without `uniform: false` are auto-declared in every shader as u_<key>; f_* are
// per-frame values computed here. The frame allocates nothing.

import * as SH from './shaders.js';
import { buildShapes, geo, STRIDE, MAX_VERTS, MAX_PLACE, SEG_FILL, SEG_VEIN } from './shapes.js';
import { rng } from '../../kit/random.js';

const MAX_INST = MAX_PLACE + 1, IFLOATS = 6;
const SELECTS = ['compound', 'outline', 'base', 'apex', 'lobing', 'margin', 'venation', 'arrangement', 'terminal', 'budType'];
// Params that change the geometry (selects in SELECTS morph and are tracked separately).
const GEOM_KEYS = [
  'seed', 'leaflets', 'leafletAngle', 'width', 'bend', 'sCurve', 'lobeDepth', 'lobes', 'lobeSharpness',
  'teeth', 'toothDepth', 'veinCount', 'veinAngle', 'veinCurve', 'veinlets', 'veinWeight', 'midribWeight',
  'petioleLength', 'petioleFlat', 'petioleWing', 'stipules', 'outlineWeight', 'wobble',
  'arrangement', 'nodes', 'divergence', 'decussate', 'whorlCount', 'internode', 'internodeTaper', 'bareStem',
  'insertion', 'tipInsertion', 'sizeGradient', 'stemWidth', 'stemTaper', 'stemCurve', 'stemDroop', 'zigzag',
  'terminal', 'budType', 'budSize', 'budStem', 'leafVariety',
];

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P, model, degrade }) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: true,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const uniformParams = model.params.filter((p) => p.uniform !== false && p.type !== 'select');
  const geomParams = GEOM_KEYS.map((k) => {
    if (!P[k]) throw new Error('leaf: unknown geometry param ' + k);
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
    return { p, w, from: new Float32Array(w.length) };
  });
  function easeBlends(rdt) {
    const k = P.morph.value > 0 ? 1 - Math.exp(-rdt * 4.6 / P.morph.value) : 1;
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
    const e = { p, target, value: 0, from: 0, to: 0, eps };
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
  let easedInit = false;
  function easeNumbers(rdt) {
    const k = P.morph.value > 0 ? 1 - Math.exp(-rdt * 4.6 / P.morph.value) : 1;
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
  let morphLen = 0, morphT = 0, morphSig = NaN, morphPending = -1;
  const viewFrom = new Float32Array(4), viewTo = new Float32Array(4);
  const smooth01 = (x) => x * x * (3 - 2 * x);
  function beginMorph(seconds) {
    for (let i = 0; i < eased.length; i++) { const e = eased[i]; e.from = e.value; e.to = e.target(); }
    for (let b = 0; b < blendList.length; b++) blendList[b].from.set(blendList[b].w);
    // The end: build the final shape once and measure its box.
    for (let i = 0; i < eased.length; i++) eased[i].value = eased[i].to;
    for (let b = 0; b < blendList.length; b++) {
      const { p, w } = blendList[b];
      w.fill(0);
      w[p.options.indexOf(p.value)] = 1;
    }
    rebuild();
    viewTo[0] = bx0; viewTo[1] = by0; viewTo[2] = bx1; viewTo[3] = by1;
    // Back to the start; the frame rebuilds from there.
    for (let i = 0; i < eased.length; i++) eased[i].value = eased[i].from;
    for (let b = 0; b < blendList.length; b++) blendList[b].w.set(blendList[b].from);
    viewFrom.set(viewBox);
    morphLen = seconds; morphT = 0; morphSig = geomSig();
  }
  /** Advance the morph; returns false once it has landed (or was cut short). */
  function stepMorph(rdt) {
    if (geomSig() !== morphSig) { morphLen = 0; return false; }
    morphT = Math.min(morphLen, morphT + rdt);
    const k = morphT >= morphLen ? 1 : smooth01(morphT / morphLen);
    for (let i = 0; i < eased.length; i++) { const e = eased[i]; e.value = k === 1 ? e.to : e.from + (e.to - e.from) * k; }
    for (let b = 0; b < blendList.length; b++) {
      const { w, from, p } = blendList[b];
      const ti = p.options.indexOf(p.value);
      for (let i = 0; i < w.length; i++) w[i] = from[i] + ((i === ti ? 1 : 0) - from[i]) * k;
    }
    for (let i = 0; i < 4; i++) viewBox[i] = viewFrom[i] + (viewTo[i] - viewFrom[i]) * k;
    if (morphT >= morphLen) morphLen = 0;
    return true;
  }

  // ---- GL plumbing
  let ready = false;
  let progBg = null, progLeaf = null, vaoLeaf = null, vaoFull = null, vbo = null, ibo = null;
  // Geometry uploads rotate through RING fixed-size buffers (each with its own VAO). The GPU
  // runs a few frames behind, so writing a buffer it may still be reading made the driver
  // copy or wait (up to half a second, once per morph); reallocating each time did too.
  const RING = 2;
  const vbos = [null, null], vaos = [null, null], ibos = [null, null];
  let cur = 0;
  const UNIT_NOISE = 0;
  const fView = new Float32Array(2);
  let fPx = 1;

  function compile(type, src, name) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader "' + name + '" failed to compile:\n' + log);
    }
    return sh;
  }
  function header() {
    return '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n' +
      'uniform vec2 f_view;\nuniform float f_px;\nuniform float u_style;\n' +
      uniformParams.map((p) => 'uniform ' + (p.type === 'color' ? 'vec3' : 'float') + ' u_' + p.key + ';').join('\n') + '\n';
  }
  function program(vsBody, fsBody, name) {
    const head = header();
    const vs = compile(gl.VERTEX_SHADER, head + vsBody, name + ' vert');
    const fs = compile(gl.FRAGMENT_SHADER, head + fsBody, name);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('Program "' + name + '" failed to link:\n' + gl.getProgramInfoLog(prog));
    }
    const loc = (n) => gl.getUniformLocation(prog, n);
    gl.useProgram(prog);
    gl.uniform1i(loc('u_noise'), UNIT_NOISE);
    return { prog, version: -1, fView: loc('f_view'), fPx: loc('f_px'), uPass: loc('u_pass'), uStemBase: loc('u_stemBase'), uStyle: loc('u_style'), paramLocs: uniformParams.map((p) => loc('u_' + p.key)) };
  }
  function use(pr) {
    gl.useProgram(pr.prog);
    gl.uniform2fv(pr.fView, fView);
    gl.uniform1f(pr.fPx, fPx);
    if (pr.version !== model.version) {
      gl.uniform1f(pr.uStyle, P.style.options.indexOf(P.style.value));
      for (let i = 0; i < uniformParams.length; i++) {
        const p = uniformParams[i], l = pr.paramLocs[i];
        if (p.type === 'color') gl.uniform3fv(l, p.rgb);
        else gl.uniform1f(l, p.type === 'bool' ? (p.value ? 1 : 0) : p.value);
      }
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
    progBg = program(SH.vertFull, SH.background, 'background');
    progLeaf = program(SH.leafVert, SH.leafFrag, 'leaf');
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
    vaoLeaf = vaos[0]; vbo = vbos[0]; ibo = ibos[0];
    geoUploaded = false;
    bufGen.fill(-1);
    needsDraw = true;
    ready = true;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ready = false;
    progBg = progLeaf = vaoLeaf = vaoFull = vbo = ibo = null;
    for (let k = 0; k < RING; k++) vbos[k] = vaos[k] = ibos[k] = null;
    degrade(0.6);
  });
  canvas.addEventListener('webglcontextrestored', buildAll);

  // ---- the object: bounds (leaf units, unrotated) of whatever is drawn
  let lastVersion = -1, lastSig = NaN, geoUploaded = false, lastRt = -1;
  // Which geometry generation each buffer of the pair holds.
  let geoGen = 0;
  const bufGen = new Int32Array([-1, -1]);
  // The leaf is still, so it's only drawn when something changes (see frame()).
  let needsDraw = true, drawnVersion = -1;
  let bx0 = 0, by0 = 0, bx1 = 1, by1 = 1;
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
    // The stem's vertices plus each placed leaf's box corners (at its presence).
    bx0 = by0 = 1e9; bx1 = by1 = -1e9;
    for (let i = geo.sprigStart[0]; i < geo.budStart[0] + geo.budCount[0]; i++) grow(geo.verts[i * STRIDE], geo.verts[i * STRIDE + 1]);
    for (let p = 0; p < geo.sprigNPlace[0]; p++) {
      placed(p, 0);
      const lv = geo.sprigPlace[p * 8];
      for (let c = 0; c < 4; c++) {
        const x = leafBox[lv * 4 + (c & 1 ? 2 : 0)], y = leafBox[lv * 4 + (c & 2 ? 3 : 1)];
        grow(pa * x + pc * y + px, pb * x + pd * y + py);
      }
    }
    if (bx0 > bx1) { bx0 = by0 = 0; bx1 = by1 = 1; }
  }
  // Placement p's transform (leaf coords → sprig coords), scaled about where the leaf
  // attaches by its presence (so it grows from the stem) and swayed by angle th about the
  // same point. Into pa…pd (column-major mat2), px, py.
  let pa = 1, pb = 0, pc = 0, pd = 1, px = 0, py = 0;
  function placed(p, th) {
    const o = p * 8, lv = geo.sprigPlace[o];
    const qa = geo.sprigPlace[o + 1], qb = geo.sprigPlace[o + 2], qc = geo.sprigPlace[o + 3], qd = geo.sprigPlace[o + 4];
    const qx = geo.sprigPlace[o + 5], qy = geo.sprigPlace[o + 6], pres = geo.sprigPlace[o + 7];
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
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }

  // ---- instances: the sprig's stem first, then its leaves in stem order.
  const inst = new Float32Array(MAX_INST * IFLOATS);
  let stemInst = 0, instTotal = 0;
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
    stemInst = 1;
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
  function drawLeaf(v, inst) {
    const b = inst * IFLOATS * 4;
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, IFLOATS * 4, b);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, IFLOATS * 4, b + 16);
    const s0 = geo.leafSegStart[v], s1 = s0 + geo.leafSegCount[v];
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

  buildAll();

  return {
    resize(_w, _h, px) { fPx = px; needsDraw = true; },
    // Started on the next frame, from whatever is on screen then (0 = jump straight there).
    morph(seconds) { morphPending = seconds; morphLen = 0; },
    frame(t, dt, rt) {
      if (!ready) return;
      let rdt = lastRt < 0 ? 1 / 60 : rt - lastRt;
      if (rdt < 0 || rdt > 0.1) rdt = 1 / 60;
      lastRt = rt;
      const cssW = canvas.width / fPx, cssH = canvas.height / fPx;

      // Shapes: rebuild while a category or a shape number is still easing.
      if (morphPending >= 0) {
        if (morphPending > 0 && easedInit && viewInit) beginMorph(morphPending);
        morphPending = -1;
      }
      const morphing = morphLen > 0 && stepMorph(rdt);
      let dirty = morphing;
      if (!morphing) {
        if (easeBlends(rdt)) dirty = true;
        if (easeNumbers(rdt)) dirty = true;
      }
      if (model.version !== lastVersion) {
        lastVersion = model.version;
        const s = geomSig();
        if (s !== lastSig) { lastSig = s; dirty = true; }
      }
      if (dirty) rebuild();
      // Ease the framing toward the box.
      let framing = morphing;
      if (!morphing) {
        const k = !viewInit ? 1 : P.morph.value > 0 ? 1 - Math.exp(-rdt * 4.6 / P.morph.value) : 1;
        const tb0 = bx0, tb1 = by0, tb2 = bx1, tb3 = by1;
        const eps = 1e-5 * Math.max(bx1 - bx0, by1 - by0, 1e-3);
        for (let i = 0; i < 4; i++) {
          const target = i === 0 ? tb0 : i === 1 ? tb1 : i === 2 ? tb2 : tb3;
          const d = target - viewBox[i];
          if (d === 0) continue;
          viewBox[i] = Math.abs(d) < eps ? target : viewBox[i] + d * k;
          framing = true;
        }
        viewInit = true;
      }
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
      vaoLeaf = vaos[cur]; vbo = vbos[cur]; ibo = ibos[cur];
      if (!geoUploaded || bufGen[cur] !== geoGen) {
        if (!geoUploaded) geoGen++;
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.verts, 0, Math.max(1, geo.count * STRIDE));
        bufGen[cur] = geoGen;
        geoUploaded = true;
      }
      buildInstances(cssW, cssH, t);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
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
      gl.bindVertexArray(vaoLeaf);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
      gl.uniform1f(progLeaf.uStemBase, 1);
      if (stemInst) drawRun(geo.sprigStart[0], geo.sprigCount[0], 0, 1);
      gl.uniform1f(progLeaf.uStemBase, 0);
      gl.uniform1f(progLeaf.uPass, 0);
      stencilRef = 0;
      gl.stencilMask(0xff);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      if (stemInst) {
        // Sprig leaves one at a time, tip first, so leaves nearer the base cover those above.
        // The bud is the end of the stem: drawn first, under every leaf.
        drawRun(geo.budStart[0], geo.budCount[0], 0, 1);
        for (let p = geo.sprigNPlace[0] - 1; p >= 0; p--) {
          if (geo.sprigPlace[p * 8 + 7] < 0.002) continue; // not grown in yet
          drawLeaf(geo.sprigPlace[p * 8], 1 + p);
        }
      }
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    },
  };
}
