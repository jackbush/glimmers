// Atlas Nights — shaders + per-frame CPU values.
//
// The real sky over the High Atlas (31.6°N) looking south, one day per loop: a short twilight
// with no sunrise, then a long night in which the sky turns. Stars come from the Yale Bright
// Star Catalogue and the constellation lines from d3-celestial (sky.js).
//
// Everything is a pure function of scene time: the twilight, which stars show, how far each
// constellation has traced in and its fade. Nothing is stored between frames, so speed,
// pause, seeking and captures can't leave a line stuck half-drawn.
//
// Passes:
//   1. lines, stars, meteors → a float "light" target at canvas size, added together.
//   2. composite (full res): sky colour per pixel (from its altitude and azimuth) + the light
//      target → ridge silhouette → vignette → exposure → dust → grain.
//
// Geometry: equatorial unit vectors (from RA/Dec) go to camera space through f_eq2cam, then a
// pinhole (gnomonic) projection, like the reference photo's lens: great circles come out
// straight, so the horizon is a straight line and so is every constellation line. Camera space
// is +x right (west), +y up, +z forward (south, tilted up). The composite pass inverts the
// projection to find each pixel's altitude and azimuth.
//
// Uniforms available in every pass:
//   u_<key>     every param in params.js without `uniform: false` (auto-declared)
//   f_<name>    per-frame values declared in frameUniforms and written by perFrame()
//   u_res       size of the current pass's render target, in px
//   u_screen    size of the canvas, in px
//   u_time      scene seconds (scaled & pausable)
//   u_realTime  wall-clock seconds (twinkle and the film layer keep running while paused)

