// Foliage — a generative leaf designer laid out like a Morris wallpaper. Raw WebGL2.
//
// Each frame: ease the category morphs → rebuild leaf geometry if a shape param moved
// (shapes.js) → relax the packing, delete overlaps and grow the page outward from the key
// (physics.js) → write one instance per leaf → draw them onto the ground (shaders.js).
//
// The page has a life cycle: it grows outward from the key leaf at the centre until nothing
// more fits, then holds steady. If quick changes make it chaotic (many leaves deleted for
// overlapping) or sparse (many holes being refilled), everything but the key is cleared and
// the page grows again: a clean regrowth looks better than a mushy one.
//
// Params without `uniform: false` are auto-declared in every shader as u_<key>; f_* are
// per-frame values computed here. The frame allocates nothing.

import * as SH from './shaders.js';
import { buildShapes, geo, STRIDE, MAX_VERTS, MAX_PLACE } from './shapes.js';
import { bodies, world, step, setWorld, addBody, kill, keyIndex, liveCount, variantOf, flip, underside, bodyScale, sizeFor } from './physics.js';
import { rng } from '../../kit/random.js';

const MAX_INST = 8000, IFLOATS = 9;
const SELECTS = ['compound', 'outline', 'base', 'apex', 'lobing', 'margin', 'venation'];
// Params that change leaf or sprig geometry (selects in SELECTS morph and are tracked separately).
const GEOM_KEYS = [
  'seed', 'variants', 'variety', 'leaflets', 'leafletAngle', 'width', 'bend', 'sCurve', 'lobeDepth', 'lobes',
  'lobeSharpness', 'teeth', 'toothDepth', 'veinCount', 'veinAngle', 'veinCurve', 'veinWeight', 'midribWeight',
  'petioleLength', 'petioleFlat', 'petioleWing', 'stipules', 'veinlets', 'outlineWeight', 'wobble',
  'arrangement', 'nodes', 'divergence', 'decussate', 'whorlCount', 'internode', 'internodeTaper', 'bareStem',
  'insertion', 'tipInsertion', 'sizeGradient', 'stemWidth', 'stemTaper', 'stemCurve', 'stemDroop', 'zigzag', 'terminal',
];
const DEG = Math.PI / 180;

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P, model, degrade }) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const uniformParams = model.params.filter((p) => p.uniform !== false && p.type !== 'select');
  const geomParams = GEOM_KEYS.map((k) => {
    if (!P[k]) throw new Error('foliage: unknown geometry param ' + k);
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
  let progLeaf = null, vaoLeaf = null, vbo = null, ibo = null, noiseTex = null;
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
    return {
      prog, version: -1, fView: loc('f_view'), fPx: loc('f_px'), uNoise: loc('u_noise'),
      paramLocs: uniformParams.map((p) => loc('u_' + p.key)),
    };
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

  /** Tileable value-noise texture: R fine fbm, G broad fbm (line swelling and ink). */
  function buildNoise() {
    const S = 256, data = new Uint8Array(S * S * 4);
    const lat = new Float32Array(S * S);
    const r = rng(12.34);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const vn = (x, y, px, py) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
      const a = lat[y0 * S + x0], b = lat[y0 * S + x1], c = lat[y1 * S + x0], d = lat[y1 * S + x1];
      return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
    };
    const fbm = (u, v, base, oct) => {
      let s = 0, amp = 0.5, tot = 0, f = base;
      for (let o = 0; o < oct; o++) {
        s += amp * vn(u * f, v * f, f, f);
        tot += amp; amp *= 0.5; f *= 2;
      }
      return s / tot;
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, o = (y * S + x) * 4;
        data[o] = Math.round(255 * fbm(u, v, 8, 4));
        data[o + 1] = Math.round(255 * fbm(u, v, 4, 3));
        data[o + 3] = 255;
      }
    }
    noiseTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + UNIT_NOISE);
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  function buildAll() {
    progLeaf = program(SH.leafVert, SH.leafFrag, 'leaves');
    buildNoise();
    gl.useProgram(progLeaf.prog);
    gl.uniform1i(progLeaf.uNoise, UNIT_NOISE);
    vaoLeaf = gl.createVertexArray();
    gl.bindVertexArray(vaoLeaf);
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_VERTS * STRIDE * 4, gl.DYNAMIC_DRAW);
    const B = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, B, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, B, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, B, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, B, 32);
    ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INST * IFLOATS * 4, gl.DYNAMIC_DRAW);
    for (let a = 4; a <= 6; a++) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); }
    gl.bindVertexArray(null);
    geoUploaded = false;
    ready = true;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ready = false;
    progLeaf = vaoLeaf = vbo = ibo = noiseTex = null;
    degrade(0.6);
  });
  canvas.addEventListener('webglcontextrestored', buildAll);

  // ---- shapes and bodies
  let lastVersion = -1, lastSig = NaN, geoUploaded = false, lastRt = -1;
  let curKind = -1, growing = true, wasIsolated = false, fullFrames = 0;
  // Recent deletions and refills, decaying over ~1.5 s: how chaotic or holey the page is.
  let recentDeaths = 0, recentRefills = 0;
  const rand = rng(P.seed.value + 0.5);
  const opts = {
    rdt: 0, sdt: 0, t: 0, gap: 0, twist: 0, glide: 0, wind: 0, gusts: 0,
    flowAngle: 0, flowAlign: 0, gather: 0, iterations: 3, kind: 0, sizeVariance: 0, maxSize: 1, tries: 48,
    spawnBudget: 0, deaths: 0, placed: 0, saturated: false,
  };

  function rebuild() {
    buildShapes(P, blend, arrangementIndex());
    geoUploaded = false;
  }

  /** Clear everything but the key (or everything, with the key too) and grow again. */
  function regrow(withKey) {
    for (let i = 0; i < bodies.n; i++) if (withKey || !bodies.key[i]) kill(i);
    growing = true;
    fullFrames = 0;
    opts.spawnBudget = 0;
    recentDeaths = recentRefills = 0;
  }

  function manageBodies(cssW, cssH) {
    const kind = arrangementIndex() > 0 ? 1 : 0;
    const nv = kind ? geo.nSprig : geo.nLeaf;
    let bound = 0;
    for (let v = 0; v < nv; v++) bound = Math.max(bound, kind ? geo.sprigBound[v] : geo.leafBound[v]);
    const L = P.scale.value * Math.min(cssW, cssH);
    const maxSize = Math.exp(P.sizeVariance.value * 0.85);
    const breath = P.breathAmplitude.value;
    setWorld(cssW, cssH, bound * L * maxSize * (1 + breath) * 1.05 + 2, L, breath);
    opts.kind = kind; opts.maxSize = maxSize; opts.sizeVariance = P.sizeVariance.value;

    // A new kind (stem ↔ no stem) starts over, key and all.
    if (kind !== curKind) { regrow(true); curKind = kind; }
    if (keyIndex() < 0) {
      regrow(true);
      addBody(world.cx, world.cy, P.flowAngle.value * DEG, kind, rand(), 1, true, 0);
    }
    const iso = P.isolate.value;
    if (iso) regrow(false);
    else if (wasIsolated) regrow(false);
    wasIsolated = iso;
    // Size variance changes ease in rather than jump.
    for (let i = 0; i < bodies.n; i++) {
      if (bodies.dying[i] || bodies.key[i]) continue;
      bodies.size[i] += (sizeFor(bodies.seed[i], P.sizeVariance.value) - bodies.size[i]) * 0.08;
    }
  }

  // ---- instances: one per leaf, grouped by variant (WebGL2 has no base instance, so each
  // variant's run is bound at its own offset).
  const inst = new Float32Array(MAX_INST * IFLOATS);
  const leafCnt = new Int32Array(16), leafOff = new Int32Array(16), leafCur = new Int32Array(16);
  const stemCnt = new Int32Array(16), stemOff = new Int32Array(16), stemCur = new Int32Array(16);
  let instTotal = 0;

  function hashf(n) {
    n |= 0;
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }
  /** Which ink a leaf prints in: 0 surface, 1 autumn surface, +2 when underside up. */
  function toneFor(seed, k, under) {
    return (hashf(Math.floor(seed * 1e7) + k * 7919 + 11) < P.autumnShare.value ? 1 : 0) + (under ? 2 : 0);
  }
  function putInst(slot, a, b, c, d, tx, ty, seed, tone, fade) {
    const o = slot * IFLOATS;
    inst[o] = a; inst[o + 1] = b; inst[o + 2] = c; inst[o + 3] = d;
    inst[o + 4] = tx; inst[o + 5] = ty; inst[o + 6] = seed; inst[o + 7] = tone; inst[o + 8] = fade;
  }

  function buildInstances(t) {
    leafCnt.fill(0); stemCnt.fill(0);
    for (let i = 0; i < bodies.n; i++) {
      const v = variantOf(i);
      if (bodies.kind[i]) {
        if (v >= geo.nSprig) continue;
        stemCnt[v]++;
        const po = v * MAX_PLACE * 8;
        for (let p = 0; p < geo.sprigNPlace[v]; p++) leafCnt[geo.sprigPlace[po + p * 8]]++;
      } else if (v < geo.nLeaf) leafCnt[v]++;
    }
    let off = 0;
    for (let v = 0; v < 16; v++) { stemOff[v] = off; stemCur[v] = off; off += stemCnt[v]; }
    for (let v = 0; v < 16; v++) { leafOff[v] = off; leafCur[v] = off; off += leafCnt[v]; }
    instTotal = Math.min(off, MAX_INST);
    const freq = P.breathFrequency.value;
    for (let i = 0; i < bodies.n; i++) {
      const v = variantOf(i);
      const s = bodyScale(i, t, freq);
      const fl = flip(i), under = underside(i);
      const ca = Math.cos(bodies.a[i]), sa = Math.sin(bodies.a[i]);
      const m00 = ca * s, m10 = sa * s, m01 = -sa * s * fl, m11 = ca * s * fl;
      const seed = bodies.seed[i], fade = bodies.fade[i];
      if (bodies.kind[i]) {
        if (v >= geo.nSprig) continue;
        const px = geo.sprigPivot[v * 2], py = geo.sprigPivot[v * 2 + 1];
        const tx = bodies.x[i] - (m00 * px + m01 * py), ty = bodies.y[i] - (m10 * px + m11 * py);
        const ss = stemCur[v]++;
        if (ss < MAX_INST) putInst(ss, m00, m10, m01, m11, tx, ty, seed, 0, fade);
        const po = v * MAX_PLACE * 8;
        for (let p = 0; p < geo.sprigNPlace[v]; p++) {
          const o = po + p * 8, lv = geo.sprigPlace[o];
          const qa = geo.sprigPlace[o + 1], qb = geo.sprigPlace[o + 2], qc = geo.sprigPlace[o + 3], qd = geo.sprigPlace[o + 4];
          const qx = geo.sprigPlace[o + 5], qy = geo.sprigPlace[o + 6];
          const slot = leafCur[lv]++;
          if (slot >= MAX_INST) continue;
          // world = m · (Q · p + q) + t
          putInst(slot,
            m00 * qa + m01 * qb, m10 * qa + m11 * qb, m00 * qc + m01 * qd, m10 * qc + m11 * qd,
            m00 * qx + m01 * qy + tx, m10 * qx + m11 * qy + ty,
            hashf(Math.floor(seed * 1e7) + p * 131), toneFor(seed, p + 1, under), fade);
        }
      } else {
        if (v >= geo.nLeaf) continue;
        const px = geo.leafPivot[v * 2], py = geo.leafPivot[v * 2 + 1];
        const slot = leafCur[v]++;
        if (slot >= MAX_INST) continue;
        putInst(slot, m00, m10, m01, m11, bodies.x[i] - (m00 * px + m01 * py), bodies.y[i] - (m10 * px + m11 * py), seed, toneFor(seed, 0, under), fade);
      }
    }
  }

  function drawRuns(start, count, off, n) {
    if (n <= 0 || count <= 0) return;
    const n2 = Math.min(n, MAX_INST - off);
    if (n2 <= 0) return;
    const b = off * IFLOATS * 4;
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, IFLOATS * 4, b);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, IFLOATS * 4, b + 16);
    gl.vertexAttribPointer(6, 1, gl.FLOAT, false, IFLOATS * 4, b + 32);
    gl.drawArraysInstanced(gl.TRIANGLES, start, count, n2);
  }

  buildAll();

  return {
    resize(_w, _h, px) { fPx = px; },
    frame(t, dt, rt) {
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
      if (!geoUploaded) {
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.verts, 0, geo.count * STRIDE);
        geoUploaded = true;
      }

      // Bodies: relax, delete overlaps, grow outward from the key.
      manageBodies(cssW, cssH);
      opts.rdt = rdt; opts.sdt = dt; opts.t = t;
      opts.gap = P.gap.value * world.leafLen;
      opts.twist = P.twist.value; opts.glide = P.glide.value;
      world.mirrorShare = P.mirrorShare.value; world.undersideShare = P.turnovers.value;
      opts.wind = P.wind.value; opts.gusts = P.gusts.value;
      opts.flowAngle = P.flowAngle.value * DEG; opts.flowAlign = P.flowAlign.value; opts.gather = P.gather.value;
      if (!P.isolate.value) opts.spawnBudget = Math.min(opts.spawnBudget + P.cascade.value * rdt, 24);
      step(opts, rand);
      // Full once placement has failed several frames running (one miss can be bad luck).
      if (opts.saturated) { opts.spawnBudget = 0; if (++fullFrames >= 12) growing = false; }
      else if (opts.placed > 0) fullFrames = 0;
      // Chaos and sparseness (only once the page has finished growing): too many recent
      // deletions, or too many holes being refilled → clear back to the key and regrow.
      const decay = Math.exp(-rdt / 1.5);
      recentDeaths = recentDeaths * decay + opts.deaths;
      recentRefills = recentRefills * decay + (growing ? 0 : opts.placed);
      if (!growing) {
        const live = liveCount();
        if (recentDeaths > 0.2 * live + 2 || recentRefills > 0.3 * live + 3) regrow(false);
      }
      buildInstances(t);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, instTotal * IFLOATS);

      // Draw: stems first, then leaves, onto the ground colour.
      fView[0] = cssW; fView[1] = cssH;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const g = P.ground.rgb;
      gl.clearColor(g[0], g[1], g[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      use(progLeaf);
      gl.bindVertexArray(vaoLeaf);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
      for (let v = 0; v < geo.nSprig; v++) drawRuns(geo.sprigStart[v], geo.sprigCount[v], stemOff[v], stemCnt[v]);
      for (let v = 0; v < geo.nLeaf; v++) drawRuns(geo.leafStart[v], geo.leafCount[v], leafOff[v], leafCnt[v]);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    },
  };
}
