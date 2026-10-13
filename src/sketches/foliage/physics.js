// Foliage — packing. Each leaf (or sprig) is a rigid body made of a few circles. Bodies live
// on a torus a little larger than the screen, so leaves can drift off one edge and come back
// on the other out of sight. Every frame, overlapping circles from different bodies
// (closer than the gap) push their bodies apart and turn them, which settles the page into
// a loose tessellation. The motion is overdamped and speed-limited, so changes read as glides,
// not bounces. Wind adds a drift and a sway on top.
//
// Allocation-free: bodies, world circles and the broad-phase grid are typed arrays.

import { geo, MAX_CIRC, MAX_SPRIG_CIRC } from './shapes.js';

export const MAX_BODIES = 900;
const MAX_WCIRC = 40000;

export const bodies = {
  n: 0,
  x: new Float32Array(MAX_BODIES), y: new Float32Array(MAX_BODIES), a: new Float32Array(MAX_BODIES),
  vx: new Float32Array(MAX_BODIES), vy: new Float32Array(MAX_BODIES),
  /** Random 0–1 per body: picks its variant, size, mirroring and colours. */
  seed: new Float32Array(MAX_BODIES),
  life: new Float32Array(MAX_BODIES),
  dying: new Uint8Array(MAX_BODIES),
  /** 0 = loose leaf, 1 = sprig. */
  kind: new Uint8Array(MAX_BODIES),
  /** Size multiplier from size variance (eased toward its target). */
  size: new Float32Array(MAX_BODIES),
};

// Per-body accumulated corrections and the world circles of the current step.
const dx = new Float32Array(MAX_BODIES), dy = new Float32Array(MAX_BODIES), da = new Float32Array(MAX_BODIES);
const wcx = new Float32Array(MAX_WCIRC), wcy = new Float32Array(MAX_WCIRC), wcr = new Float32Array(MAX_WCIRC);
const wcb = new Int32Array(MAX_WCIRC), wlx = new Float32Array(MAX_WCIRC), wly = new Float32Array(MAX_WCIRC);
let nw = 0;
/** Total overlap (px) found in the last relaxation pass: how crowded the page is. */
export let sumPen = 0;
// The grid is capped at ~60k cells (see relax), so this never needs to grow.
const gridHead = new Int32Array(64000);
const gridNext = new Int32Array(MAX_WCIRC);
const bMass = new Float32Array(MAX_BODIES), bGyr = new Float32Array(MAX_BODIES), bScale = new Float32Array(MAX_BODIES);

// World: x ∈ [−m, w + m), y ∈ [−m, h + m), wrapping.
export const world = { w: 1, h: 1, m: 0, W: 1, H: 1, leafLen: 1 };

function hash1(n) {
  n |= 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const g0 = hash1(i) * 2 - 1, g1 = hash1(i + 1) * 2 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return 2 * (g0 * f * (1 - u) + g1 * (f - 1) * u);
}
// Smooth 2D value noise, −1…1.
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash1(Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663));
  const b = hash1(Math.imul(ix + 1, 73856093) ^ Math.imul(iy, 19349663));
  const c = hash1(Math.imul(ix, 73856093) ^ Math.imul(iy + 1, 19349663));
  const d = hash1(Math.imul(ix + 1, 73856093) ^ Math.imul(iy + 1, 19349663));
  return ((a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy) * 2 - 1;
}

/** Variant index of body i (leaf or sprig variant). */
export function variantOf(i) {
  const n = bodies.kind[i] ? geo.nSprig : geo.nLeaf;
  return Math.min(n - 1, Math.floor(bodies.seed[i] * n));
}
/** Whether body i is drawn mirrored. */
export function mirrored(i, share) { return hash1(Math.floor(bodies.seed[i] * 1e7) + 77) < share; }

function ease(t) { return t * t * (3 - 2 * t); }

/** Body i's scale in px right now (leaf length × size × grow-in). */
export function bodyScale(i) { return world.leafLen * bodies.size[i] * ease(bodies.life[i]); }

/** Size multiplier for a body seed from size variance (log-uniform around 1). */
export function sizeFor(seed, variance) { return Math.exp(variance * 0.85 * (hash1(Math.floor(seed * 1e7) + 3) * 2 - 1)); }

