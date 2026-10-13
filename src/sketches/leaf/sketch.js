// Leaf — one leaf (or one sprig) centred on the screen, backlit on a light table. Raw WebGL2.
//
// Each frame: ease the category morphs → rebuild the geometry if a shape param moved
// (shapes.js, forked from Foliage) → fit it, tip up, to Scale × 90% of the short side →
// draw the mottled background, then the leaf (shaders.js). Nothing moves on its own, so a
// frame where nothing changed draws nothing and the last image stays on screen.
//
// Params without `uniform: false` are auto-declared in every shader as u_<key>; f_* are
// per-frame values computed here. The frame allocates nothing.

import * as SH from './shaders.js';
import { buildShapes, geo, STRIDE, MAX_PLACE, SEG_FILL, SEG_VEIN } from './shapes.js';
import { rng } from '../../kit/random.js';

const MAX_INST = MAX_PLACE + 1, IFLOATS = 6;
const SELECTS = ['compound', 'outline', 'base', 'apex', 'lobing', 'margin', 'venation'];
// Params that change the geometry (selects in SELECTS morph and are tracked separately).
const GEOM_KEYS = [
  'seed', 'leaflets', 'leafletAngle', 'width', 'bend', 'sCurve', 'lobeDepth', 'lobes', 'lobeSharpness',
  'teeth', 'toothDepth', 'veinCount', 'veinAngle', 'veinCurve', 'veinlets', 'veinWeight', 'midribWeight',
  'petioleLength', 'petioleFlat', 'petioleWing', 'stipules', 'outlineWeight', 'wobble',
  'arrangement', 'nodes', 'divergence', 'decussate', 'whorlCount', 'internode', 'internodeTaper', 'bareStem',
  'insertion', 'tipInsertion', 'sizeGradient', 'stemWidth', 'stemTaper', 'stemCurve', 'stemDroop', 'zigzag',
  'terminal', 'leafVariety',
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
    return { p, w };
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
  function arrangementIndex() { return P.arrangement.options.indexOf(P.arrangement.value); }

  // ---- GL plumbing
  let ready = false;
  let progBg = null, progLeaf = null, vaoLeaf = null, vaoFull = null, vbo = null, ibo = null;
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
      'uniform vec2 f_view;\nuniform float f_px;\n' +
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
    return { prog, version: -1, fView: loc('f_view'), fPx: loc('f_px'), uPass: loc('u_pass'), paramLocs: uniformParams.map((p) => loc('u_' + p.key)) };
  }
  function use(pr) {
    gl.useProgram(pr.prog);
    gl.uniform2fv(pr.fView, fView);
    gl.uniform1f(pr.fPx, fPx);
    if (pr.version !== model.version) {
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
    vaoLeaf = gl.createVertexArray();
    gl.bindVertexArray(vaoLeaf);
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const B = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, B, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, B, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, B, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, B, 32);
    ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
    gl.enableVertexAttribArray(4); gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5); gl.vertexAttribDivisor(5, 1);
    gl.bindVertexArray(null);
    geoUploaded = false;
    needsDraw = true;
    ready = true;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ready = false;
    progBg = progLeaf = vaoLeaf = vaoFull = vbo = ibo = null;
    degrade(0.6);
  });
  canvas.addEventListener('webglcontextrestored', buildAll);

  // ---- the object: bounds (leaf units, unrotated) of whatever is drawn
  let lastVersion = -1, lastSig = NaN, geoUploaded = false, lastRt = -1;
  // The leaf is still, so it's only drawn when something changes (see frame()).
  let needsDraw = true, drawnVersion = -1;
  let bx0 = 0, by0 = 0, bx1 = 1, by1 = 1;
  const leafBox = new Float32Array(16 * 4);

  function rebuild() {
    buildShapes(P, blend, arrangementIndex(), P.leafVariety.value);
    geoUploaded = false;
    // Each leaf variant's box, from its vertices.
    for (let v = 0; v < geo.nLeaf; v++) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = geo.leafStart[v]; i < geo.leafStart[v] + geo.leafCount[v]; i++) {
        const x = geo.verts[i * STRIDE], y = geo.verts[i * STRIDE + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      leafBox[v * 4] = x0; leafBox[v * 4 + 1] = y0; leafBox[v * 4 + 2] = x1; leafBox[v * 4 + 3] = y1;
    }
    if (geo.nSprig === 0) {
      bx0 = leafBox[0]; by0 = leafBox[1]; bx1 = leafBox[2]; by1 = leafBox[3];
      return;
    }
    // Sprig: the stem's vertices plus each placed leaf's box corners.
    bx0 = by0 = 1e9; bx1 = by1 = -1e9;
    for (let i = geo.sprigStart[0]; i < geo.sprigStart[0] + geo.sprigCount[0]; i++) grow(geo.verts[i * STRIDE], geo.verts[i * STRIDE + 1]);
    for (let p = 0; p < geo.sprigNPlace[0]; p++) {
      const o = p * 8, lv = geo.sprigPlace[o];
      const qa = geo.sprigPlace[o + 1], qb = geo.sprigPlace[o + 2], qc = geo.sprigPlace[o + 3], qd = geo.sprigPlace[o + 4];
      const qx = geo.sprigPlace[o + 5], qy = geo.sprigPlace[o + 6];
      for (let c = 0; c < 4; c++) {
        const x = leafBox[lv * 4 + (c & 1 ? 2 : 0)], y = leafBox[lv * 4 + (c & 2 ? 3 : 1)];
        grow(qa * x + qc * y + qx, qb * x + qd * y + qy);
      }
    }
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
  function buildInstances(cssW, cssH) {
    // Tip up, centred, the larger side of the box at Scale × 90% of the short side.
    const s = P.scale.value * 0.9 * Math.min(cssW, cssH) / Math.max(bx1 - bx0, by1 - by0, 1e-3);
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
    // m = R(−90°) · s: leaf +x (toward the tip) points up the screen.
    const m00 = 0, m10 = -s, m01 = s, m11 = 0;
    const tx = cssW / 2 - (m00 * cx + m01 * cy), ty = cssH / 2 - (m10 * cx + m11 * cy);
    if (geo.nSprig === 0) {
      stemInst = 0;
      putInst(0, m00, m10, m01, m11, tx, ty);
      instTotal = 1;
      return;
    }
    stemInst = 1;
    putInst(0, m00, m10, m01, m11, tx, ty);
    // In stem order (instance 1 + p), so later leaves cover earlier ones in a fixed order.
    instTotal = 1 + geo.sprigNPlace[0];
    for (let p = 0; p < geo.sprigNPlace[0]; p++) {
      const o = p * 8, lv = geo.sprigPlace[o];
      const qa = geo.sprigPlace[o + 1], qb = geo.sprigPlace[o + 2], qc = geo.sprigPlace[o + 3], qd = geo.sprigPlace[o + 4];
      const qx = geo.sprigPlace[o + 5], qy = geo.sprigPlace[o + 6];
      // world = m · (Q · p + q) + t
      putInst(1 + p,
        m00 * qa + m01 * qb, m10 * qa + m11 * qb, m00 * qc + m01 * qd, m10 * qc + m11 * qd,
        m00 * qx + m01 * qy + tx, m10 * qx + m11 * qy + ty);
    }
  }

  function drawRun(start, count, off, n) {
    if (n <= 0 || count <= 0) return;
    const b = off * IFLOATS * 4;
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, IFLOATS * 4, b);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, IFLOATS * 4, b + 16);
    gl.drawArraysInstanced(gl.TRIANGLES, start, count, n);
  }

  // One leaf instance, segment by segment. Each leaflet gets its own stencil value: its
  // fill writes it, its veins draw only where it's set, so veins never leave the blade.
  let stencilRef = 0;
  function drawLeaf(v, inst) {
    const b = inst * IFLOATS * 4;
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, IFLOATS * 4, b);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, IFLOATS * 4, b + 16);
    const s0 = geo.leafSegStart[v], s1 = s0 + geo.leafSegCount[v];
    for (let k = s0; k < s1; k++) {
      const start = geo.seg[k * 3], count = geo.seg[k * 3 + 1], mode = geo.seg[k * 3 + 2];
      if (mode === SEG_FILL) {
        if (++stencilRef > 255) { gl.clear(gl.STENCIL_BUFFER_BIT); stencilRef = 1; }
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.ALWAYS, stencilRef, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.drawArraysInstanced(gl.TRIANGLES, start, count, 1);
      } else if (mode === SEG_VEIN) {
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.EQUAL, stencilRef, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.uniform1f(progLeaf.uPass, 1);
        gl.drawArraysInstanced(gl.TRIANGLES, start, count, 1);
        gl.uniform1f(progLeaf.uPass, 2);
        gl.drawArraysInstanced(gl.TRIANGLES, start, count, 1);
        gl.uniform1f(progLeaf.uPass, 0);
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
    frame(_t, _dt, rt) {
      if (!ready) return;
      let rdt = lastRt < 0 ? 1 / 60 : rt - lastRt;
      if (rdt < 0 || rdt > 0.1) rdt = 1 / 60;
      lastRt = rt;
      const cssW = canvas.width / fPx, cssH = canvas.height / fPx;

      // Shapes: rebuild when a category is morphing or a shape param moved.
      let dirty = easeBlends(rdt);
      if (model.version !== lastVersion) {
        lastVersion = model.version;
        const s = geomSig();
        if (s !== lastSig) { lastSig = s; dirty = true; }
      }
      if (dirty) rebuild();
      // Nothing changed: leave the last frame on screen. WebGL keeps showing it until we draw
      // again, so a still leaf costs no GPU time (a constant redraw starved Chrome's own UI,
      // which shares the GPU).
      if (!dirty && !needsDraw && model.version === drawnVersion) return;
      needsDraw = false;
      drawnVersion = model.version;
      if (!geoUploaded) {
        // bufferData, not bufferSubData: fresh storage, so the upload never waits for the
        // GPU to finish drawing from the old geometry (that stalled the whole browser).
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, geo.verts, gl.DYNAMIC_DRAW, 0, Math.max(1, geo.count * STRIDE));
        geoUploaded = true;
      }
      buildInstances(cssW, cssH);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ARRAY_BUFFER, inst, gl.DYNAMIC_DRAW, 0, instTotal * IFLOATS);

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
      if (stemInst) drawRun(geo.sprigStart[0], geo.sprigCount[0], 0, 1);
      gl.uniform1f(progLeaf.uPass, 0);
      stencilRef = 0;
      gl.clear(gl.STENCIL_BUFFER_BIT);
      if (stemInst) {
        // Sprig leaves one at a time, tip first, so leaves nearer the base cover those above.
        for (let p = geo.sprigNPlace[0] - 1; p >= 0; p--) drawLeaf(geo.sprigPlace[p * 8], 1 + p);
      } else drawLeaf(0, 0);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    },
  };
}
