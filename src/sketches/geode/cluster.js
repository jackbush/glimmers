// Geode — the cluster's geometry, built on the CPU from the seed and the Cluster params, into
// one uniform buffer the trace pass reads as `bodies[]`.
//
// Every crystal is a convex solid: the intersection of 18 half-spaces (6 prism faces and a
// pointed tip of 6 faces at each end, like a double-terminated quartz), so a ray meets it
// exactly with plane tests, no meshes. The tallest point is 1 long, tip to tip, and every
// crystal's axis passes through the origin. Space is "cluster space": y up, turned into view
// by perFrame().
//
// Rows of ROW_W vec4s, one per crystal:
//   crystal: 0 bounding sphere (centre, radius) · 1 axis, length · 2 side axis, mean radius ·
//            3 root tip, random 0–1 · 4… planes (normal, offset): prism 0–5, outer tip 6–11,
//            root tip 12–17
//
// buildCluster() allocates nothing (its random generator is inline), so it can rebuild every
// frame when params drift.

export const MAX_CRYSTALS = 16;
export const CRYSTAL_PLANES = 18;
export const PLANES_AT = 4; // first plane slot in a row
export const ROW_W = PLANES_AT + CRYSTAL_PLANES;
export const ROWS = MAX_CRYSTALS;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** What the shader and perFrame() need: the buffer's data, counts, and the framing sphere. */
export const cluster = {
  data: new Float32Array(ROW_W * ROWS * 4),
  crystals: 0,
  /** Height of the cluster's middle, which it turns about. */
  centreY: 0,
  /** Radius around (0, centreY, 0) that holds the whole cluster at any turn. */
  radius: 1,
};

// mulberry32, inline so a rebuild makes no closures.
let state = 0;
function seedRandom(seed) { state = Math.floor(seed * 1000) ^ 0x9e3779b9; }
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const sym = () => rand() * 2 - 1;

// Scratch: the crystal's frame.
const ax = new Float32Array(3), sx = new Float32Array(3), sz = new Float32Array(3), root = new Float32Array(3);

function slot(row, col, x, y, z, w) {
  const o = (row * ROW_W + col) * 4;
  cluster.data[o] = x; cluster.data[o + 1] = y; cluster.data[o + 2] = z; cluster.data[o + 3] = w;
}
/** A plane from a normal in the crystal's frame (side, axis, side) and its offset from the root. */
function crystalPlane(row, k, lx, ly, lz, offset) {
  const nx = sx[0] * lx + ax[0] * ly + sz[0] * lz;
  const ny = sx[1] * lx + ax[1] * ly + sz[1] * lz;
  const nz = sx[2] * lx + ax[2] * ly + sz[2] * lz;
  slot(row, PLANES_AT + k, nx, ny, nz, nx * root[0] + ny * root[1] + nz * root[2] + offset);
}

let minY = 0, maxY = 0, maxR2 = 0;
function extend(x, y, z, pad) {
  minY = Math.min(minY, y - pad);
  maxY = Math.max(maxY, y + pad);
  maxR2 = Math.max(maxR2, (Math.hypot(x, z) + pad) ** 2);
}

