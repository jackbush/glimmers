// Leaf — shaders: a leaf backlit on a light table, against a dark background.
//
// Two passes, straight to the canvas:
//   1. background  full screen: the background colour, mottled.
//   2. leaf        the leaf geometry (one instance, or a sprig's stem and leaves), drawn
//                  leaflet by leaflet: the fill marks the stencil, the veins are clipped
//                  to it (edges pass, then cores pass), then the outline.
//                  Blade: lit tissue, mottled, broken into capillary cells (a Voronoi
//                  network in leaf coordinates, plus a finer one inside), each cell a
//                  little brighter or darker, darkening toward the rim. Veins: a glowing
//                  core with darker edges. Outline and stem: solid, each mottled.
// Every layer is mottled by its own slice of the noise texture, in leaf coordinates, so the
// mottling sticks to the leaf and differs between layers.
//
// Uniforms:
//   u_<key>   every param without `uniform: false` (auto-declared by sketch.js)
//   f_view    canvas size in CSS px          f_px     canvas px per CSS px

export const vertFull = `
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const background = `
uniform sampler2D u_noise;
out vec4 o;
void main() {
  vec2 css = gl_FragCoord.xy / f_px;
  float n = texture(u_noise, css / 700.0).g + texture(u_noise, css.yx / 260.0 + 0.4).r - 1.0;
  o = vec4(u_background * (1.0 + u_backgroundMottle * n * 1.6), 1.0);
}`;

export const leafVert = `
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_nrm;
layout(location = 2) in vec4 a_attr;   // half-width, across, along, kind
layout(location = 3) in float a_seed;
layout(location = 4) in vec4 i_m;      // instance mat2, column-major
layout(location = 5) in vec2 i_t;      // translate
out vec2 v_bl;
out vec2 v_lp;
out float v_acrossPx;
out float v_wPx;
flat out int v_kind;

void main() {
  mat2 M = mat2(i_m.x, i_m.y, i_m.z, i_m.w);
  int k = int(a_attr.w + 0.5);
  vec2 c = M * a_pos + i_t;
  float sc = sqrt(abs(i_m.x * i_m.w - i_m.y * i_m.z)); // leaf units → CSS px
  v_acrossPx = 0.0;
  v_wPx = 0.0;
  if (k != 0) {
    vec2 nn = M * a_nrm;
    vec2 dir = nn / max(length(nn), 1e-6);
    float w = max(a_attr.x * sc, u_minLine * 0.5);
    float pad = 0.8 / f_px;
    c += dir * a_attr.y * (w + pad);
    v_acrossPx = a_attr.y * (w + pad) * f_px;
    v_wPx = w * f_px;
  }
  v_bl = a_attr.yz;
  v_lp = a_pos + a_seed * 13.7; // leaf coordinates, offset per leaflet so networks differ
  v_kind = k;
  gl_Position = vec4(c.x / f_view.x * 2.0 - 1.0, 1.0 - c.y / f_view.y * 2.0, 0.0, 1.0);
}`;

export const leafFrag = `
uniform sampler2D u_noise;
uniform float u_pass;   // 0 everything, 1 vein edges only, 2 vein cores only
in vec2 v_bl;
in vec2 v_lp;
in float v_acrossPx;
in float v_wPx;
flat in int v_kind;
out vec4 o;

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

// Distance to the nearest Voronoi cell border (two-pass, after Inigo Quilez) and the
// cell's id. Cells are the capillary areoles; borders are the capillaries.
vec3 voronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x), mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash22(n + g) * 0.85 + 0.075 - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + hash22(n + g) * 0.85 + 0.075 - f;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec3(md, n + mg);
}

// A layer's mottle, −1…1: its own offset into the noise, in leaf coordinates.
float mottle(float layer) {
  vec2 p = v_lp * u_mottleScale / 8.0 + vec2(layer * 0.37, layer * 0.61);
  return (texture(u_noise, p).r + texture(u_noise, p * 2.7 + 0.5).g * 0.5) / 1.5 * 2.0 - 1.0;
}

