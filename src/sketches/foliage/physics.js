// Foliage — packing. Each leaf (or sprig) is a rigid body made of a few circles, on a torus a
// margin larger than the screen (leaves can sit off one edge and wrap, out of sight).
//
// One key body is pinned at the centre. New bodies are only ever placed where they fit, as
// close to the centre as they can get, so the page grows outward from the key. Bodies relax
// a little when shapes change (pushing apart within the gap, turning to tessellate); if two
// actually overlap, the one farther from the key is deleted on the spot: it freezes and fades.
//
// Collisions use each body's size at full breath, so breathing never causes an overlap.
// Allocation-free: bodies, world circles and the broad-phase grid are typed arrays.

import { geo, MAX_CIRC, MAX_SPRIG_CIRC } from './shapes.js';

export const MAX_BODIES = 900;
const MAX_WCIRC = 40000;
const FADE_OUT = 0.5, GROW_IN = 0.45;

export const bodies = {
  n: 0,
  x: new Float32Array(MAX_BODIES), y: new Float32Array(MAX_BODIES), a: new Float32Array(MAX_BODIES),
  /** Random 0–1 per body: picks its variant, size, mirroring and colours. */
  seed: new Float32Array(MAX_BODIES),
  /** Grow-in, 0 → 1. */
  life: new Float32Array(MAX_BODIES),
  /** Opacity, 1 → 0 once deleted. */
  fade: new Float32Array(MAX_BODIES),
  dying: new Uint8Array(MAX_BODIES),
  key: new Uint8Array(MAX_BODIES),
  /** 0 = loose leaf, 1 = sprig. */
  kind: new Uint8Array(MAX_BODIES),
  /** Size multiplier from size variance (eased toward its target). */
  size: new Float32Array(MAX_BODIES),
  /** Breathing phase, rippling outward from the key. */
  phase: new Float32Array(MAX_BODIES),
};

const dx = new Float32Array(MAX_BODIES), dy = new Float32Array(MAX_BODIES), da = new Float32Array(MAX_BODIES);
const wcx = new Float32Array(MAX_WCIRC), wcy = new Float32Array(MAX_WCIRC), wcr = new Float32Array(MAX_WCIRC);
const wcb = new Int32Array(MAX_WCIRC), wlx = new Float32Array(MAX_WCIRC), wly = new Float32Array(MAX_WCIRC);
let nw = 0;
// The grid is capped at ~60k cells (see buildGrid), so this never needs to grow.
const gridHead = new Int32Array(64000);
const gridNext = new Int32Array(MAX_WCIRC);
let gw = 3, gh = 3, cw = 1, ch = 1, reachX = 1, reachY = 1;
const bMass = new Float32Array(MAX_BODIES), bGyr = new Float32Array(MAX_BODIES);

/** World: x ∈ [−m, w + m), y ∈ [−m, h + m), wrapping; the key sits at (cx, cy). */
export const world = { w: 1, h: 1, m: 0, W: 1, H: 1, leafLen: 1, cx: 0.5, cy: 0.5, breath: 0, mirrorShare: 0.5, undersideShare: 0 };

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

/** Variant index of body i (leaf or sprig variant). */
export function variantOf(i) { return variantFor(bodies.seed[i], bodies.kind[i]); }
function variantFor(seed, kind) {
  const n = kind ? geo.nSprig : geo.nLeaf;
  return Math.min(n - 1, Math.floor(seed * n));
}
/** Whether a body lies underside up. */
export function underside(i) { return undersideFor(bodies.seed[i]); }
function undersideFor(seed) { return hash1(Math.floor(seed * 1e7) + 91) < world.undersideShare; }
/** −1 if a body is drawn mirrored: by choice (Mirrored), or because it's underside up. */
export function flip(i) { return flipFor(bodies.seed[i]); }
function flipFor(seed) { return (hash1(Math.floor(seed * 1e7) + 77) < world.mirrorShare) !== undersideFor(seed) ? -1 : 1; }

function ease(t) { return t * t * (3 - 2 * t); }

/** Body i's drawn scale in px: leaf length × size × grow-in × breath. */
export function bodyScale(i, t, freq) {
  const b = 1 + world.breath * Math.sin(6.2831853 * freq * t + bodies.phase[i]);
  return world.leafLen * bodies.size[i] * ease(bodies.life[i]) * b;
}
/** The room a body reserves: full size at full breath. */
function roomScale(size) { return world.leafLen * size * (1 + world.breath); }