import { FILM_GLSL } from '../../kit/film.js';
import { hash2 } from '../../kit/random.js';
import { LATITUDE } from './sky.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MAX_METEORS = 2; // one per time slot, and a slot is longer than a meteor, so ≤ 2 overlap
const METEOR_FIELDS = 6; // head x, y, direction x, y, tail length (canvas px), brightness
// Each slot holds at most one meteor; a slot is this many meteor durations long.
const METEOR_SLOT = 3;
// The Geminids, the shower of mid-December: every trail points back to here (RA, Dec).
const RADIANT = [112 * DEG, 33 * DEG];
const RADIANT_EQ = [Math.cos(RADIANT[1]) * Math.cos(RADIANT[0]), Math.cos(RADIANT[1]) * Math.sin(RADIANT[0]), Math.sin(RADIANT[1])];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smoothstep(a, b, x) { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
// Same as the GLSL rise(): 0 → 1 as x goes from a to b, eased; a step at a when a ≥ b.
function rise(a, b, x) { return smoothstep(0, 1, (x - a) / Math.max(b - a, 1e-4)); }
// A segment counts for hovering once this much of it is showing (grown × fade).
const HOVER_VISIBLE = 0.25;
const BEHIND = 0.02; // camera z below this counts as behind the view (shared with the GLSL)

/** Where each field sits in a segment's attributes (sketch.js builds them; hover() reads them). */
export const SEG_LAYOUT = { stride: 12, from: 0, to: 3, centre: 6, rank: 9, order: 10, index: 11 };

export default {
  maxMeteors: MAX_METEORS,

  // name → component count (1–4 → float…vec4, 9 → mat3) or [length] for a float array.
  frameUniforms: {
    f_px: 1,          // canvas px per CSS px (keeps sizes stable when resolution changes)
    f_frame: 1,       // film frame index
    f_eq2cam: 9,      // equatorial unit vector → camera space
    f_up: 3,          // equatorial unit vector · f_up = sine of altitude
    f_lst: 1,         // local sidereal time (radians): a star's hour angle is f_lst − its RA
    f_center: 2,      // canvas centre, px
    f_k: 1,           // projection scale: canvas px per unit of tan(angle off the view centre)
    f_tilt: 2,        // cos, sin of how far the view looks up from the horizon
    f_sky: 3,         // twilight (0 night … 1 brightest), sun azimuth (radians from north), faintest magnitude shown
    f_lines: 2,       // dusk gate on tracing in, dawn gate on fading (0–1 each)
    f_hover: 4,       // hovered constellation's index and highlight (0–1), then the one easing out (index −1 = none)
    f_meteor: [MAX_METEORS * METEOR_FIELDS],
  },

  // Called once per frame. P = params by key, f = preallocated Float32Arrays. Must not allocate.
  perFrame(P, t, rt, width, height, px, f) {
    f.f_px[0] = px;
    f.f_frame[0] = Math.floor(rt * P.filmFps.value);

    // The loop: phase 0 is the brightest twilight (the sun due south, just below the horizon),
    // ±0.5 is the dead of night. After 0 is dusk (the sun moving west), before it is dawn.
    const loop = P.nightLength.value;
    let phase = (t / loop + P.startPhase.value) % 1;
    if (phase < 0) phase += 1;
    if (phase > 0.5) phase -= 1;
    const tw = 1 - smoothstep(0, 1, Math.abs(phase) / (0.5 * P.twilightShare.value));
    const sunHour = TAU * phase; // the sun's hour angle
    f.f_sky[0] = tw;
    f.f_sky[1] = Math.PI + sunHour; // azimuth: south at the peak, west after
    f.f_sky[2] = P.nightLimit.value + (P.twilightLimit.value - P.nightLimit.value) * tw;

    const gate = 1 - smoothstep(0, P.lineTwilight.value, tw);
    f.f_lines[0] = phase >= 0 ? gate : 1; // dusk: constellations wait for the dark to trace in
    f.f_lines[1] = phase >= 0 ? 1 : gate; // dawn: they fade as the light comes

    // Sidereal time: the sun's RA (from the time of year) plus its hour angle, so the sky
    // turns once per loop, in step with the sun.
    const dayOfYear = (P.month.value - 1) * 30.44;
    const sunRA = (TAU * (dayOfYear - 79)) / 365.25; // 0 at the March equinox
    const lst = sunRA + sunHour;
    f.f_lst[0] = lst;

    // Projection: fov top to bottom, but at least minWidth across (phones in portrait), with
    // the southern horizon pinned at `horizon` of the height from the bottom.
    const k = Math.min((0.5 * height) / Math.tan((P.fov.value * DEG) / 2), (0.5 * width) / Math.tan((P.minWidth.value * DEG) / 2));
    const tilt = Math.atan((0.5 * height - P.horizon.value * height) / k);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    f.f_center[0] = 0.5 * width;
    f.f_center[1] = 0.5 * height;
    f.f_k[0] = k;
    f.f_tilt[0] = ct;
    f.f_tilt[1] = st;

    // Equatorial → horizon (north, east, up) for latitude φ and sidereal time θ, then into the
    // camera: x = west, z = south tilted up by `tilt`, y = up tilted back.
    const cl = Math.cos(lst), sl = Math.sin(lst);
    const cp = Math.cos(LATITUDE * DEG), sp = Math.sin(LATITUDE * DEG);
    const Ux = cp * cl, Uy = cp * sl, Uz = sp;
    const Nx = -sp * cl, Ny = -sp * sl, Nz = cp;
    const m = f.f_eq2cam; // column-major: m[col * 3 + row], rows x, y, z
    m[0] = sl;                 m[3] = -cl;                m[6] = 0;
    m[1] = st * Nx + ct * Ux;  m[4] = st * Ny + ct * Uy;  m[7] = st * Nz + ct * Uz;
    m[2] = -ct * Nx + st * Ux; m[5] = -ct * Ny + st * Uy; m[8] = -ct * Nz + st * Uz;
    f.f_up[0] = Ux;
    f.f_up[1] = Uy;
    f.f_up[2] = Uz;

    // Shooting stars: time is cut into slots; each slot has one with probability chosen so the
    // loop averages meteorRate, at a hashed moment and place. Only the dark shows them.
    const mt = f.f_meteor;
    mt.fill(0);
    const dur = P.meteorTime.value, slot = METEOR_SLOT * dur;
    const chance = Math.min(1, (P.meteorRate.value * slot) / loop);
    const seed = Math.floor(P.seed.value * 7919);
    const now = Math.floor(t / slot);
    for (let j = now - 1; j <= now; j++) {
      if (hash2(j, seed) >= chance) continue;
      const q = (t - (j * slot + hash2(j, seed + 1) * (slot - dur))) / dur;
      if (q < 0 || q >= 1) continue;
      const o = (j & 1) * METEOR_FIELDS;
      const x0 = width * (0.1 + 0.8 * hash2(j, seed + 2));
      const y0 = height * (P.horizon.value + 0.3 + 0.5 * hash2(j, seed + 3));
      // Away from the radiant if it's up; otherwise a random downward slant.
      const rx = m[0] * RADIANT_EQ[0] + m[3] * RADIANT_EQ[1] + m[6] * RADIANT_EQ[2];
      const ry = m[1] * RADIANT_EQ[0] + m[4] * RADIANT_EQ[1] + m[7] * RADIANT_EQ[2];
      const rz = m[2] * RADIANT_EQ[0] + m[5] * RADIANT_EQ[1] + m[8] * RADIANT_EQ[2];
      const radiantUp = Ux * RADIANT_EQ[0] + Uy * RADIANT_EQ[1] + Uz * RADIANT_EQ[2];
      let dx, dy;
      if (radiantUp > 0 && rz > 0.05) {
        const s = k / rz;
        dx = x0 - (0.5 * width + rx * s);
        dy = y0 - (0.5 * height + ry * s);
      } else {
        const a = -Math.PI * (0.15 + 0.7 * hash2(j, seed + 4));
        dx = Math.cos(a);
        dy = Math.sin(a);
      }
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const travel = P.meteorLength.value * px;
      mt[o] = x0 + dx * travel * q;
      mt[o + 1] = y0 + dy * travel * q;
      mt[o + 2] = dx;
      mt[o + 3] = dy;
      mt[o + 4] = Math.min(travel * q, travel * P.meteorTail.value);
      mt[o + 5] = Math.pow(Math.sin(Math.PI * q), 0.7) * (1 - tw);
    }
  },

  /**
   * Which constellation the pointer is over, eased into f_hover. Call after perFrame() (it
   * reads the frame's matrix and gates). x, y are canvas px with y up, or NaN when there's no
   * pointer. The nearest showing line within Hover reach wins. Returns its index, or −1.
   * Must not allocate.
   */
  hover(P, f, segs, count, x, y, rdt, px) {
    let best = -1;
    const reach = P.hoverReach.value * px;
    if (reach > 0 && x === x) {
      const m = f.f_eq2cam, lst = f.f_lst[0], k = f.f_k[0], cx = f.f_center[0], cy = f.f_center[1];
      const L = SEG_LAYOUT, overlap = P.traceOverlap.value;
      let bestD = reach * reach;
      for (let i = 0; i < count; i++) {
        const o = i * L.stride;
        if (segs[o + L.rank] > P.lineRank.value + 0.5) continue;
        // Mirrors linesVert: hour angle → progress and fade → how much of this segment shows.
        let h = lst - Math.atan2(segs[o + L.centre + 1], segs[o + L.centre]);
        h = (h - TAU * Math.floor((h + Math.PI) / TAU)) * (12 / Math.PI);
        const progress = Math.min(rise(P.drawStart.value, P.drawEnd.value, h), f.f_lines[0]);
        const fade = (1 - rise(P.fadeStart.value, P.fadeEnd.value, h)) * f.f_lines[1];
        const grown = clamp((progress - segs[o + L.order] * (1 - overlap)) / overlap, 0, 1);
        if (grown * fade < HOVER_VISIBLE) continue;
        const a = o + L.from, b = o + L.to;
        const az = m[2] * segs[a] + m[5] * segs[a + 1] + m[8] * segs[a + 2];
        const bz = m[2] * segs[b] + m[5] * segs[b + 1] + m[8] * segs[b + 2];
        if (az < BEHIND || bz < BEHIND) continue;
        const ax = cx + (k / az) * (m[0] * segs[a] + m[3] * segs[a + 1] + m[6] * segs[a + 2]);
        const ay = cy + (k / az) * (m[1] * segs[a] + m[4] * segs[a + 1] + m[7] * segs[a + 2]);
        const ex = ax + grown * (cx + (k / bz) * (m[0] * segs[b] + m[3] * segs[b + 1] + m[6] * segs[b + 2]) - ax);
        const ey = ay + grown * (cy + (k / bz) * (m[1] * segs[b] + m[4] * segs[b + 1] + m[7] * segs[b + 2]) - ay);
        // Distance² from the pointer to the drawn part of the segment.
        const dx = ex - ax, dy = ey - ay;
        const u = clamp(((x - ax) * dx + (y - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-6), 0, 1);
        const qx = ax + u * dx - x, qy = ay + u * dy - y, d = qx * qx + qy * qy;
        if (d < bestD) { bestD = d; best = segs[o + L.index]; }
      }
    }
    // Ease: the new one rises while the previous one falls, each over Hover fade.
    const hv = f.f_hover, step = rdt / Math.max(P.hoverFade.value, 1e-3);
    if (best !== hv[0]) {
      const amount = best === hv[2] ? hv[3] : 0; // back to the one easing out: pick up where it is
      hv[2] = hv[0];
      hv[3] = hv[1];
      hv[0] = best;
      hv[1] = amount;
    }
    hv[1] = best < 0 ? 0 : Math.min(1, hv[1] + step);
    hv[3] = Math.max(0, hv[3] - step);
    return best;
  },

  // Prepended (after uniform declarations) to every shader.
  common: `
#define TAU 6.28318530718
#define PI  3.14159265359
#define MAX_METEORS ${MAX_METEORS}
#define METEOR_FIELDS ${METEOR_FIELDS}
${FILM_GLSL}
// Camera-space direction → canvas px (pinhole). Directions with z below BEHIND are culled.
vec2 project(vec3 c) { return f_center + c.xy * (f_k / max(c.z, 1e-3)); }
const float BEHIND = ${BEHIND};
// Canvas px → clip space, in the current target.
vec4 clip(vec2 p) { return vec4(p / u_res * 2.0 - 1.0, 0.0, 1.0); }
const vec4 HIDDEN = vec4(2.0, 2.0, 2.0, 1.0);
float wrapPi(float a) { return a - TAU * floor((a + PI) / TAU); }
// 0 → 1 as x goes from a to b, eased; safe when a ≥ b (a step at a).
float rise(float a, float b, float x) { return smoothstep(0.0, 1.0, (x - a) / max(b - a, 1e-4)); }
// Corners of a quad drawn as two triangles from gl_VertexID 0–5: along 0 → 1, side −1 / +1.
float quadAlong(int i) { return (i == 1 || i == 2 || i == 4) ? 1.0 : 0.0; }
float quadSide(int i) { return (i == 2 || i == 4 || i == 5) ? 1.0 : -1.0; }
`,

  // ---------------------------------------------------------------- pass 1: light
  // One instance per constellation segment. Tracing in and fading out are set by the hour
  // angle of the constellation's centre, gated by the twilight at dusk and dawn (hover()
  // repeats this on the CPU to find what the pointer is over). The hovered constellation, and
  // the one it's easing away from, are highlighted by f_hover.
  linesVert: `
in vec3 a_from;
in vec3 a_to;
in vec3 a_centre;
in float a_rank;
in float a_order;
in float a_index;
out float v_across;
out float v_alpha;
out float v_hover;
void main() {
  vec3 ca = f_eq2cam * a_from, cb = f_eq2cam * a_to;
  float h = wrapPi(f_lst - atan(a_centre.y, a_centre.x)) * (12.0 / PI); // hours, − east
  float progress = min(rise(u_drawStart, u_drawEnd, h), f_lines.x);
  float fade = (1.0 - rise(u_fadeStart, u_fadeEnd, h)) * f_lines.y;
  // Segments grow in drawing order, each over a window of traceOverlap of the progress.
  float grown = clamp((progress - a_order * (1.0 - u_traceOverlap)) / u_traceOverlap, 0.0, 1.0);
  if (a_rank > u_lineRank + 0.5 || grown <= 0.0 || fade <= 0.0 || min(ca.z, cb.z) < BEHIND) { gl_Position = HIDDEN; return; }

  vec2 p0 = project(ca), p1 = project(cb);
  float len = length(p1 - p0);
  vec2 dir = (p1 - p0) / max(len, 1e-3);
  float gap = min(u_lineGap * f_px, 0.45 * len);
  vec2 s = p0 + dir * gap, e = s + dir * (len - 2.0 * gap) * grown;
  float halfW = (0.5 * u_lineWidth + 1.5 * max(u_lineGlowWidth, u_hoverGlowWidth)) * f_px + 1.0;
  float side = quadSide(gl_VertexID);
  v_across = side * halfW;
  v_alpha = fade;
  v_hover = (abs(a_index - f_hover.x) < 0.5 ? f_hover.y : 0.0) + (abs(a_index - f_hover.z) < 0.5 ? f_hover.w : 0.0);
  gl_Position = clip(mix(s, e, quadAlong(gl_VertexID)) + vec2(-dir.y, dir.x) * v_across);
}`,
  linesFrag: `
in float v_across;
in float v_alpha;
in float v_hover;
out vec4 outColor;
void main() {
  float d = abs(v_across), w = u_lineWidth * f_px;
  float core = clamp(0.5 * w + 0.5 - d, 0.0, 1.0) * min(w, 1.0);
  float gw = 0.5 * mix(u_lineGlowWidth, u_hoverGlowWidth, v_hover) * f_px;
  float glow = gw > 0.0 ? exp(-(d * d) / (gw * gw)) : 0.0;
  vec3 colour = mix(u_lineColour, mix(u_lineColour, vec3(1.0), u_hoverLighten), v_hover);
  float opacity = mix(u_lineOpacity, u_hoverOpacity, v_hover), glowAmount = mix(u_lineGlow, u_hoverGlow, v_hover);
  outColor = vec4(colour * (core * opacity + glow * glowAmount) * v_alpha, 1.0);
}`,

  // One point per star. Its magnitude is dimmed by the air it shines through (more near the
  // horizon), then compared with the faintest magnitude the twilight allows.
  starsVert: `
in vec3 a_eq;
in float a_mag;
in vec3 a_col;
out vec3 v_tint;
out float v_core;
out float v_sigma;
out float v_halo;
out float v_haloR;
out float v_size;
void main() {
  vec3 c = f_eq2cam * a_eq;
  float up = dot(f_up, a_eq); // sine of altitude
  if (up < -0.02 || c.z < BEHIND) { gl_Position = HIDDEN; gl_PointSize = 0.0; return; }
  float u = max(up, 0.0);
  float airmass = 1.0 / (u + 0.025 * exp(-11.0 * u));
  float ext = u_extinction * (airmass - 1.0);
  float m = a_mag + ext;
  float vis = 1.0 - smoothstep(f_sky.z - 0.5, f_sky.z + 0.5, m);
  float flux = pow(10.0, -0.4 * m); // 1 at magnitude 0

  // Twinkle: two sines at a per-star rate; stronger through more air.
  float id = float(gl_VertexID);
  float r1 = hash(vec3(id, 1.0, 0.0)), r2 = hash(vec3(id, 2.0, 0.0));
  float rate = u_twinkleSpeed * (0.5 + r1);
  float amp = u_twinkle * mix(0.25, 1.0, clamp((airmass - 1.0) / 3.0, 0.0, 1.0));
  float twinkle = max(0.0, 1.0 + amp * (0.6 * sin(u_realTime * rate + r2 * TAU) + 0.4 * sin(u_realTime * rate * 2.37 + r1 * 17.0)));

  v_core = u_starBrightness * pow(flux, u_starContrast) * vis * twinkle;
  v_halo = u_starHalo * sqrt(min(flux, 16.0)) * vis * twinkle;
  if (v_core < 0.003) { gl_Position = HIDDEN; gl_PointSize = 0.0; return; }
  v_tint = mix(vec3(1.0), a_col, u_starColour) * mix(vec3(1.0), vec3(1.0, 0.62, 0.35), clamp(ext * u_reddening, 0.0, 1.0));
  // At least ~¾ canvas px wide, or a star between pixel centres loses most of its light.
  v_sigma = max(u_starSize * f_px, 0.75) * (0.8 + 0.25 * pow(min(flux, 16.0), 0.25));
  v_haloR = u_haloSize * f_px * sqrt(min(flux, 16.0));
  float radius = max(3.0 * v_sigma, v_halo > 0.004 ? 2.5 * v_haloR : 0.0) + 1.0;
  v_size = min(2.0 * radius, 128.0);
  gl_PointSize = v_size;
  gl_Position = clip(project(c));
}`,
  starsFrag: `
in vec3 v_tint;
in float v_core;
in float v_sigma;
in float v_halo;
in float v_haloR;
in float v_size;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * v_size;
  float core = v_core * exp(-0.5 * d * d / (v_sigma * v_sigma));
  float halo = v_halo * exp(-3.0 * d / max(v_haloR, 1e-3)) * (1.0 - smoothstep(0.8, 1.0, 2.0 * d / v_size));
  outColor = vec4(v_tint * (core + halo), 1.0);
}`,

  // One instance per meteor slot: a streak from the tail to the head, brightest at the head.
  meteorVert: `
out float v_along;
out float v_across;
out float v_alpha;
void main() {
  int o = gl_InstanceID * METEOR_FIELDS;
  vec2 head = vec2(f_meteor[o], f_meteor[o + 1]), dir = vec2(f_meteor[o + 2], f_meteor[o + 3]);
  float tail = f_meteor[o + 4];
  v_alpha = f_meteor[o + 5];
  if (v_alpha <= 0.0 || tail <= 0.0) { gl_Position = HIDDEN; return; }
  float halfW = u_meteorWidth * f_px * 1.5 + 1.0;
  v_along = quadAlong(gl_VertexID);
  v_across = quadSide(gl_VertexID) * halfW;
  gl_Position = clip(mix(head - dir * tail, head, v_along) + vec2(-dir.y, dir.x) * v_across);
}`,
  meteorFrag: `
in float v_along;
in float v_across;
in float v_alpha;
out vec4 outColor;
void main() {
  float w = 0.5 * u_meteorWidth * f_px;
  float i = v_alpha * u_meteorBrightness * pow(v_along, 1.5) * exp(-(v_across * v_across) / (w * w));
  outColor = vec4(u_meteorColour * i, 1.0);
}`,

  // ---------------------------------------------------------------- pass 2: composite
  composite: `
uniform sampler2D u_light;
uniform sampler2D u_ridge;
out vec4 outColor;

// Twilight colours up the sky: horizon, low, middle, high, then the night colour at x = 1.
vec3 ramp(float x, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  if (x < 0.18) return mix(c0, c1, x / 0.18);
  if (x < 0.42) return mix(c1, c2, (x - 0.18) / 0.24);
  if (x < 0.68) return mix(c2, c3, (x - 0.42) / 0.26);
  return mix(c3, c4, clamp((x - 0.68) / 0.32, 0.0, 1.0));
}

void main() {
  vec2 fc = gl_FragCoord.xy;

  // This pixel's direction: invert the projection, then camera → altitude and azimuth.
  vec3 c = normalize(vec3((fc - f_center) / f_k, 1.0));
  float up = f_tilt.y * c.z + f_tilt.x * c.y;
  float north = -f_tilt.x * c.z + f_tilt.y * c.y;
  float alt = degrees(asin(clamp(up, -1.0, 1.0)));
  float az = atan(-c.x, north); // from north through east; due south = ±PI

  // --- sky: night (with airglow low down), and over it the twilight: warm toward the sun,
  // cool away from it, sinking toward the horizon as it fades
  float tw = f_sky.x;
  vec3 night = mix(u_nightHorizon, u_nightSky, smoothstep(0.0, max(u_airglowHeight, 1e-3), alt));
  float sunward = exp(-pow(wrapPi(az - f_sky.y) / radians(u_glowWidth), 2.0));
  float x = max(alt, 0.0) / (u_glowHeight * mix(1.0 - u_glowSink, 1.0, tw));
  vec3 warm = ramp(x, u_warmHorizon, u_warmLow, u_warmMid, u_warmHigh, night);
  vec3 cool = ramp(x, u_coolHorizon, u_coolLow, u_coolMid, u_coolHigh, night);
  vec3 col = mix(night, mix(cool, warm, sunward), tw);

  // --- light: stars, constellation lines, shooting stars
  col += texelFetch(u_light, ivec2(fc), 0).rgb;

  // --- ridge: the skyline traced from the photo, left to right = east to west
  float ridge = textureLod(u_ridge, vec2(wrapPi(az - PI) / radians(u_ridgeSpan) + 0.5, 0.5), 0.0).r * u_ridgeSpan * u_ridgeScale;
  float above = alt - ridge;
  float aa = fwidth(above);
  col = mix(u_ridgeColour, col, smoothstep(-aa, aa, above));

  // --- vignette, exposure
  vec2 q = (fc - 0.5 * u_res) / u_res.y;
  float edge = length(q / vec2(0.5 * u_res.x / u_res.y, 0.5));
  col *= 1.0 - u_vignette * smoothstep(0.4, 1.5, edge);
  col *= u_exposure;

  // --- dust, then grain last (src/kit/film.js)
  col = filmDust(col, fc, f_px, f_frame, u_dust);
  col = filmGrain(col, fc, f_px, f_frame, u_grainAmount, u_grainSize, u_grainSharpness, u_grainClump);

  outColor = vec4(col, 1.0);
}`,
};