export function addBody(x, y, a, kind, seed, size, life) {
  if (bodies.n >= MAX_BODIES) return -1;
  const i = bodies.n++;
  bodies.x[i] = x; bodies.y[i] = y; bodies.a[i] = a;
  bodies.vx[i] = 0; bodies.vy[i] = 0;
  bodies.seed[i] = seed; bodies.life[i] = life; bodies.dying[i] = 0; bodies.kind[i] = kind; bodies.size[i] = size;
  return i;
}
function removeBody(i) {
  const j = --bodies.n;
  if (i === j) return;
  bodies.x[i] = bodies.x[j]; bodies.y[i] = bodies.y[j]; bodies.a[i] = bodies.a[j];
  bodies.vx[i] = bodies.vx[j]; bodies.vy[i] = bodies.vy[j];
  bodies.seed[i] = bodies.seed[j]; bodies.life[i] = bodies.life[j]; bodies.dying[i] = bodies.dying[j];
  bodies.kind[i] = bodies.kind[j]; bodies.size[i] = bodies.size[j];
}

/** Resize the world, carrying bodies proportionally so the arrangement keeps its shape. */
export function setWorld(w, h, m, leafLen) {
  const oW = world.W, oH = world.H, om = world.m;
  const W = w + 2 * m, H = h + 2 * m;
  if (oW > 1 && (W !== oW || H !== oH)) {
    for (let i = 0; i < bodies.n; i++) {
      bodies.x[i] = (bodies.x[i] + om) / oW * W - m;
      bodies.y[i] = (bodies.y[i] + om) / oH * H - m;
    }
  }
  world.w = w; world.h = h; world.m = m; world.W = W; world.H = H; world.leafLen = leafLen;
}

function wrapX(x) { const W = world.W, m = world.m; x = (x + m) % W; if (x < 0) x += W; return x - m; }
function wrapY(y) { const H = world.H, m = world.m; y = (y + m) % H; if (y < 0) y += H; return y - m; }

/** A spawn point far from existing bodies: best of a few random tries. */
export let spawnX = 0, spawnY = 0;
export function findSpawn(rand) {
  let best = -1;
  for (let k = 0; k < 14; k++) {
    const x = -world.m + rand() * world.W, y = -world.m + rand() * world.H;
    let dmin = 1e18;
    for (let i = 0; i < bodies.n; i++) {
      if (bodies.dying[i]) continue;
      let ddx = Math.abs(bodies.x[i] - x), ddy = Math.abs(bodies.y[i] - y);
      if (ddx > world.W / 2) ddx = world.W - ddx;
      if (ddy > world.H / 2) ddy = world.H - ddy;
      const r = bodyScale(i) * 0.5 + 1;
      const d = (ddx * ddx + ddy * ddy) / (r * r);
      if (d < dmin) dmin = d;
    }
    if (dmin > best) { best = dmin; spawnX = x; spawnY = y; }
  }
}

/** World circles for every body, plus per-body mass and inertia. */
function gatherCircles(share) {
  nw = 0;
  for (let i = 0; i < bodies.n; i++) {
    const v = variantOf(i), sprig = bodies.kind[i] === 1;
    const s = bodyScale(i);
    bScale[i] = s;
    const fl = mirrored(i, share) ? -1 : 1;
    const ca = Math.cos(bodies.a[i]), sa = Math.sin(bodies.a[i]);
    const arr = sprig ? geo.sprigCirc : geo.leafCirc;
    const o = sprig ? v * MAX_SPRIG_CIRC * 3 : v * MAX_CIRC * 3;
    let nc = sprig ? geo.sprigNCirc[v] : geo.leafNCirc[v];
    // Small leaves need fewer circles (they come biggest first); keeps big crowds cheap.
    if (!sprig) { const px = world.leafLen * bodies.size[i]; if (px < 80) nc = Math.min(nc, Math.max(5, Math.round(px / 6))); }
    const px = sprig ? geo.sprigPivot[v * 2] : geo.leafPivot[v * 2], py = sprig ? geo.sprigPivot[v * 2 + 1] : geo.leafPivot[v * 2 + 1];
    const area = sprig ? geo.sprigArea[v] : geo.leafArea[v], gyr = sprig ? geo.sprigGyr[v] : geo.leafGyr[v];
    bMass[i] = Math.max(1e-3, area * s * s);
    bGyr[i] = Math.max(1, gyr * s * s);
    for (let c = 0; c < nc && nw < MAX_WCIRC; c++) {
      const lx = (arr[o + c * 3] - px) * s, ly = (arr[o + c * 3 + 1] - py) * s * fl;
      const rx = lx * ca - ly * sa, ry = lx * sa + ly * ca;
      wlx[nw] = rx; wly[nw] = ry;
      wcx[nw] = bodies.x[i] + rx; wcy[nw] = bodies.y[i] + ry;
      wcr[nw] = arr[o + c * 3 + 2] * s;
      wcb[nw] = i;
      nw++;
    }
  }
}

