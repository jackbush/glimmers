// Geode — shaders + per-frame CPU values.
//
// Passes:
//
//   bake       (INCL³ 3D texture, only when the seed changes)  The inclusion volume: milky
//              cloud (r), bubble veils (g), slow mottling (b), per-texel sparkle (a). Every
//              lattice wraps, so the volume tiles.
//   backdrop   (full res → HDR)  The studio straight ahead: what the camera sees past the cluster.
//   trace      (the cluster's box, over that)  Ray-traces the cluster (see below). The hot path.
//   bright     (¼ res)           What's over the bloom threshold.
//   blurH/V    (¼ res)           Separable blur of that.
//   composite  (full res)        HDR + bloom → exposure → tone map → vignette → grain.
//
// Trace: every body is a convex solid of planes (cluster.js), read from the `bodies[]`
// uniform buffer. A camera ray finds the nearest body (sphere cull, then exact plane tests).
// Each crystal: Fresnel reflection off the face (to the studio), refraction
// in, then up to Bounces internal segments, each exiting through the nearest face or
// reflecting totally. Along each segment light is absorbed (Beer–Lambert, deeper toward the
// tips) and scattered by the inclusions; phantoms, needles and cracks are exact hits. Out of a
// crystal the ray may enter another (up to Pass-throughs), then it reads the studio; if its
// last exit refracted, it reads the studio once per wavelength (fire).
//
// The studio, env(), is analytic: a dark backdrop whose glow takes the stone's hue plus Hue
// shift, and four rectangular softboxes (key, fill, two rims) fixed to the camera, so the
// cluster turns through them. A rough face blurs them by widening their edges.
//
// Spaces: cluster space (cluster.js) for geometry; world space for the studio, with the
// camera at +z looking down −z. f_toWorld turns cluster → world.
//
// Uniforms available in every pass:
//   u_<key>     every param in params.js without `uniform: false` (auto-declared)
//   f_<name>    per-frame values declared in frameUniforms and written by perFrame()
//   u_res       size of the current pass's render target, in px
//   u_screen    size of the final canvas, in px
//   u_time      scene seconds (scaled & pausable)
//   u_realTime  wall-clock seconds (drives the film layer)

import { FILM_GLSL } from '../../kit/film.js';
import { cluster, CRYSTAL_PLANES, MAX_CRYSTALS, PLANES_AT, ROW_W, ROWS } from './cluster.js';

const INCL = 128;          // inclusion volume edge, texels
const LIGHTS = 4;          // key, fill, rim left, rim right
const LIGHT_STRIDE = 14;   // centre 3, u 3, v 3, colour 3, half width, half height
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- CPU helpers (allocation-free)
const lin = (c) => Math.pow(c, 2.2);

// Scratch rotation matrices, row-major m[r * 3 + c].
const A = new Float64Array(9), B = new Float64Array(9), M = new Float64Array(9);
function set9(m, a, b, c, d, e, f, g, h, i) { m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = e; m[5] = f; m[6] = g; m[7] = h; m[8] = i; }
function rotX(m, a) { const c = Math.cos(a), s = Math.sin(a); set9(m, 1, 0, 0, 0, c, -s, 0, s, c); }
function rotY(m, a) { const c = Math.cos(a), s = Math.sin(a); set9(m, c, 0, s, 0, 1, 0, -s, 0, c); }
function rotZ(m, a) { const c = Math.cos(a), s = Math.sin(a); set9(m, c, -s, 0, s, c, 0, 0, 0, 1); }
const T9 = new Float64Array(9);
/** out = a · b (row-major); out may be a or b. */
function mul(out, a, b) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) T9[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  out.set(T9);
}

/** One softbox into f_lights: azimuth 0 = behind the camera, + = to the camera's right. */
function light(f, i, az, el, hw, hh, P, power) {
  const o = i * LIGHT_STRIDE, L = f.f_lights;
  const cx = Math.sin(az) * Math.cos(el), cy = Math.sin(el), cz = Math.cos(az) * Math.cos(el);
  // u: horizontal, across the light; v: up the light.
  let ux = cz, uz = -cx;
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul; uz /= ul;
  const vx = cy * uz, vy = cz * ux - cx * uz, vz = -cy * ux; // c × u
  L[o] = cx; L[o + 1] = cy; L[o + 2] = cz;
  L[o + 3] = ux; L[o + 4] = 0; L[o + 5] = uz;
  L[o + 6] = vx; L[o + 7] = vy; L[o + 8] = vz;
  const rgb = P.lightColour.rgb;
  L[o + 9] = lin(rgb[0]) * power; L[o + 10] = lin(rgb[1]) * power; L[o + 11] = lin(rgb[2]) * power;
  L[o + 12] = hw * P.lightSize.value; L[o + 13] = hh * P.lightSize.value;
}

