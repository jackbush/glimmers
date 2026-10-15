// Atlas Nights — which constellation the pointer or a tap is on, eased into f_hover.
//
// A constellation is picked when the pointer is within Reach of one of its showing lines, or
// inside one of its enclosed shapes (so the hover holds while a ring of stars drifts past under
// a still pointer). The shapes are found once at load: each constellation's lines form a graph,
// and every edge outside a spanning tree closes one loop; together those loops cover every
// enclosed space. A tap picks the same way, holds for Tap hold, then fades; meanwhile the
// name rides on the tapped point of the sky. Nothing here allocates per frame.

import { BEHIND, SEG_LAYOUT as L, TAU, clamp, rise } from './shader.js';

// A segment counts once this much of it is showing (grown × fade).
const VISIBLE = 0.25;
// An enclosed shape counts once its constellation is this far traced in.
const TRACED = 0.95;

/**
 * Every enclosed shape of every constellation, as loops of equatorial unit vectors.
 * @param {Float32Array} segs segment attributes, laid out as SEG_LAYOUT
 * @param {number} count segments
 */
export function buildLoops(segs, count) {
  /** @type {Map<number, number[]>} constellation index → its segments' offsets */
  const byConstellation = new Map();
  for (let i = 0; i < count; i++) {
    const o = i * L.stride, c = segs[o + L.index];
    if (!byConstellation.has(c)) byConstellation.set(c, []);
    byConstellation.get(c).push(o);
  }
  const start = [0], ref = [], verts = [];
  for (const offs of byConstellation.values()) {
    // Vertices are stars: the same star is the same point, to float precision.
    const ids = new Map(), pos = [], adj = [];
    const vertex = (o) => {
      const key = segs[o].toFixed(6) + ',' + segs[o + 1].toFixed(6) + ',' + segs[o + 2].toFixed(6);
      if (!ids.has(key)) { ids.set(key, pos.length); pos.push([segs[o], segs[o + 1], segs[o + 2]]); adj.push([]); }
      return ids.get(key);
    };
    const edges = [];
    for (const o of offs) {
      const u = vertex(o + L.from), v = vertex(o + L.to);
      if (u === v || adj[u].includes(v)) continue; // repeated lines add no new loop
      adj[u].push(v); adj[v].push(u);
      edges.push([u, v]);
    }
    // Spanning forest by breadth-first search; each edge left out closes a loop.
    const parent = new Array(pos.length).fill(-2), depth = new Array(pos.length).fill(0), tree = new Set();
    for (let r = 0; r < pos.length; r++) {
      if (parent[r] !== -2) continue;
      parent[r] = -1;
      const queue = [r];
      while (queue.length) {
        const u = queue.shift();
        for (const v of adj[u]) {
          if (parent[v] !== -2) continue;
          parent[v] = u; depth[v] = depth[u] + 1; tree.add(u + ',' + v); tree.add(v + ',' + u);
          queue.push(v);
        }
      }
    }
    for (const [u, v] of edges) {
      if (tree.has(u + ',' + v)) continue;
      // The loop: u up to the common ancestor, then down to v.
      const up = [u], down = [v];
      let a = u, b = v;
      while (a !== b) {
        if (depth[a] >= depth[b]) { a = parent[a]; up.push(a); } else { b = parent[b]; down.push(b); }
      }
      down.pop(); // the common ancestor is already the end of `up`
      const loop = up.concat(down.reverse());
      if (loop.length < 3) continue;
      for (const i of loop) verts.push(...pos[i]);
      start.push(verts.length / 3);
      ref.push(offs[0]);
    }
  }
  return {
    count: ref.length,
    /** Loop n's vertices are start[n] … start[n + 1] − 1. */
    start: Int32Array.from(start),
    /** A segment offset of loop n's constellation, for its index, culture and centre. */
    ref: Int32Array.from(ref),
    verts: Float32Array.from(verts),
    /** Scratch: the vertices on screen, canvas px. */
    screen: new Float32Array((verts.length / 3) * 2),
  };
}

/** The constellation's tracing progress and fade at segment offset o (mirrors the GLSL). */
const show = new Float32Array(2);
function showing(P, f, segs, o) {
  let h = f.f_lst[0] - Math.atan2(segs[o + L.centre + 1], segs[o + L.centre]);
  h = (h - TAU * Math.floor((h + Math.PI) / TAU)) * (12 / Math.PI); // hours, − east
  show[0] = Math.min(rise(P.drawStart.value, P.drawEnd.value, h), f.f_lines[0]);
  show[1] = (1 - rise(P.fadeStart.value, P.fadeEnd.value, h)) * f.f_lines[1];
}

/** Camera-space projection of equatorial vector at v[o], into out[j], out[j + 1]; false if behind. */
function project(f, v, o, out, j) {
  const m = f.f_eq2cam;
  const z = m[2] * v[o] + m[5] * v[o + 1] + m[8] * v[o + 2];
  if (z < BEHIND) return false;
  const s = f.f_k[0] / z;
  out[j] = f.f_center[0] + s * (m[0] * v[o] + m[3] * v[o + 1] + m[6] * v[o + 2]);
  out[j + 1] = f.f_center[1] + s * (m[1] * v[o] + m[4] * v[o + 1] + m[7] * v[o + 2]);
  return true;
}