/** Size multiplier for a body seed from size variance (log-uniform around 1). */
export function sizeFor(seed, variance) { return Math.exp(variance * 0.85 * (hash1(Math.floor(seed * 1e7) + 3) * 2 - 1)); }

function torDist(x0, y0, x1, y1) {
  let ddx = Math.abs(x1 - x0), ddy = Math.abs(y1 - y0);
  if (ddx > world.W / 2) ddx = world.W - ddx;
  if (ddy > world.H / 2) ddy = world.H - ddy;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

export function addBody(x, y, a, kind, seed, size, key, phase) {
  if (bodies.n >= MAX_BODIES) return -1;
  const i = bodies.n++;
  bodies.x[i] = x; bodies.y[i] = y; bodies.a[i] = a;
  bodies.seed[i] = seed; bodies.life[i] = 0; bodies.fade[i] = 1; bodies.dying[i] = 0;
  bodies.key[i] = key ? 1 : 0; bodies.kind[i] = kind; bodies.size[i] = size; bodies.phase[i] = phase;
  return i;
}
function removeBody(i) {
  const j = --bodies.n;
  if (i === j) return;
  bodies.x[i] = bodies.x[j]; bodies.y[i] = bodies.y[j]; bodies.a[i] = bodies.a[j];
  bodies.seed[i] = bodies.seed[j]; bodies.life[i] = bodies.life[j]; bodies.fade[i] = bodies.fade[j];
  bodies.dying[i] = bodies.dying[j]; bodies.key[i] = bodies.key[j]; bodies.kind[i] = bodies.kind[j];
  bodies.size[i] = bodies.size[j]; bodies.phase[i] = bodies.phase[j];
}
/** Delete body i: it stops where it is and fades out. */
export function kill(i) { if (!bodies.dying[i]) { bodies.dying[i] = 1; bodies.key[i] = 0; } }
/** Index of the live key body, or −1. */
export function keyIndex() {
  for (let i = 0; i < bodies.n; i++) if (bodies.key[i] && !bodies.dying[i]) return i;
  return -1;
}
export function liveCount() {
  let n = 0;
  for (let i = 0; i < bodies.n; i++) if (!bodies.dying[i]) n++;
  return n;
}

/** Resize the world, carrying bodies proportionally (the centre stays the centre). */
export function setWorld(w, h, m, leafLen, breath) {
  const oW = world.W, oH = world.H, om = world.m;
  const W = w + 2 * m, H = h + 2 * m;
  if (oW > 1 && (W !== oW || H !== oH)) {
    for (let i = 0; i < bodies.n; i++) {
      bodies.x[i] = (bodies.x[i] + om) / oW * W - m;
      bodies.y[i] = (bodies.y[i] + om) / oH * H - m;
    }
  }
  world.w = w; world.h = h; world.m = m; world.W = W; world.H = H; world.leafLen = leafLen;
  world.cx = w / 2; world.cy = h / 2; world.breath = breath;
}

function wrapX(x) { const W = world.W, m = world.m; x = (x + m) % W; if (x < 0) x += W; return x - m; }
function wrapY(y) { const H = world.H, m = world.m; y = (y + m) % H; if (y < 0) y += H; return y - m; }

// ---------------------------------------------------------------- circles and grid

function circlesOf(kind, v) { return kind ? geo.sprigNCirc[v] : geo.leafNCirc[v]; }

/** Append one body's world circles (at its reserved size) for pose (x, y, a). */
function pushCircles(i, kind, v, x, y, a, s, fl) {
  const sprig = kind === 1;
  const ca = Math.cos(a), sa = Math.sin(a);
  const arr = sprig ? geo.sprigCirc : geo.leafCirc;
  const o = sprig ? v * MAX_SPRIG_CIRC * 3 : v * MAX_CIRC * 3;
  let nc = circlesOf(kind, v);
  // Small leaves need fewer circles (they come biggest first): keeps big crowds cheap.
  if (!sprig && s < 80) nc = Math.min(nc, Math.max(5, Math.round(s / 6)));
  const px = sprig ? geo.sprigPivot[v * 2] : geo.leafPivot[v * 2], py = sprig ? geo.sprigPivot[v * 2 + 1] : geo.leafPivot[v * 2 + 1];
  for (let c = 0; c < nc && nw < MAX_WCIRC; c++) {
    const lx = (arr[o + c * 3] - px) * s, ly = (arr[o + c * 3 + 1] - py) * s * fl;
    const rx = lx * ca - ly * sa, ry = lx * sa + ly * ca;
    wlx[nw] = rx; wly[nw] = ry;
    wcx[nw] = x + rx; wcy[nw] = y + ry;
    wcr[nw] = arr[o + c * 3 + 2] * s;
    wcb[nw] = i;
    nw++;
  }
}

/** World circles for every live body, plus per-body mass and inertia. */
function gatherCircles() {
  nw = 0;
  for (let i = 0; i < bodies.n; i++) {
    if (bodies.dying[i]) continue;
    const v = variantOf(i), kind = bodies.kind[i];
    const s = roomScale(bodies.size[i]);
    const area = kind ? geo.sprigArea[v] : geo.leafArea[v], gyr = kind ? geo.sprigGyr[v] : geo.leafGyr[v];
    bMass[i] = Math.max(1e-3, area * s * s);
    bGyr[i] = Math.max(1, gyr * s * s);
    pushCircles(i, kind, v, bodies.x[i], bodies.y[i], bodies.a[i], s, flip(i));
  }
}

function cellX(x) { let g = Math.floor((x + world.m) / cw) % gw; if (g < 0) g += gw; return g; }
function cellY(y) { let g = Math.floor((y + world.m) / ch) % gh; if (g < 0) g += gh; return g; }
function link(k) {
  const c = cellY(wcy[k]) * gw + cellX(wcx[k]);
  gridNext[k] = gridHead[c];
  gridHead[c] = k;
}

/** Bucket the circles; cells sized for the biggest circle any body could have. */
function buildGrid(gap, rmax) {
  const W = world.W, H = world.H;
  let cs = 2 * rmax + gap;
  cs = Math.min(cs, W / 3, H / 3);
  cs = Math.max(cs, Math.sqrt(W * H / 60000));
  gw = Math.max(3, Math.floor(W / cs)); gh = Math.max(3, Math.floor(H / cs));
  cw = W / gw; ch = H / gh;
  reachX = Math.min(Math.floor(gw / 2), Math.ceil((2 * rmax + gap) / cw));
  reachY = Math.min(Math.floor(gh / 2), Math.ceil((2 * rmax + gap) / ch));
  gridHead.fill(-1, 0, gw * gh);
  for (let k = 0; k < nw; k++) link(k);
}

let deaths = 0;
/**
 * One relaxation pass: push bodies apart within the gap (and turn them), limited to maxStep
 * px. The key never moves. A real overlap deletes the body farther from the key.
 */
function relax(gap, twist, maxStep, maxTurn) {
  const W = world.W, H = world.H;
  for (let i = 0; i < bodies.n; i++) { dx[i] = 0; dy[i] = 0; da[i] = 0; }
  for (let k = 0; k < nw; k++) {
    const bk = wcb[k];
    for (let oy = -reachY; oy <= reachY && !bodies.dying[bk]; oy++) {
      const ry = (cellY(wcy[k]) + oy + gh) % gh;
      for (let ox = -reachX; ox <= reachX && !bodies.dying[bk]; ox++) {
        const rx = (cellX(wcx[k]) + ox + gw) % gw;
        for (let j = gridHead[ry * gw + rx]; j !== -1 && !bodies.dying[bk]; j = gridNext[j]) {
          if (j <= k) continue;
          const bj = wcb[j];
          if (bj === bk || bodies.dying[bj]) continue;
          let ddx = wcx[j] - wcx[k], ddy = wcy[j] - wcy[k];
          if (ddx > W / 2) ddx -= W; else if (ddx < -W / 2) ddx += W;
          if (ddy > H / 2) ddy -= H; else if (ddy < -H / 2) ddy += H;
          const touch = wcr[k] + wcr[j], want = touch + gap;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= want * want) continue;
          const d = Math.sqrt(d2) || 1e-3;
          if (d < touch - 0.5) {
            // Overlapping: rather than jitter against each other, the one farther from the
            // key goes.
            let victim;
            if (bodies.key[bk]) victim = bj;
            else if (bodies.key[bj]) victim = bk;
            else victim = torDist(bodies.x[bk], bodies.y[bk], world.cx, world.cy) > torDist(bodies.x[bj], bodies.y[bj], world.cx, world.cy) ? bk : bj;
            kill(victim);
            deaths++;
            continue;
          }
          const pen = want - d;
          const nx = ddx / d, ny = ddy / d;
          let wk, wj;
          if (bodies.key[bk]) { wk = 0; wj = 1; } else if (bodies.key[bj]) { wk = 1; wj = 0; }
          else { const mk = bMass[bk], mj = bMass[bj]; wk = mj / (mk + mj); wj = mk / (mk + mj); }
          const pk = pen * wk, pj = pen * wj;
          dx[bk] -= nx * pk; dy[bk] -= ny * pk;
          dx[bj] += nx * pj; dy[bj] += ny * pj;
          // Torque from pushing at the circle, not the centre: lets leaves turn into gaps.
          da[bk] += twist * (wlx[k] * (-ny * pk) - wly[k] * (-nx * pk)) / bGyr[bk];
          da[bj] += twist * (wlx[j] * (ny * pj) - wly[j] * (nx * pj)) / bGyr[bj];
        }
      }
    }
  }
  for (let i = 0; i < bodies.n; i++) {
    if (bodies.dying[i] || bodies.key[i]) continue;
    let mx = dx[i] * 0.5, my = dy[i] * 0.5;
    const l = Math.hypot(mx, my);
    if (l > maxStep) { mx *= maxStep / l; my *= maxStep / l; }
    bodies.x[i] = wrapX(bodies.x[i] + mx);
    bodies.y[i] = wrapY(bodies.y[i] + my);
    let t = da[i] * 0.5;
    if (t > maxTurn) t = maxTurn; else if (t < -maxTurn) t = -maxTurn;
    bodies.a[i] += t;
  }
}