// Antialiased line: 1 within half-width w of a border at distance d (cell units).
float line(float d, float w) {
  float fw = fwidth(d);
  return w <= 0.0 ? 0.0 : 1.0 - smoothstep(w - fw * 0.7, w + fw * 0.7, d);
}

void main() {
  vec3 col;
  float alpha;
  if (v_kind == 0) {
    // --- blade: lit tissue.
    float a = abs(v_bl.x);
    alpha = clamp((1.0 - a) / max(fwidth(a), 1e-4), 0.0, 1.0);
    col = u_blade * (1.0 + u_bladeMottle * mottle(1.0) * 0.5);
    // Capillary cells, each a little brighter or darker; their borders are capillaries.
    vec2 cp = v_lp * u_capillaryDensity;
    vec3 c1 = voronoi(cp);
    col *= 1.0 + u_cellVariation * (hash22(c1.yz).x - 0.5) * 2.0;
    vec3 capCol = u_capillary * (1.0 + u_capillaryMottle * mottle(2.0) * 0.5);
    // Too fine to resolve at this size: fade the network out rather than let it shimmer.
    float res = 1.0 - smoothstep(0.12, 0.3, fwidth(cp.x) + fwidth(cp.y));
    float cap = line(c1.x, u_capillaryWeight * 0.5) * res;
    if (u_fineCapillaries > 0.0) {
      vec2 fp = cp * 2.4 + 17.0;
      vec3 c2 = voronoi(fp);
      float fres = 1.0 - smoothstep(0.12, 0.3, fwidth(fp.x) + fwidth(fp.y));
      cap = max(cap, line(c2.x, u_capillaryWeight * 0.32) * u_fineCapillaries * 0.75 * fres);
    }
    col = mix(col, capCol, cap);
    // Rim: the margin is thicker against the light.
    vec3 outCol = u_outlineColour * (1.0 + u_outlineMottle * mottle(4.0) * 0.5);
    col = mix(col, outCol, u_rim * smoothstep(0.8, 1.0, a) * 0.8);
  } else {
    alpha = clamp(v_wPx - abs(v_acrossPx) + 0.5, 0.0, 1.0);
    float t = abs(v_acrossPx) / max(v_wPx, 1.0); // 0 at the centre line, 1 at the edge
    if (v_kind == 2 || v_kind == 3 || v_kind == 6) {
      // --- stalks, midribs and veins are one vascular system, drawn one way: a core inside
      // an edge. o (opacity) runs from 1, a thick opaque stalk (stem colour, outlined), to 0,
      // a thin translucent vein (glowing core, darker edges), continuously across the join.
      float o = clamp(v_bl.y, 0.0, 1.0);
      float m = mix(u_veinMottle * mottle(3.0), u_stemMottle * mottle(5.0), o) * 0.5;
      vec3 coreCol = mix(u_vein, u_stemColour, o);
      vec3 edgeCol = mix(u_veinEdge, mix(u_stemColour, u_outlineColour, 0.7), o);
      float coreW = mix(u_veinCore, 0.6, o);
      // Veins inside a blade draw edges (pass 1) then cores (pass 2), so crossings merge.
      if (u_pass > 1.5) {
        alpha = clamp(v_wPx * coreW - abs(v_acrossPx) + 0.5, 0.0, 1.0);
        col = coreCol * (1.0 + m);
      } else {
        float core = u_pass > 0.5 ? 0.0 : 1.0 - smoothstep(coreW - 0.12, coreW + 0.05, t);
        col = mix(edgeCol, coreCol, core) * (1.0 + m);
      }
    } else {
      col = u_outlineColour * (1.0 + u_outlineMottle * mottle(4.0) * 0.5);
    }
  }
  o = vec4(col * alpha, alpha);
}`;