/**
 * One relaxation pass: push overlapping bodies apart (and turn them), limited to maxStep px.
 * Returns the worst overlap found, in px.
 */
function relax(gap, twist, maxStep, maxTurn) {
  let rmax = 1;
  for (let k = 0; k < nw; k++) if (wcr[k] > rmax) rmax = wcr[k];
  const W = world.W, H = world.H, m = world.m;
  let cs = 2 * rmax + gap;
  cs = Math.min(cs, W / 3, H / 3);
  cs = Math.max(cs, Math.sqrt(W * H / 60000));
  const gw = Math.max(3, Math.floor(W / cs)), gh = Math.max(3, Math.floor(H / cs));
  const cw = W / gw, ch = H / gh;
  gridHead.fill(-1, 0, gw * gh);
  for (let k = 0; k < nw; k++) {
    let gx = Math.floor((wcx[k] + m) / cw) % gw, gy = Math.floor((wcy[k] + m) / ch) % gh;
    if (gx < 0) gx += gw; if (gy < 0) gy += gh;
    const c = gy * gw + gx;
    gridNext[k] = gridHead[c];
    gridHead[c] = k;
  }
  // Big circles can reach past one cell: search enough neighbours.
  const reachX = Math.min(Math.floor(gw / 2), Math.ceil((2 * rmax + gap) / cw)), reachY = Math.min(Math.floor(gh / 2), Math.ceil((2 * rmax + gap) / ch));
  for (let i = 0; i < bodies.n; i++) { dx[i] = 0; dy[i] = 0; da[i] = 0; }
  let worst = 0;
  sumPen = 0;
  for (let k = 0; k < nw; k++) {
    const bk = wcb[k];
    let gx = Math.floor((wcx[k] + m) / cw) % gw, gy = Math.floor((wcy[k] + m) / ch) % gh;
    if (gx < 0) gx += gw; if (gy < 0) gy += gh;
    for (let oy = -reachY; oy <= reachY; oy++) {
      const ry = (gy + oy + gh) % gh;
      for (let ox = -reachX; ox <= reachX; ox++) {
        const rx = (gx + ox + gw) % gw;
        for (let j = gridHead[ry * gw + rx]; j !== -1; j = gridNext[j]) {
          if (j <= k) continue;
          const bj = wcb[j];
          if (bj === bk) continue;
          let ddx = wcx[j] - wcx[k], ddy = wcy[j] - wcy[k];
          if (ddx > W / 2) ddx -= W; else if (ddx < -W / 2) ddx += W;
          if (ddy > H / 2) ddy -= H; else if (ddy < -H / 2) ddy += H;
          const want = wcr[k] + wcr[j] + gap;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= want * want) continue;
          const d = Math.sqrt(d2) || 1e-3;
          const pen = want - d;
          if (pen > worst) worst = pen;
          sumPen += pen;
          const nx = ddx / d, ny = ddy / d;
          const mk = bMass[bk], mj = bMass[bj], wk = mj / (mk + mj), wj = mk / (mk + mj);
          // Push k by −n, j by +n, split by mass.
          const pk = pen * wk, pj = pen * wj;
          dx[bk] -= nx * pk; dy[bk] -= ny * pk;
          dx[bj] += nx * pj; dy[bj] += ny * pj;
          // Torque from pushing at the circle, not the centre: lets leaves rotate into gaps.
          da[bk] += twist * (wlx[k] * (-ny * pk) - wly[k] * (-nx * pk)) / bGyr[bk];
          da[bj] += twist * (wlx[j] * (ny * pj) - wly[j] * (nx * pj)) / bGyr[bj];
        }
      }
    }
  }
  for (let i = 0; i < bodies.n; i++) {
    let mx = dx[i] * 0.5, my = dy[i] * 0.5;
    const l = Math.hypot(mx, my);
    if (l > maxStep) { mx *= maxStep / l; my *= maxStep / l; }
    bodies.x[i] = wrapX(bodies.x[i] + mx);
    bodies.y[i] = wrapY(bodies.y[i] + my);
    let t = da[i] * 0.5;
    if (t > maxTurn) t = maxTurn; else if (t < -maxTurn) t = -maxTurn;
    bodies.a[i] += t;
  }
  return worst;
}

