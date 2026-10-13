// Foliage — a generative leaf designer laid out like a Morris wallpaper. Raw WebGL2.
//
// Each frame: ease the category morphs → rebuild leaf geometry if a shape param moved
// (shapes.js) → keep the right number of leaves on the page and relax their packing
// (physics.js) → write one instance per leaf → draw (shaders.js): leaves into a texture,
// a blurred copy for the shadow, then the paper composite.
//
// Params without `uniform: false` are auto-declared in every shader as u_<key>; f_* are
// per-frame values computed here. The frame allocates nothing.

import * as SH from './shaders.js';
import { buildShapes, geo, STRIDE, MAX_VERTS, MAX_PLACE } from './shapes.js';
import { bodies, world, step, sumPen, setWorld, addBody, findSpawn, spawnX, spawnY, variantOf, mirrored, bodyScale, sizeFor, MAX_BODIES } from './physics.js';
import { rng } from '../../kit/random.js';

const MAX_INST = 8000, IFLOATS = 8;
const SELECTS = ['compound', 'outline', 'base', 'apex', 'lobing', 'margin', 'venation'];
// Params that change leaf or sprig geometry (selects in SELECTS morph and are tracked separately).
const GEOM_KEYS = [
  'seed', 'variants', 'variety', 'leaflets', 'leafletAngle', 'width', 'bend', 'sCurve', 'lobeDepth', 'lobes',
  'lobeSharpness', 'teeth', 'toothDepth', 'veinCount', 'veinAngle', 'veinCurve', 'veinWeight', 'midribWeight',
  'petioleLength', 'petioleFlat', 'petioleWing', 'stipules', 'hairiness', 'turnovers', 'outlineWeight', 'wobble',
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
  let progLeaf = null, progBlur = null, progComp = null;
  let vaoLeaf = null, vaoFull = null, vbo = null, ibo = null, noiseTex = null;
  let leafTex = null, leafFbo = null, blurTexA = null, blurTexB = null, blurFboA = null, blurFboB = null;
  let leafW = 0, leafH = 0, blurW = 0, blurH = 0;
  const UNIT_NOISE = 0, UNIT_LEAVES = 1, UNIT_BLUR_A = 2, UNIT_BLUR_B = 3;
  const fView = new Float32Array(2), fLight = new Float32Array(2), fShadow = new Float32Array(2);
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
      'uniform vec2 u_res;\nuniform vec2 f_view;\nuniform float f_px;\nuniform vec2 f_light;\nuniform vec2 f_shadow;\n' +
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
      prog, version: -1,
      uRes: loc('u_res'), fView: loc('f_view'), fPx: loc('f_px'), fLight: loc('f_light'), fShadow: loc('f_shadow'),
      uSrc: loc('u_src'), uDir: loc('u_dir'), uChan: loc('u_chan'),
      paramLocs: uniformParams.map((p) => loc('u_' + p.key)),
      prog_noise: loc('u_noise'), prog_leaves: loc('u_leaves'), prog_shadow: loc('u_shadowTex'),
    };
  }
  function use(pr, w, h) {
    gl.useProgram(pr.prog);
    gl.uniform2f(pr.uRes, w, h);
    gl.uniform2fv(pr.fView, fView);
    gl.uniform1f(pr.fPx, fPx);
    gl.uniform2fv(pr.fLight, fLight);
    gl.uniform2fv(pr.fShadow, fShadow);
    if (pr.version !== model.version) {
      for (let i = 0; i < uniformParams.length; i++) {
        const p = uniformParams[i], l = pr.paramLocs[i];
        if (p.type === 'color') gl.uniform3fv(l, p.rgb);
        else gl.uniform1f(l, p.type === 'bool' ? (p.value ? 1 : 0) : p.value);
      }
      pr.version = model.version;
    }
  }

  function makeTex(unit, filter, wrap) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t; // stays bound to its own unit
  }

  /** Tileable value-noise texture: R fine fbm, G broad fbm, B stretched fibre, A white. */
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
    const fbm = (u, v, base, oct, sx) => {
      let s = 0, amp = 0.5, tot = 0, f = base;
      for (let o = 0; o < oct; o++) {
        s += amp * vn(u * f * sx, v * f, Math.max(1, Math.round(f * sx)), f);
        tot += amp; amp *= 0.5; f *= 2;
      }
      return s / tot;
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S, o = (y * S + x) * 4;
        data[o] = Math.round(255 * fbm(u, v, 8, 4, 1));
        data[o + 1] = Math.round(255 * fbm(u, v, 4, 3, 1));
        data[o + 2] = Math.round(255 * fbm(u, v, 16, 3, 0.25));
        data[o + 3] = Math.round(255 * r());
      }
    }
    noiseTex = makeTex(UNIT_NOISE, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  function sizeTargets() {
    const w = canvas.width, h = canvas.height;
    if (w !== leafW || h !== leafH) {
      leafW = w; leafH = h;
      gl.activeTexture(gl.TEXTURE0 + UNIT_LEAVES);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    const bw = Math.max(1, Math.ceil(w / 4)), bh = Math.max(1, Math.ceil(h / 4));
    if (bw !== blurW || bh !== blurH) {
      blurW = bw; blurH = bh;
      gl.activeTexture(gl.TEXTURE0 + UNIT_BLUR_A);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.activeTexture(gl.TEXTURE0 + UNIT_BLUR_B);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }
  function fboFor(tex) {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return f;
  }

  function buildAll() {
    progLeaf = program(SH.leafVert, SH.leafFrag, 'leaves');
    progBlur = program(SH.vertFull, SH.blur, 'blur');
    progComp = program(SH.vertFull, SH.composite, 'composite');
    buildNoise();
    leafTex = makeTex(UNIT_LEAVES, gl.LINEAR, gl.CLAMP_TO_EDGE);
    blurTexA = makeTex(UNIT_BLUR_A, gl.LINEAR, gl.CLAMP_TO_EDGE);
    blurTexB = makeTex(UNIT_BLUR_B, gl.LINEAR, gl.CLAMP_TO_EDGE);
    leafW = leafH = blurW = blurH = 0;
    sizeTargets();
    leafFbo = fboFor(leafTex);
    blurFboA = fboFor(blurTexA);
    blurFboB = fboFor(blurTexB);
    gl.useProgram(progLeaf.prog); gl.uniform1i(progLeaf.prog_noise, UNIT_NOISE);
    gl.useProgram(progComp.prog);
    gl.uniform1i(progComp.prog_noise, UNIT_NOISE);
    gl.uniform1i(progComp.prog_leaves, UNIT_LEAVES);
    gl.uniform1i(progComp.prog_shadow, UNIT_BLUR_B);

    vaoFull = gl.createVertexArray();
    vaoLeaf = gl.createVertexArray();
    gl.bindVertexArray(vaoLeaf);
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_VERTS * STRIDE * 4, gl.DYNAMIC_DRAW);
    const B = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, B, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, B, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, B, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, B, 32);
    ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INST * IFLOATS * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(4); gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5); gl.vertexAttribDivisor(5, 1);
    gl.bindVertexArray(null);
    geoUploaded = false;
    ready = true;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ready = false;
    progLeaf = progBlur = progComp = null;
    vaoLeaf = vaoFull = vbo = ibo = noiseTex = null;
    leafTex = leafFbo = blurTexA = blurTexB = blurFboA = blurFboB = null;
    degrade(0.6);
  });
  canvas.addEventListener('webglcontextrestored', buildAll);

  // ---- shapes and bodies
  let lastVersion = -1, lastSig = NaN, geoUploaded = false, lastRt = -1, firstSpawn = true;
  let curKind = 0;
  let crowd = 1, pressure = 0, calm = 0, lastFill = -1, lastScale = -1;
  const rand = rng(P.seed.value + 0.5);
  const opts = {
    rdt: 0, sdt: 0, t: 0, gap: 0, twist: 0, glide: 0, share: 0, wind: 0, windAngle: 0, gusts: 0,
    flowAngle: 0, flowAlign: 0, iterations: 3, settle: false,
  };

  function rebuild() {
    buildShapes(P, blend, arrangementIndex());
    geoUploaded = false;
  }

  function manageBodies(cssW, cssH) {
    const kind = arrangementIndex() > 0 ? 1 : 0;
    const nv = kind ? geo.nSprig : geo.nLeaf;
    let area = 0, bound = 0;
    for (let v = 0; v < nv; v++) {
      // The gap rings every circle, so small circles cost relatively more room.
      const g = 1 + P.gap.value / (2 * Math.max(0.02, kind ? geo.sprigRad[v] : geo.leafRad[v]));
      area += (kind ? geo.sprigFoot[v] : geo.leafFoot[v]) * g * g;
      bound = Math.max(bound, kind ? geo.sprigBound[v] : geo.leafBound[v]);
    }
    area /= Math.max(1, nv);
    const L = P.scale.value * Math.min(cssW, cssH);
    const sv = P.sizeVariance.value * 0.85;
    const maxSize = Math.exp(sv);
    setWorld(cssW, cssH, bound * L * maxSize * 1.05 + 2, L);
    const meanSq = sv > 1e-4 ? Math.sinh(2 * sv) / (2 * sv) : 1;
    // Fill is the share of the page in ink. Shapes that can't pack that tightly push back
    // (overlap that the relaxation can't clear), and `crowd` thins them until they fit.
    const target = Math.max(1, Math.min(MAX_BODIES - 150, Math.round(crowd * P.fill.value * world.W * world.H / (L * L * meanSq * Math.max(area, 1e-3)))));

    // Swap kinds (stem ↔ no stem): the old set fades while the new one grows.
    if (kind !== curKind) {
      for (let i = 0; i < bodies.n; i++) bodies.dying[i] = 1;
      curKind = kind;
      calm = 3;
    }
    let live = 0;
    for (let i = 0; i < bodies.n; i++) {
      if (bodies.dying[i]) continue;
      live++;
      // Size variance changes ease in rather than jump.
      const ts = sizeFor(bodies.seed[i], P.sizeVariance.value);
      bodies.size[i] += (ts - bodies.size[i]) * 0.08;
    }
    if (live < target) {
      const add = firstSpawn ? target - live : Math.min(target - live, 6);
      for (let k = 0; k < add; k++) {
        findSpawn(rand);
        const seed = rand();
        const a = P.flowAngle.value * DEG + (rand() * 2 - 1) * Math.PI * (1 - P.flowAlign.value * 0.6);
        addBody(spawnX, spawnY, a, kind, seed, sizeFor(seed, P.sizeVariance.value), 0);
      }
    } else if (live > target) {
      let drop = Math.min(live - target, 6);
      for (let i = bodies.n - 1; i >= 0 && drop > 0; i--) {
        if (!bodies.dying[i]) { bodies.dying[i] = 1; drop--; }
      }
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
  function toneFor(seed, k) {
    const si = Math.floor(seed * 1e7) + k * 7919;
    if (hashf(si + 11) < P.accentShare.value) return 3;
    return Math.min(2, Math.floor(hashf(si + 23) * 3));
  }
  function putInst(slot, a, b, c, d, tx, ty, seed, tone) {
    const o = slot * IFLOATS;
    inst[o] = a; inst[o + 1] = b; inst[o + 2] = c; inst[o + 3] = d;
    inst[o + 4] = tx; inst[o + 5] = ty; inst[o + 6] = seed; inst[o + 7] = tone;
  }

  function buildInstances() {
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
    const share = P.mirrorShare.value;
    for (let i = 0; i < bodies.n; i++) {
      const v = variantOf(i);
      const s = bodyScale(i);
      const fl = mirrored(i, share) ? -1 : 1;
      const ca = Math.cos(bodies.a[i]), sa = Math.sin(bodies.a[i]);
      const m00 = ca * s, m10 = sa * s, m01 = -sa * s * fl, m11 = ca * s * fl;
      const seed = bodies.seed[i];
      if (bodies.kind[i]) {
        if (v >= geo.nSprig) continue;
        const px = geo.sprigPivot[v * 2], py = geo.sprigPivot[v * 2 + 1];
        const tx = bodies.x[i] - (m00 * px + m01 * py), ty = bodies.y[i] - (m10 * px + m11 * py);
        const ss = stemCur[v]++;
        if (ss < MAX_INST) putInst(ss, m00, m10, m01, m11, tx, ty, seed, 0);
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
            hashf(Math.floor(seed * 1e7) + p * 131), toneFor(seed, p + 1));
        }
      } else {
        if (v >= geo.nLeaf) continue;
        const px = geo.leafPivot[v * 2], py = geo.leafPivot[v * 2 + 1];
        const slot = leafCur[v]++;
        if (slot >= MAX_INST) continue;
        putInst(slot, m00, m10, m01, m11, bodies.x[i] - (m00 * px + m01 * py), bodies.y[i] - (m10 * px + m11 * py), seed, toneFor(seed, 0));
      }
    }
  }

  function drawRuns(start, count, off, n) {
    if (n <= 0 || count <= 0) return;
    const n2 = Math.min(n, MAX_INST - off);
    if (n2 <= 0) return;
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, IFLOATS * 4, off * IFLOATS * 4);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, IFLOATS * 4, off * IFLOATS * 4 + 16);
    gl.drawArraysInstanced(gl.TRIANGLES, start, count, n2);
  }

  function blurPass(fbo, srcUnit, dx, dy, chanA) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, blurW, blurH);
    use(progBlur, blurW, blurH);
    gl.uniform1i(progBlur.uSrc, srcUnit);
    gl.uniform2f(progBlur.uDir, dx, dy);
    gl.uniform4f(progBlur.uChan, chanA ? 0 : 1, 0, 0, chanA ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  buildAll();

  return {
    resize(_w, _h, px) {
      fPx = px;
      if (ready) sizeTargets();
    },
    frame(t, dt, rt) {
      if (!ready) return;
      let rdt = lastRt < 0 ? 1 / 60 : rt - lastRt;
      if (rdt < 0 || rdt > 0.1) rdt = 1 / 60;
      lastRt = rt;
      const cssW = canvas.width / fPx, cssH = canvas.height / fPx;

      // Shapes: rebuild when a category is morphing or a shape param moved.
      const morphing = easeBlends(rdt);
      let dirty = morphing;
      if (model.version !== lastVersion) {
        lastVersion = model.version;
        const s = geomSig();
        if (s !== lastSig) { lastSig = s; dirty = true; }
      }
      if (dirty) { rebuild(); calm = 2.5; }
      if (!geoUploaded) {
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.verts, 0, geo.count * STRIDE);
        geoUploaded = true;
      }

      // Bodies.
      manageBodies(cssW, cssH);
      opts.rdt = rdt; opts.sdt = dt; opts.t = t;
      opts.gap = P.gap.value * world.leafLen;
      opts.twist = P.twist.value; opts.glide = P.glide.value; opts.share = P.mirrorShare.value;
      opts.wind = P.wind.value; opts.windAngle = P.windAngle.value * DEG; opts.gusts = P.gusts.value;
      opts.flowAngle = P.flowAngle.value * DEG; opts.flowAlign = P.flowAlign.value;
      if (firstSpawn) {
        // Settle before the first frame: everything grows in from nothing together, so
        // leaves push each other aside instead of starting tangled.
        opts.settle = true; opts.iterations = 1; opts.rdt = 1 / 200;
        for (let k = 0; k < 260; k++) step(opts);
        opts.settle = false; opts.iterations = 3; opts.rdt = rdt;
        firstSpawn = false;
      }
      step(opts);
      // Crowding: smoothed overlap per leaf, as a share of the gap. Sustained pressure thins
      // the page a little at a time; once it's comfortable, crowd recovers slowly. Changing
      // Fill or Scale starts over from the user's number. Just after any change the leaves
      // are still gliding apart, so pressure isn't measured until things calm down.
      if (P.fill.value !== lastFill || P.scale.value !== lastScale) { crowd = 1; lastFill = P.fill.value; lastScale = P.scale.value; calm = 2.5; }
      calm -= rdt;
      if (calm > 0) pressure = 0;
      const per = sumPen / Math.max(1, bodies.n) / Math.max(1, opts.gap);
      if (calm <= 0) pressure += (per - pressure) * (1 - Math.exp(-rdt / 0.6));
      if (pressure > 0.25 && per > 0.25) crowd = Math.max(0.2, crowd * (1 - 0.3 * rdt));
      else if (pressure < 0.05 && crowd < 1) crowd = Math.min(1, crowd * (1 + 0.02 * rdt));
      buildInstances();
      gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, instTotal * IFLOATS);

      // Per-frame values.
      fView[0] = cssW; fView[1] = cssH;
      const la = P.lightAngle.value * DEG;
      fLight[0] = Math.cos(la); fLight[1] = Math.sin(la);
      const so = P.shadowOffset.value;
      fShadow[0] = fLight[0] * so / cssW; fShadow[1] = -fLight[1] * so / cssH;

      // 1. Leaves.
      gl.bindFramebuffer(gl.FRAMEBUFFER, leafFbo);
      gl.viewport(0, 0, leafW, leafH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      use(progLeaf, leafW, leafH);
      gl.bindVertexArray(vaoLeaf);
      gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
      for (let v = 0; v < geo.nSprig; v++) drawRuns(geo.sprigStart[v], geo.sprigCount[v], stemOff[v], stemCnt[v]);
      for (let v = 0; v < geo.nLeaf; v++) drawRuns(geo.leafStart[v], geo.leafCount[v], leafOff[v], leafCnt[v]);
      gl.disable(gl.BLEND);

      // 2–3. Shadow: blur the coverage at quarter resolution.
      gl.bindVertexArray(vaoFull);
      const bs = P.shadowSoftness.value / 3;
      blurPass(blurFboA, UNIT_LEAVES, bs / cssW, 0, true);
      blurPass(blurFboB, UNIT_BLUR_A, 0, bs / cssH, false);

      // 4. Composite.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      use(progComp, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