/** One channel of HSL (h in turns) → RGB; n = 0, 8, 4 for r, g, b. */
function hslChannel(n, h, s, l) {
  const k = (n + h * 12) % 12;
  return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
}

export default {
  inclSize: INCL,
  /** Canvas px x, y, w, h that hold the cluster: the trace pass runs only there (perFrame). */
  traceBox: new Int32Array(4),

  // name → component count (1–4 → float…vec4, 9 → mat3) or [length] for a float array.
  frameUniforms: {
    f_px: 1,          // canvas px per CSS px
    f_frame: 1,       // film frame index
    f_seed: 1,
    f_camPos: 3,      // camera, cluster space
    f_cam: 9,         // camera right, up, forward (columns), cluster space
    f_toWorld: 9,     // cluster → world rotation
    f_focal: 1,       // screen distance for a short side of 1
    f_pixAngle: 1,    // radians per canvas px
    f_crystals: 1,
    f_lights: [LIGHTS * LIGHT_STRIDE],
    f_ambient: 3,     // the studio's average light, for inclusions and chips
    f_glow: 3,        // backdrop glow colour, linear
    f_sigma: 3,       // absorption per unit length
  },

  // Called once per frame. P = params by key, f = preallocated Float32Arrays. Must not allocate.
  perFrame(P, t, rt, width, height, px, f) {
    f.f_px[0] = px;
    f.f_frame[0] = Math.floor(rt * P.filmFps.value);
    f.f_seed[0] = P.seed.value;
    f.f_crystals[0] = cluster.crystals;

    // Turn: spin about the cluster's own upright, a gentle rock, then the camera's height.
    const sw = P.sway.value * DEG, ss = TAU * P.swaySpeed.value * t;
    rotY(M, P.spin.value * DEG * t);
    rotZ(A, sw * Math.sin(ss));
    rotX(B, sw * 0.7 * Math.sin(ss * 1.618 + 1.3));
    mul(M, A, M);
    mul(M, B, M);
    rotX(A, P.tilt.value * DEG);
    mul(M, A, M);
    // Column-major for GLSL.
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) f.f_toWorld[c * 3 + r] = M[r * 3 + c];

    // Camera: at +z in world, Distance from the cluster's middle, with Lens as its field of view.
    const fov = P.fov.value * DEG, focal = 0.5 / Math.tan(fov / 2);
    const D = P.distance.value, R = cluster.radius;
    f.f_focal[0] = focal;
    f.f_pixAngle[0] = 1 / (focal * Math.min(width, height));
    // Trace only the square the cluster's sphere covers on screen (all of it, close up).
    const half = D > R * 1.01 ? (focal * R) / Math.sqrt(D * D - R * R) : 1e3;
    const reach = Math.ceil(half * Math.min(width, height)) + 2;
    const box = this.traceBox;
    box[0] = Math.max(0, Math.floor(width / 2) - reach);
    box[1] = Math.max(0, Math.floor(height / 2) - reach);
    box[2] = Math.min(width, Math.floor(width / 2) + reach) - box[0];
    box[3] = Math.min(height, Math.floor(height / 2) + reach) - box[1];
    // World axis j in cluster space is row j of M.
    for (let k = 0; k < 3; k++) {
      f.f_cam[k] = M[k];            // right
      f.f_cam[3 + k] = M[3 + k];    // up
      f.f_cam[6 + k] = -M[6 + k];   // forward
      f.f_camPos[k] = D * M[6 + k] + (k === 1 ? cluster.centreY : 0);
    }

    // Softboxes. The fill mirrors the key across the camera, lower; the rims stand behind.
    const ka = P.keyAngle.value * DEG, kh = P.keyHeight.value * DEG, ra = P.rimAngle.value * DEG;
    light(f, 0, ka, kh, 0.42, 0.3, P, P.keyLight.value);
    light(f, 1, -ka * 0.85, kh * 0.3, 0.75, 0.55, P, P.fillLight.value);
    light(f, 2, -ra, 0.25, 0.07, 0.75, P, P.rimLight.value);
    light(f, 3, ra, 0.35, 0.07, 0.75, P, P.rimLight.value);
    // The studio's average light: each box's power by its size.
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let i = 0; i < LIGHTS; i++) {
        const o = i * LIGHT_STRIDE;
        sum += f.f_lights[o + 9 + c] * f.f_lights[o + 12] * f.f_lights[o + 13];
      }
      f.f_ambient[c] = sum * 0.25;
    }

    // Backdrop glow: the stone's hue, turned by Hue shift.
    const s = P.stoneColour.rgb;
    const mx = Math.max(s[0], s[1], s[2]), mn = Math.min(s[0], s[1], s[2]), d = mx - mn;
    let h = 0;
    if (d > 1e-5) {
      h = mx === s[0] ? ((s[1] - s[2]) / d) % 6 : mx === s[1] ? (s[2] - s[0]) / d + 2 : (s[0] - s[1]) / d + 4;
      h /= 6;
    }
    h = (((h + P.hueShift.value / 360) % 1) + 1) % 1;
    for (let c = 0; c < 3; c++) {
      f.f_glow[c] = lin(hslChannel(c === 0 ? 0 : c === 1 ? 8 : 4, h, P.backdropSat.value, 0.5)) * P.backdropLight.value;
      // Colour after one unit of stone is the stone colour: σ = −ln(colour) · depth.
      f.f_sigma[c] = -Math.log(Math.max(lin(s[c]), 0.002)) * P.colourDepth.value;
    }
  },

  // Prepended (after uniform declarations) to every pass.
  common: `
#define PI  3.14159265359
#define TAU 6.28318530718
${FILM_GLSL}
#define LIGHTS ${LIGHTS}
#define LS ${LIGHT_STRIDE}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// ---- the studio
vec3 backdrop(vec3 d) {
  float ang = acos(clamp(-d.z, -1.0, 1.0));
  float g = exp(-pow(ang / radians(u_glowSize), 2.0));
  return mix(lin(u_studioEdge), f_glow, g);
}
// Softboxes; rough widens their edges, keeping their power.
vec3 lights(vec3 d, float rough) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < LIGHTS; i++) {
    int o = i * LS;
    vec3 c = vec3(f_lights[o], f_lights[o + 1], f_lights[o + 2]);
    float cs = dot(d, c);
    if (cs <= 0.05) continue;
    vec3 p = d / cs;
    float hw = f_lights[o + 12], hh = f_lights[o + 13];
    float s = max(u_lightSoftness * min(hw, hh) + rough * 0.6, 1e-3);
    float u = dot(p, vec3(f_lights[o + 3], f_lights[o + 4], f_lights[o + 5]));
    float v = dot(p, vec3(f_lights[o + 6], f_lights[o + 7], f_lights[o + 8]));
    float m = (1.0 - smoothstep(hw - s, hw + s, abs(u))) * (1.0 - smoothstep(hh - s, hh + s, abs(v)));
    m *= 1.0 - 0.6 * clamp(dot(vec2(u / hw, v / hh), vec2(u / hw, v / hh)), 0.0, 1.0); // hot centre
    m *= hw * hh / ((hw + s) * (hh + s));
    sum += m * vec3(f_lights[o + 9], f_lights[o + 10], f_lights[o + 11]);
  }
  return sum;
}
vec3 env(vec3 dc, float rough) { // dc in cluster space
  vec3 d = f_toWorld * dc;
  return backdrop(d) + lights(d, rough);
}

// HDR in an 8- or 16-bit target: x / (1 + x) and back.
vec4 encodeHdr(vec3 c) { return vec4(c / (1.0 + c), 1.0); }
vec3 decodeHdr(vec4 e) { return e.rgb / max(1.0 - e.rgb, 1e-4); }
`,

  // ---------------------------------------------------------------- bake
  bake: `
#define INCL ${INCL}.0
uniform float u_slice;
out vec4 outColor;

// Gradient at a lattice point, wrapped at period, offset by the seed.
vec3 grad(vec3 c, float period) {
  uvec3 u = uvec3(ivec3(mod(c, period)) + ivec3(int(f_seed) * 131 + 7, int(f_seed) * 71 + 3, int(f_seed) * 37 + 11));
  uint h = pcg(u.x + pcg(u.y + pcg(u.z)));
  return vec3(float(h & 1023u), float((h >> 10) & 1023u), float((h >> 20) & 1023u)) / 511.5 - 1.0;
}
// Tileable gradient noise, about −1..1. p's lattice wraps every period cells.
float pnoise(vec3 p, float period) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad(i, period), f);
  float n100 = dot(grad(i + vec3(1, 0, 0), period), f - vec3(1, 0, 0));
  float n010 = dot(grad(i + vec3(0, 1, 0), period), f - vec3(0, 1, 0));
  float n110 = dot(grad(i + vec3(1, 1, 0), period), f - vec3(1, 1, 0));
  float n001 = dot(grad(i + vec3(0, 0, 1), period), f - vec3(0, 0, 1));
  float n101 = dot(grad(i + vec3(1, 0, 1), period), f - vec3(1, 0, 1));
  float n011 = dot(grad(i + vec3(0, 1, 1), period), f - vec3(0, 1, 1));
  float n111 = dot(grad(i + vec3(1, 1, 1), period), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z) * 1.6;
}
float pfbm(vec3 p, float period, int octaves) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    s += a * pnoise(p, period);
    p *= 2.0; period *= 2.0; a *= 0.5;
  }
  return s;
}

void main() {
  vec3 p = vec3(gl_FragCoord.xy, u_slice + 0.5) / INCL; // 0..1, tiles
  // Milky cloud: soft wisps, mostly clear.
  float m = pfbm(p * 4.0, 4.0, 5);
  float milk = pow(clamp((m + 0.05) * 1.6, 0.0, 1.0), 1.8);
  // Veils: thin rippled sheets (where a warped noise crosses zero), made of bubbles, in patches.
  vec3 w = vec3(pfbm(p * 2.0 + 3.1, 2.0, 2), pfbm(p * 2.0 + 7.7, 2.0, 2), pfbm(p * 2.0 + 1.3, 2.0, 2));
  float sheet = 1.0 - smoothstep(0.0, 0.045, abs(pnoise(p * 3.0 + w * 1.2, 3.0)));
  float patchy = smoothstep(-0.05, 0.25, pfbm(p * 2.0 + 9.0, 2.0, 2));
  float bubbles = mix(0.25, 1.0, step(0.6, hash(vec3(gl_FragCoord.xy, u_slice) + f_seed * 977.0)));
  float veil = sheet * patchy * bubbles;
  float mottle = clamp(pfbm(p * 2.0 + 5.0, 2.0, 3) * 0.8 + 0.5, 0.0, 1.0);
  float sparkle = hash(vec3(gl_FragCoord.xy, u_slice + 4096.0) + f_seed * 389.0);
  outColor = vec4(milk, veil, mottle, sparkle);
}`,

  // ---------------------------------------------------------------- backdrop
  // The studio straight ahead, everywhere the trace pass's box doesn't reach.
  backdrop: `
out vec4 outColor;
void main() {
  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  outColor = encodeHdr(env(normalize(f_cam * vec3(q, f_focal)), 0.0));
}`,

  // ---------------------------------------------------------------- trace
  trace: `
#define MAX_CRYSTALS ${MAX_CRYSTALS}
#define CP ${CRYSTAL_PLANES}
#define PA ${PLANES_AT}
layout(std140) uniform Bodies { vec4 bodies[${ROW_W * ROWS}]; };
uniform highp sampler3D u_incl;
out vec4 outColor;

vec4 body(int row, int k) { return bodies[row * ${ROW_W} + k]; }

// ---- geometry
bool sphereHit(vec3 ro, vec3 rd, vec4 s, float tMax) {
  vec3 oc = ro - s.xyz;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + s.w * s.w;
  if (h < 0.0) return false;
  h = sqrt(h);
  return -b + h > 0.0 && -b - h < tMax;
}
// Ray vs a convex body: entry tn through plane kn, exit tf through plane kf.
bool convexHit(int row, vec3 ro, vec3 rd, out float tn, out float tf, out int kn, out int kf) {
  tn = -1e9; tf = 1e9; kn = 0; kf = 0;
  for (int k = 0; k < CP; k++) {
    vec4 pl = body(row, PA + k);
    float dn = dot(pl.xyz, rd);
    float dist = pl.w - dot(pl.xyz, ro); // > 0: inside this face
    if (abs(dn) < 1e-8) { if (dist < 0.0) return false; continue; }
    float t = dist / dn;
    if (dn < 0.0) { if (t > tn) { tn = t; kn = k; } }
    else if (t < tf) { tf = t; kf = k; }
    if (tn > tf) return false;
  }
  return tf > max(tn, 0.0);
}
// From inside a crystal: where the ray leaves it.
float exitCrystal(int row, vec3 ro, vec3 rd, out int kf) {
  float tf = 1e9; kf = 0;
  for (int k = 0; k < CP; k++) {
    vec4 pl = body(row, PA + k);
    float dn = dot(pl.xyz, rd);
    if (dn > 1e-8) {
      float t = (pl.w - dot(pl.xyz, ro)) / dn;
      if (t < tf) { tf = t; kf = k; }
    }
  }
  return max(tf, 0.0);
}
// Nearest crystal ahead, ignoring crystal skip; false = none.
bool traceScene(vec3 ro, vec3 rd, int skip, out int id, out float tHit, out int kHit) {
  bool hit = false; id = 0; kHit = 0; tHit = 1e9;
  float tn, tf; int kn, kf;
  int nc = int(f_crystals + 0.5);
  for (int i = 0; i < MAX_CRYSTALS; i++) {
    if (i >= nc) break;
    if (i == skip || !sphereHit(ro, rd, body(i, 0), tHit)) continue;
    if (convexHit(i, ro, rd, tn, tf, kn, kf) && tn > 1e-5 && tn < tHit) { tHit = tn; id = i; kHit = kn; hit = true; }
  }
  return hit;
}

float fresnel(float cosi, float eta) { // eta = n1 / n2; Schlick
  float r0 = (1.0 - eta) / (1.0 + eta);
  r0 *= r0;
  return r0 + (1.0 - r0) * pow(1.0 - clamp(cosi, 0.0, 1.0), 5.0);
}

// ---- a crystal's inside: absorption, clouds, veils, phantoms, needles, cracks along one segment
// Returns light scattered toward the eye; trans is what gets through.
vec3 inside(int id, vec3 ro, vec3 rd, float len, float travelled, float jitter, out vec3 trans) {
  vec4 ax = body(id, 1), side = body(id, 2), rt = body(id, 3);
  vec3 axis = ax.xyz, root = rt.xyz;
  float L = ax.w, r = side.w, rnd = rt.w;
  vec3 off = vec3(rnd * 17.3, rnd * 31.1, rnd * 7.7);
  vec3 scat = vec3(0.0);
  vec3 T = vec3(1.0);
  vec3 lightIn = f_ambient * u_inclusionLight;

  // Clouds, veils and colour, marched.
  int n = int(u_inclusionSteps + 0.5);
  float dt = len / float(n);
  for (int s = 0; s < 32; s++) {
    if (s >= n) break;
    vec3 pp = ro + rd * (dt * (float(s) + jitter));
    float hgt = clamp(dot(pp - root, axis) / L, 0.0, 1.0);
    vec4 v = texture(u_incl, pp * u_inclusionScale + off);
    float milk = u_milk * v.r * mix(1.0, 2.2 * pow(1.0 - hgt, 2.0), u_milkBase);
    float veil = u_veils * v.g;
    float dens = (milk + veil) * 6.0;
    float a = 1.0 - exp(-dens * dt);
    scat += T * a * lightIn * (1.0 + 3.0 * veil * pow(v.a, 6.0));
    vec3 sigma = f_sigma * (1.0 + u_colourZoning * (2.0 * hgt - 1.0)) * (0.75 + 0.5 * v.b);
    T *= (1.0 - a) * exp(-sigma * dt);
  }

  // Phantom: the same solid shrunk about the middle; each crossing of its skin is a dusty sheet.
  // Only in a Phantom rate share of the points.
  if (u_phantom > 0.0 && hash(vec3(float(id), f_seed, 97.0)) < u_phantomRate) {
    vec3 c = root + axis * L * 0.45;
    float tn = -1e9, tf = 1e9; int kn = 0, kf = 0;
    for (int k = 0; k < CP; k++) {
      vec4 pl = body(id, PA + k);
      float d = dot(pl.xyz, c) + (pl.w - dot(pl.xyz, c)) * u_phantomSize;
      float dn = dot(pl.xyz, rd), dist = d - dot(pl.xyz, ro);
      if (abs(dn) < 1e-8) { if (dist < 0.0) { tn = 1e9; } continue; }
      float t = dist / dn;
      if (dn < 0.0) { if (t > tn) { tn = t; kn = k; } } else if (t < tf) { tf = t; kf = k; }
    }
    if (tf > tn) {
      for (int e = 0; e < 2; e++) {
        float t = e == 0 ? tn : tf;
        if (t <= 0.0 || t >= len) continue;
        vec3 hp = ro + rd * t;
        float cosk = abs(dot(rd, body(id, PA + (e == 0 ? kn : kf)).xyz));
        float dust = texture(u_incl, hp * u_inclusionScale * 2.0 + off).r;
        float sheet = clamp(u_phantom * 0.12 * (0.3 + 1.7 * dust) / max(cosk, 0.12), 0.0, 1.0);
        scat += T * sheet * lightIn * 1.5;
        T *= 1.0 - 0.5 * sheet;
      }
    }
  }

  // Rutile: thin golden needles, exact closest approach between the ray and each needle.
  int nn = int(u_needles + 0.5);
  for (int j = 0; j < 12; j++) {
    if (j >= nn) break;
    vec3 hj = vec3(float(id), float(j), f_seed);
    vec3 h3 = vec3(hash(hj + 0.5), hash(hj + 1.5), hash(hj + 2.5));
    vec3 h4 = vec3(hash(hj + 3.5), hash(hj + 4.5), hash(hj + 5.5));
    vec3 u = normalize(h4 - 0.5 + axis * 0.15);
    float nl = L * (0.25 + 0.5 * hash(hj + 6.5));
    vec3 radial = (h3 - 0.5) * 1.4 * r;
    radial -= axis * dot(radial, axis);
    vec3 a = root + axis * L * (0.15 + 0.6 * h3.y) + radial - u * nl * 0.5;
    vec3 w0 = ro - a;
    float b = dot(rd, u), d = dot(rd, w0), e = dot(u, w0);
    float den = max(1.0 - b * b, 1e-6);
    float s = clamp((b * e - d) / den, 0.0, len);
    float tq = clamp(e + b * s, 0.0, nl);
    s = clamp(b * tq - d, 0.0, len);
    vec3 dv = w0 + rd * s - u * tq;
    float dist = length(dv);
    float fp = (travelled + s) * f_pixAngle;
    float cov = 1.0 - smoothstep(u_needleWidth - fp, u_needleWidth + fp, dist);
    cov *= min(1.0, u_needleWidth / max(fp, 1e-6)); // thinner than a pixel: fainter, not wider
    if (cov > 0.001) {
      vec3 cn = dv / max(dist, 1e-6);
      vec3 gold = lin(u_needleColour);
      vec3 shade = gold * (lightIn * 0.4 + lights(f_toWorld * reflect(rd, cn), 0.05) * 0.8);
      scat += T * cov * shade;
      T *= 1.0 - cov;
    }
  }

  // A crack: a flat, ragged disc that reflects in thin-film colours.
  if (hash(vec3(float(id), f_seed, 91.0)) < u_fractures) {
    vec3 hj = vec3(float(id), f_seed, 93.0);
    vec3 fn = normalize(vec3(hash(hj), hash(hj + 1.0), hash(hj + 2.0)) - 0.5);
    vec3 fc = root + axis * L * (0.25 + 0.4 * hash(hj + 3.0));
    float dn = dot(fn, rd);
    if (abs(dn) > 1e-4) {
      float t = dot(fn, fc - ro) / dn;
      if (t > 0.0 && t < len) {
        vec3 hp = ro + rd * t;
        vec4 v = texture(u_incl, hp * 2.5 + off);
        float extent = length(hp - fc) / (r * 1.6);
        float mask = 1.0 - smoothstep(0.55, 0.75, extent + 0.45 * (v.b - 0.5) + 0.25 * v.r);
        if (mask > 0.0) {
          float film = v.b * 2.5 + length(hp - fc) * 6.0;
          vec3 irid = 0.5 + 0.5 * cos(TAU * (film + vec3(0.0, 0.33, 0.67)));
          float fr = 0.15 + 0.85 * pow(1.0 - abs(dn), 4.0);
          vec3 refl = env(reflect(rd, fn), 0.03);
          scat += T * mask * u_fractureGlow * fr * irid * refl;
          T *= 1.0 - 0.6 * mask * fr;
        }
      }
    }
  }

  trans = T;
  return scat;
}

// Bend a face's normal: growth ridges across prism faces, grain on frosted ones.
vec3 faceNormal(int id, int k, vec3 n, vec3 p, float rough, float footprint) {
  if (k < 6 && u_striations > 0.0) {
    vec4 ax = body(id, 1);
    float h = dot(p - body(id, 3).xyz, ax.xyz) * u_striationScale;
    // Ridge strength wanders smoothly along the face; ridges finer than ~4 px fade out (refraction
    // magnifies them, so the cutoff is generous).
    float amp = texture(u_incl, vec3(h * 0.013, float(id) * 0.37, 0.5)).b * (1.0 - clamp(footprint * u_striationScale * 4.0, 0.0, 1.0));
    float ridge = sin(TAU * h + 2.0 * sin(h * 0.7));
    n = normalize(n + ax.xyz * u_striations * 0.08 * amp * ridge);
  }
  if (rough > 0.0) {
    vec3 cell = floor(p * 900.0);
    n = normalize(n + rough * 0.06 * (vec3(hash(cell), hash(cell + 1.3), hash(cell + 2.7)) - 0.5));
  }
  return n;
}
// 0–1: how chipped the surface is at p (near an edge of face k).
float wear(int id, int k, vec3 p) {
  if (u_edgeWear <= 0.0) return 0.0;
  float dmin = 1e9;
  for (int j = 0; j < CP; j++) {
    if (j == k) continue;
    vec4 pl = body(id, PA + j);
    dmin = min(dmin, pl.w - dot(pl.xyz, p));
  }
  float edge = 1.0 - smoothstep(0.0, u_edgeWidth * body(id, 2).w, dmin);
  // Chips only where slow noise peaks, so most of an edge stays sharp.
  float nz = texture(u_incl, p * 6.0 + 0.71).b * 0.75 + texture(u_incl, p * 21.0).b * 0.35;
  return edge * smoothstep(1.0 - 0.45 * u_edgeWear, 1.05 - 0.45 * u_edgeWear, nz);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 q = (fc - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec3 rd = normalize(f_cam * vec3(q, f_focal));
  vec3 ro = f_camPos;
  float jitter = hash(vec3(fc, 17.0));
  float ior = u_ior;

  vec3 col = vec3(0.0), thr = vec3(1.0);
  float travelled = 0.0;
  int skip = -1;
  bool lastRefracted = false;
  vec3 lastIn = vec3(0.0), lastN = vec3(0.0);
  float lastRough = 0.0;
  int depth = int(u_depth + 0.5), bounces = int(u_bounces + 0.5);

  for (int hop = 0; hop < 4; hop++) {
    if (hop >= depth) break;
    int id, k; float t;
    if (!traceScene(ro, rd, skip, id, t, k)) break;
    vec3 p = ro + rd * t;
    travelled += t;

    // Into the crystal.
    float footprint = travelled * f_pixAngle;
    float rough = hash(vec3(float(id), float(k), f_seed + 0.5)) < u_frostShare ? u_frost : 0.0;
    float chip = wear(id, k, p);
    rough = max(rough, chip * 0.6);
    vec3 n = faceNormal(id, k, body(id, PA + k).xyz, p, rough, footprint);
    float F = fresnel(-dot(rd, n), 1.0 / ior);
    col += thr * (F * env(reflect(rd, n), rough) + chip * 0.12 * f_ambient);
    thr *= (1.0 - F) * (1.0 - 0.6 * chip);
    rd = refract(rd, n, 1.0 / ior);
    ro = p;
    lastRefracted = false;

    bool left = false;
    for (int b = 0; b < 8; b++) {
      if (b >= bounces) break;
      int kf;
      float len = exitCrystal(id, ro, rd, kf);
      vec3 trans;
      col += thr * inside(id, ro, rd, len, travelled, jitter, trans);
      thr *= trans;
      travelled += len;
      p = ro + rd * len;

      float fr = hash(vec3(float(id), float(kf), f_seed + 0.5)) < u_frostShare ? u_frost : 0.0;
      vec3 nf = faceNormal(id, kf, body(id, PA + kf).xyz, p, fr, travelled * f_pixAngle);
      float cosi = dot(rd, nf);
      vec3 o = refract(rd, -nf, ior);
      if (dot(o, o) < 1e-6) { rd = reflect(rd, -nf); ro = p; continue; } // total internal reflection
      float Fo = fresnel(cosi, ior);
      // The part reflected back inside: read the studio as if it left that way.
      col += thr * Fo * env(reflect(rd, -nf), fr) * 0.5;
      thr *= 1.0 - Fo;
      lastRefracted = true; lastIn = rd; lastN = nf; lastRough = fr;
      rd = o; ro = p; left = true;
      break;
    }
    if (!left) { lastRefracted = false; break; } // out of bounces: let it leave as it is
    if (dot(thr, thr) < 1e-6) break;
    skip = id;
  }

  // Out to the studio, split by wavelength if it last left a crystal through a face.
  if (dot(thr, thr) > 0.0) {
    if (lastRefracted && u_fire > 0.0) {
      int ns = int(u_fireSamples + 0.5);
      vec3 acc = vec3(0.0), wsum = vec3(0.0);
      for (int i = 0; i < 9; i++) {
        if (i >= ns) break;
        float x = (float(i) + 0.5) / float(ns); // 0 red … 1 violet
        vec3 dw = (x - vec3(0.12, 0.5, 0.88)) / 0.38;
        vec3 w = max(1.0 - dw * dw, 0.0);
        vec3 o = refract(lastIn, -lastN, ior + u_fire * (x - 0.5) * 2.0);
        wsum += w;
        if (dot(o, o) > 1e-6) acc += w * env(o, lastRough);
      }
      col += thr * acc / max(wsum, vec3(1e-4));
    } else {
      col += thr * env(rd, lastRough);
    }
  }
  outColor = encodeHdr(col);
}`,

  // ---------------------------------------------------------------- bloom
  bright: `
uniform sampler2D u_hdr;
out vec4 outColor;
void main() {
  // 4 bilinear taps cover the 4×4 block of full-res pixels under this one.
  vec2 px = 1.0 / u_screen, uv = gl_FragCoord.xy / u_res;
  vec3 c = decodeHdr(texture(u_hdr, uv + px * vec2(-1, -1))) + decodeHdr(texture(u_hdr, uv + px * vec2(1, -1)))
         + decodeHdr(texture(u_hdr, uv + px * vec2(-1, 1))) + decodeHdr(texture(u_hdr, uv + px * vec2(1, 1)));
  c *= 0.25 * u_exposure;
  float l = max(c.r, max(c.g, c.b));
  outColor = encodeHdr(c * max(l - u_bloomThreshold, 0.0) / max(l, 1e-4));
}`,

  blur: `
uniform sampler2D u_src;
uniform vec2 u_dir;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res, d = u_dir / u_res * f_px;
  // 9-tap Gaussian folded into 5 bilinear reads, spread wide.
  vec3 c = decodeHdr(texture(u_src, uv)) * 0.227;
  c += (decodeHdr(texture(u_src, uv + d * 1.385)) + decodeHdr(texture(u_src, uv - d * 1.385))) * 0.316;
  c += (decodeHdr(texture(u_src, uv + d * 3.231)) + decodeHdr(texture(u_src, uv - d * 3.231))) * 0.070;
  outColor = encodeHdr(c);
}`,

  // ---------------------------------------------------------------- composite
  composite: `
uniform sampler2D u_hdr;
uniform sampler2D u_bloomTex;
out vec4 outColor;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 fc = gl_FragCoord.xy, uv = fc / u_res;
  vec3 c = decodeHdr(texture(u_hdr, uv)) * u_exposure + decodeHdr(texture(u_bloomTex, uv)) * u_bloom;
  c = pow(aces(c), vec3(1.0 / 2.2));
  // Vignette toward the studio's edge colour, which the page shares.
  vec2 q = (fc - 0.5 * u_res) / u_res;
  c = mix(c, u_studioEdge, clamp(u_vignette * dot(q, q) * 2.6, 0.0, 1.0));
  c = filmDust(c, fc, f_px, f_frame, u_dust);
  c = filmGrain(c, fc, f_px, f_frame, u_grainAmount, u_grainSize, u_grainSharpness, u_grainClump);
  c += (hash(vec3(fc, f_frame)) - 0.5) / 255.0; // dither the dark gradients
  outColor = vec4(c, 1.0);
}`,
};