/**
 * Advance one frame. `o` is a reused options object (see sketch.js).
 * Advance: grow/fade bodies, wind, then relaxation. `rdt` is real seconds (so leaves still
 * glide into place while paused), `sdt`/`t` scene time (wind stops with the scene).
 */
export function step(o) {
  const { rdt, sdt, t, gap, twist, glide, share, wind, windAngle, gusts, flowAngle, flowAlign, iterations, settle } = o;
  const L = world.leafLen;
  // Grow in, fade out.
  const fade = rdt / 0.9;
  for (let i = bodies.n - 1; i >= 0; i--) {
    if (bodies.dying[i]) {
      bodies.life[i] -= fade;
      if (bodies.life[i] <= 0) removeBody(i);
    } else if (bodies.life[i] < 1) bodies.life[i] = Math.min(1, bodies.life[i] + fade);
  }
  // Wind: a drift along the wind direction plus a slow swirl, and a sway of each leaf's angle.
  if (sdt > 0 && wind > 0) {
    const sp = wind * L * 0.35;
    const wx = Math.cos(windAngle), wy = Math.sin(windAngle);
    const fs = 1 / (L * 2.5), tt = t * 0.12;
    for (let i = 0; i < bodies.n; i++) {
      // Gusts are curl noise (the rotation of a scalar field), which swirls without
      // converging, so leaves don't bunch up and leave holes.
      const x = bodies.x[i] * fs + tt, y = bodies.y[i] * fs - tt * 0.7, e = 0.05;
      const gx = (noise2(x, y + e) - noise2(x, y - e)) / (2 * e) * 0.35;
      const gy = -(noise2(x + e, y) - noise2(x - e, y)) / (2 * e) * 0.35;
      const tvx = sp * ((1 - gusts * 0.6) * wx + gusts * 1.4 * gx);
      const tvy = sp * ((1 - gusts * 0.6) * wy + gusts * 1.4 * gy);
      const k = 1 - Math.exp(-sdt * 1.5);
      bodies.vx[i] += (tvx - bodies.vx[i]) * k;
      bodies.vy[i] += (tvy - bodies.vy[i]) * k;
      bodies.x[i] = wrapX(bodies.x[i] + bodies.vx[i] * sdt);
      bodies.y[i] = wrapY(bodies.y[i] + bodies.vy[i] * sdt);
      // Sway: the derivative of a slow per-leaf noise, so the angle wanders and returns.
      const sd = bodies.seed[i] * 97.3, f = 0.35 + 0.3 * bodies.seed[i];
      const sway = wind * (0.16 + 0.22 * gusts);
      bodies.a[i] += sway * (noise1(t * f + sd) - noise1((t - sdt) * f + sd));
    }
  }
  // Flow: a gentle turn toward the flow direction.
  if (flowAlign > 0) {
    const k = 1 - Math.exp(-rdt * flowAlign * 0.8);
    for (let i = 0; i < bodies.n; i++) {
      let d = flowAngle - bodies.a[i];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      bodies.a[i] += d * k;
    }
  }
  const maxStep = settle ? L * 0.08 : glide * L * Math.max(rdt, 1 / 240) / iterations;
  const maxTurn = settle ? 0.15 : glide * 2.5 * Math.max(rdt, 1 / 240) / iterations;
  let worst = 0;
  for (let it = 0; it < iterations; it++) {
    gatherCircles(share);
    worst = relax(gap, twist, maxStep, maxTurn);
  }
  return worst;
}