/** @param {Record<string, import('../../kit/types').Param>} P */
export function buildCluster(P) {
  seedRandom(P.seed.value);
  const n = Math.max(1, Math.min(MAX_CRYSTALS, Math.round(P.crystals.value)));
  const fan = P.fan.value * DEG;
  const tilt = P.tipAngle.value * DEG, cosT = Math.cos(tilt), sinT = Math.sin(tilt);
  minY = Infinity; maxY = -Infinity; maxR2 = 0;

  for (let i = 0; i < n; i++) {
    // Every axis passes through one point (the origin), at Cross point along its length; the
    // first stands nearly upright and the rest lean out further the later they come, round the
    // circle by the golden angle so they spread evenly.
    const rho = i === 0 ? 0.15 * rand() : Math.sqrt((i + 0.5 * rand()) / n);
    const az = i * GOLDEN + 0.6 * sym();
    const lean = fan * Math.min(1, rho + 0.3 * sym() * (i > 0 ? 1 : 0.3));
    const leanAz = az + 0.5 * sym();
    ax[0] = Math.sin(lean) * Math.cos(leanAz);
    ax[1] = Math.cos(lean);
    ax[2] = Math.sin(lean) * Math.sin(leanAz);

    const L = i === 0 ? 1 : Math.max(0.15, 1 - P.lengthJitter.value * (0.4 * rand() + 0.6 * rho));
    const r = P.thickness.value * Math.pow(L, 0.65) * Math.max(0.2, 1 + P.thicknessJitter.value * 0.6 * sym());

    // Side axes: any perpendicular to the axis, turned by a random twist.
    let px = -ax[2], pz = ax[0], pl = Math.hypot(px, pz);
    if (pl < 1e-4) { px = 1; pz = 0; pl = 1; }
    px /= pl; pz /= pl; // horizontal, ⟂ axis
    const qx = ax[1] * pz, qy = ax[2] * px - ax[0] * pz, qz = -ax[1] * px; // axis × p
    const tw = rand() * TAU, c = Math.cos(tw), s = Math.sin(tw);
    sx[0] = c * px + s * qx; sx[1] = s * qy; sx[2] = c * pz + s * qz;
    sz[0] = ax[1] * sx[2] - ax[2] * sx[1]; sz[1] = ax[2] * sx[0] - ax[0] * sx[2]; sz[2] = ax[0] * sx[1] - ax[1] * sx[0];

    // The root tip: back from the crossing by Cross point × length, then off the axis by up to
    // the crystal's own radius, so the points cross close together but not all on one line.
    const back = P.crossAt.value * L, u = sym() * r, v = sym() * r;
    for (let k = 0; k < 3; k++) root[k] = -ax[k] * back + sx[k] * u + sz[k] * v;

    let rMax = 0;
    for (let k = 0; k < 6; k++) {
      const a = k * (TAU / 6);
      const off = r * Math.max(0.3, 1 + P.faceJitter.value * sym());
      rMax = Math.max(rMax, off);
      crystalPlane(i, k, Math.cos(a), 0, Math.sin(a), off);
      // Tips, cut the same way at both ends: the apex at L (outer) or at the root (0), the small
      // faces (odd) set back, each face nudged in or out on its own.
      const big = (k & 1) * P.faceDominance.value * r;
      crystalPlane(i, 6 + k, sinT * Math.cos(a), cosT, sinT * Math.sin(a), L * cosT + big + P.tipJitter.value * r * 0.5 * sym());
      crystalPlane(i, 12 + k, sinT * Math.cos(a), -cosT, sinT * Math.sin(a), big + P.tipJitter.value * r * 0.5 * sym());
    }

    const half = 0.5 * L, rc = rMax / Math.cos(TAU / 12);
    slot(i, 0, root[0] + ax[0] * half, root[1] + ax[1] * half, root[2] + ax[2] * half, Math.hypot(half + r * 0.6, rc) * 1.02);
    slot(i, 1, ax[0], ax[1], ax[2], L);
    slot(i, 2, sx[0], sx[1], sx[2], r);
    slot(i, 3, root[0], root[1], root[2], rand());
    extend(root[0] + ax[0] * L, root[1] + ax[1] * L, root[2] + ax[2] * L, r * 0.5);
    extend(root[0] + ax[0] * L * 0.6, root[1] + ax[1] * L * 0.6, root[2] + ax[2] * L * 0.6, rc);
    extend(root[0], root[1], root[2], r * 0.5);
  }

  cluster.crystals = n;
  cluster.centreY = 0.5 * (minY + maxY);
  // The farthest point from the turning axis, or above or below the middle, whichever is more.
  cluster.radius = Math.max(Math.sqrt(maxR2), 0.5 * (maxY - minY));
}