/** Do the circles appended at [from, nw) clear every circle already in the grid? */
function fitsAppended(from, gap) {
  const W = world.W, H = world.H;
  for (let k = from; k < nw; k++) {
    const gx = cellX(wcx[k]), gy = cellY(wcy[k]);
    for (let oy = -reachY; oy <= reachY; oy++) {
      const ry = (gy + oy + gh) % gh;
      for (let ox = -reachX; ox <= reachX; ox++) {
        const rx = (gx + ox + gw) % gw;
        for (let j = gridHead[ry * gw + rx]; j !== -1; j = gridNext[j]) {
          let ddx = wcx[j] - wcx[k], ddy = wcy[j] - wcy[k];
          if (ddx > W / 2) ddx -= W; else if (ddx < -W / 2) ddx += W;
          if (ddy > H / 2) ddy -= H; else if (ddy < -H / 2) ddy += H;
          const want = wcr[k] + wcr[j] + gap;
          if (ddx * ddx + ddy * ddy < want * want) return false;
        }
      }
    }
  }
  return true;
}

/**
 * Place one new body where it fits, as near the centre as possible: try spots just beyond
 * random live bodies. Returns false when nothing fits (the page is full).
 */
function trySpawn(o, rand) {
  const kind = o.kind, gap = o.gap;
  if (bodies.n >= MAX_BODIES - 1) return false;
  const seed = rand();
  const v = variantFor(seed, kind), size = sizeFor(seed, o.sizeVariance);
  const s = roomScale(size), fl = flipFor(seed);
  const bound = (kind ? geo.sprigBound[v] : geo.leafBound[v]) * s;
  let best = 1e18, bx = 0, by = 0, ba = 0;
  for (let k = 0; k < o.tries; k++) {
    // Anchor on any live body; the most central spot that fits wins, so the page still
    // grows outward (biasing the anchor inward would only probe the full interior).
    const an = Math.floor(rand() * bodies.n);
    if (bodies.dying[an]) continue;
    const av = variantOf(an);
    const ab = (bodies.kind[an] ? geo.sprigBound[av] : geo.leafBound[av]) * roomScale(bodies.size[an]);
    const dir = rand() * 6.2831853, dist = (ab + bound) * (0.25 + 0.75 * rand()) + gap;
    const x = wrapX(bodies.x[an] + Math.cos(dir) * dist), y = wrapY(bodies.y[an] + Math.sin(dir) * dist);
    const score = torDist(x, y, world.cx, world.cy);
    if (score >= best) continue;
    const a = o.flowAngle + (rand() * 2 - 1) * Math.PI * (1 - 0.6 * o.flowAlign);
    const from = nw;
    pushCircles(-1, kind, v, x, y, a, s, fl);
    const ok = fitsAppended(from, gap);
    nw = from;
    if (ok) { best = score; bx = x; by = y; ba = a; }
  }
  if (best === 1e18) return false;
  // Breathing ripples outward from the key: phase falls behind with distance.
  const phase = -6.2831853 * best / (world.leafLen * 3.5) + (rand() - 0.5) * 1.2;
  const i = addBody(bx, by, ba, kind, seed, size, false, phase);
  if (i < 0) return false;
  const from = nw;
  pushCircles(i, kind, v, bx, by, ba, s, fl);
  for (let k = from; k < nw; k++) link(k);
  return true;
}