const ends = new Float32Array(4);
/** The constellation at canvas px (x, y), y up, or −1: the nearest showing line within Reach, else an enclosed shape around the point. */
function pick(P, f, segs, count, loops, x, y, px) {
  const reach = P.hoverReach.value * px;
  if (!(reach > 0) || x !== x) return -1;
  const culture = f.f_culture[0], overlap = P.traceOverlap.value;
  let best = -1, bestD = reach * reach;
  for (let i = 0; i < count; i++) {
    const o = i * L.stride;
    if (segs[o + L.culture] !== culture) continue;
    showing(P, f, segs, o);
    const grown = clamp((show[0] - segs[o + L.order] * (1 - overlap)) / overlap, 0, 1);
    if (grown * show[1] < VISIBLE) continue;
    if (!project(f, segs, o + L.from, ends, 0) || !project(f, segs, o + L.to, ends, 2)) continue;
    // Distance² from the point to the drawn part of the segment.
    const ax = ends[0], ay = ends[1], dx = (ends[2] - ax) * grown, dy = (ends[3] - ay) * grown;
    const u = clamp(((x - ax) * dx + (y - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-6), 0, 1);
    const qx = ax + u * dx - x, qy = ay + u * dy - y, d = qx * qx + qy * qy;
    if (d < bestD) { bestD = d; best = segs[o + L.index]; }
  }
  if (best >= 0) return best;
  for (let n = 0; n < loops.count; n++) {
    const o = loops.ref[n];
    if (segs[o + L.culture] !== culture) continue;
    showing(P, f, segs, o);
    if (show[0] < TRACED || show[1] < VISIBLE) continue;
    const a = loops.start[n], b = loops.start[n + 1], s = loops.screen;
    let visible = true;
    for (let v = a; v < b && visible; v++) visible = project(f, loops.verts, v * 3, s, v * 2);
    if (!visible) continue;
    // Even-odd: a ray to the right crosses the loop's edges an odd number of times inside it.
    let inside = false;
    for (let v = a, w = b - 1; v < b; w = v++) {
      const vy = s[v * 2 + 1], wy = s[w * 2 + 1];
      if ((vy > y) !== (wy > y) && x < s[v * 2] + ((y - vy) / (wy - vy)) * (s[w * 2] - s[v * 2])) inside = !inside;
    }
    if (inside) return segs[o + L.index];
  }
  return -1;
}

export function createHover() {
  let tapId = -1, tapUntil = 0, anchored = false;
  const tapEq = new Float32Array(3);
  const state = {
    /** While a tap's name is showing: where it sits, canvas px with y up (the tapped sky point). */
    anchor: new Float32Array(2),
    get anchored() { return anchored; },
    /**
     * Call after perFrame() (it reads the frame's matrix and gates). `input` is the pointer in
     * canvas px, y up (x NaN = none), plus a tap to consume. Returns the constellation shown, or −1.
     */
    update(P, f, segs, count, loops, input, rt, rdt, px) {
      if (input.tapped) {
        input.tapped = false;
        tapId = pick(P, f, segs, count, loops, input.tapX, input.tapY, px);
        tapUntil = rt + P.tapHold.value;
        anchored = tapId >= 0;
        if (anchored) unproject(f, input.tapX, input.tapY, tapEq);
      }
      if (input.x === input.x) anchored = false; // a mouse takes over
      let target;
      if (tapId >= 0 && rt < tapUntil) target = tapId;
      else {
        tapId = -1;
        target = pick(P, f, segs, count, loops, input.x, input.y, px);
      }
      if (anchored && !project(f, tapEq, 0, state.anchor, 0)) anchored = false;
      ease(P, f, target, rdt);
      return target;
    },
  };
  return state;
}

/** Canvas px (y up) → equatorial unit vector, into out. */
function unproject(f, x, y, out) {
  const m = f.f_eq2cam, k = f.f_k[0];
  const cx = (x - f.f_center[0]) / k, cy = (y - f.f_center[1]) / k, n = 1 / Math.hypot(cx, cy, 1);
  // The matrix is a rotation: its transpose takes camera space back to equatorial.
  for (let i = 0; i < 3; i++) out[i] = (m[i * 3] * cx + m[i * 3 + 1] * cy + m[i * 3 + 2]) * n;
}

/** The target rises over Fade in while the one before falls over Fade out (f_hover). */
function ease(P, f, target, rdt) {
  const hv = f.f_hover;
  if (target !== hv[0]) {
    const amount = target === hv[2] ? hv[3] : 0; // back to the one easing out: pick up where it is
    hv[2] = hv[0];
    hv[3] = hv[1];
    hv[0] = target;
    hv[1] = amount;
  }
  hv[1] = target < 0 ? 0 : Math.min(1, hv[1] + rdt / Math.max(P.hoverFade.value, 1e-3));
  hv[3] = Math.max(0, hv[3] - rdt / Math.max(P.hoverFadeOut.value, 1e-3));
}