/** Largest circle radius any body could have right now, for sizing the grid. */
function maxRadius(kind, maxSize) {
  let r = 0;
  const nv = kind ? geo.nSprig : geo.nLeaf;
  const arr = kind ? geo.sprigCirc : geo.leafCirc;
  for (let v = 0; v < nv; v++) {
    const o = kind ? v * MAX_SPRIG_CIRC * 3 : v * MAX_CIRC * 3, n = circlesOf(kind, v);
    for (let c = 0; c < n; c++) if (arr[o + c * 3 + 2] > r) r = arr[o + c * 3 + 2];
  }
  return r * roomScale(maxSize);
}

/**
 * Advance one frame. `o` is a reused options object (see sketch.js); results come back in
 * it: `deaths` (deleted for overlapping), `placed`, and `saturated` (nothing more fits).
 * `rdt` is real seconds (so leaves settle while paused); `sdt`/`t` scene time.
 */
export function step(o, rand) {
  const { rdt, sdt, t, gap, twist, glide, wind, gusts, flowAngle, flowAlign, iterations } = o;
  const L = world.leafLen;
  // Grow in; deleted bodies fade, frozen.
  for (let i = bodies.n - 1; i >= 0; i--) {
    if (bodies.dying[i]) {
      bodies.fade[i] -= rdt / FADE_OUT;
      if (bodies.fade[i] <= 0) removeBody(i);
    } else if (bodies.life[i] < 1) bodies.life[i] = Math.min(1, bodies.life[i] + rdt / GROW_IN);
  }
  // Wind: each leaf's angle sways on a slow noise of its own.
  if (sdt > 0 && wind > 0) {
    for (let i = 0; i < bodies.n; i++) {
      if (bodies.dying[i]) continue;
      const sd = bodies.seed[i] * 97.3, f = 0.35 + 0.3 * bodies.seed[i];
      const sway = wind * (0.16 + 0.22 * gusts * (0.5 + bodies.seed[i]));
      bodies.a[i] += sway * (noise1(t * f + sd) - noise1((t - sdt) * f + sd));
    }
  }
  // Flow: a gentle turn toward the flow direction.
  if (flowAlign > 0) {
    const k = 1 - Math.exp(-rdt * flowAlign * 0.8);
    for (let i = 0; i < bodies.n; i++) {
      if (bodies.dying[i] || bodies.key[i]) continue;
      let d = flowAngle - bodies.a[i];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      bodies.a[i] += d * k;
    }
  }
  // Gather: everything drifts gently toward the key, so the pattern stays compact around it
  // and room opens at the edges for new leaves. Relaxation holds the gap against it.
  if (o.gather > 0) {
    const g = o.gather * L * rdt;
    for (let i = 0; i < bodies.n; i++) {
      if (bodies.dying[i] || bodies.key[i]) continue;
      let ddx = world.cx - bodies.x[i], ddy = world.cy - bodies.y[i];
      if (ddx > world.W / 2) ddx -= world.W; else if (ddx < -world.W / 2) ddx += world.W;
      if (ddy > world.H / 2) ddy -= world.H; else if (ddy < -world.H / 2) ddy += world.H;
      const d = Math.hypot(ddx, ddy);
      if (d < 1) continue;
      const m = Math.min(g, d) / d;
      bodies.x[i] = wrapX(bodies.x[i] + ddx * m);
      bodies.y[i] = wrapY(bodies.y[i] + ddy * m);
    }
  }
  const rmax = maxRadius(o.kind, o.maxSize);
  const maxStep = glide * L * Math.max(rdt, 1 / 240) / iterations;
  const maxTurn = glide * 2.5 * Math.max(rdt, 1 / 240) / iterations;
  deaths = 0;
  for (let it = 0; it < iterations; it++) {
    gatherCircles();
    buildGrid(gap, rmax);
    relax(gap, twist, maxStep, maxTurn);
  }
  o.deaths = deaths;
  // Grow outward: place as many new bodies as the cascade allows this frame.
  o.placed = 0;
  o.saturated = false;
  if (o.spawnBudget >= 1 && keyIndex() >= 0) {
    gatherCircles();
    buildGrid(gap, rmax);
    while (o.spawnBudget >= 1) {
      if (!trySpawn(o, rand)) { o.saturated = true; break; }
      o.spawnBudget -= 1;
      o.placed++;
    }
  }
}
