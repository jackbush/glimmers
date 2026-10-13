// Foliage — shaders.
//
// Passes:
//   1. leaves    (full res, instanced geometry → RGBA8 texture, premultiplied)
//                Fills shade themselves per pixel (two-tone halves, edge shade, hatching,
//                gloss, underside on turnovers). Strokes are extruded in the vertex shader so
//                they keep a minimum width in screen px, and antialiased analytically.
//   2. blurH     (¼ res) leaf coverage, blurred horizontally — the shadow.
//   3. blurV     (¼ res) and vertically.
//   4. composite (full res) paper ground + mottle, shadow, leaves with uneven ink,
//                vignette, grain.
//
// Uniforms available in every pass:
//   u_<key>   every param without `uniform: false` (auto-declared by sketch.js)
//   f_view    canvas size in CSS px          f_px     canvas px per CSS px
//   f_light   unit vector toward the light, CSS coords (y down)
//   f_shadow  shadow offset in uv
//   u_res     size of the current target in px

export const vertFull = `
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const leafVert = `
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_nrm;
layout(location = 2) in vec4 a_attr;   // half-width, across, along, kind
layout(location = 3) in vec2 a_fs;     // fold distance, seed
layout(location = 4) in vec4 i_m;      // instance mat2, column-major
layout(location = 5) in vec4 i_t;      // translate x, y, seed, tone
out vec2 v_bl;
out float v_fold;
out float v_acrossPx;
out float v_wPx;
out float v_seed;
flat out int v_kind;
flat out vec3 v_col;
flat out float v_side;
flat out float v_flap;

void main() {
  mat2 M = mat2(i_m.x, i_m.y, i_m.z, i_m.w);
  int kind = int(a_attr.w + 0.5);
  int k = kind & 7;
  v_flap = kind >= 8 ? 1.0 : 0.0;
  vec2 c = M * a_pos + i_t.xy;
  float sc = sqrt(abs(i_m.x * i_m.w - i_m.y * i_m.z)); // leaf units → CSS px
  v_acrossPx = 0.0;
  v_wPx = 0.0;
  if (k != 0) {
    // --- strokes: extrude along the normal, at least the finest line wide.
    vec2 nn = M * a_nrm;
    vec2 dir = nn / max(length(nn), 1e-6);
    float w = a_attr.x * sc;
    if (k == 1) w *= 1.0 + u_strokeShade * max(0.0, -dot(dir, f_light)); // heavier away from the light
    float minW = u_minLine * 0.5 * (k == 4 ? 0.55 : 1.0) * clamp(sc / 24.0, 0.0, 1.0);
    w = max(w, minW);
    float pad = w * u_strokeVariance * 0.6 + 0.8 / f_px;
    c += dir * a_attr.y * (w + pad);
    v_acrossPx = a_attr.y * (w + pad) * f_px;
    v_wPx = w * f_px;
  } else {
    // --- fills: the colour block slips a little from its outline, per leaf.
    float ang = i_t.z * 43.7;
    c += vec2(cos(ang), sin(ang)) * u_misregister * clamp(sc / 24.0, 0.0, 1.0);
  }
  v_bl = a_attr.yz;
  v_fold = a_fs.x;
  v_seed = a_fs.y + i_t.z * 7.31;
  v_kind = k;
  int tone = int(i_t.w + 0.5);
  vec3 col = tone == 0 ? u_leafA : tone == 1 ? u_leafB : tone == 2 ? u_leafC : u_accent;
  v_col = col * (1.0 + u_colourJitter * (fract(i_t.z * 91.7) - 0.5) * 2.0);
  // Which half of the leaf faces the light: the across axis (+y), in screen space.
  vec2 ac = M * vec2(0.0, 1.0);
  v_side = dot(ac / max(length(ac), 1e-6), f_light);
  gl_Position = vec4(c.x / f_view.x * 2.0 - 1.0, 1.0 - c.y / f_view.y * 2.0, 0.0, 1.0);
}`;

export const leafFrag = `
uniform sampler2D u_noise;
in vec2 v_bl;
in float v_fold;
in float v_acrossPx;
in float v_wPx;
in float v_seed;
flat in int v_kind;
flat in vec3 v_col;
flat in float v_side;
flat in float v_flap;
out vec4 o;

void main() {
  bool flap = v_flap > 0.5;
  // Turnovers: the front loses what's folded away; the flap keeps only that part.
  if (flap ? v_fold < 0.0 : v_fold > 0.0) discard;
  vec3 col;
  float alpha;
  if (v_kind == 0) {
    float across = v_bl.x, along = v_bl.y, a = abs(across);
    alpha = clamp((1.0 - a) / max(fwidth(a), 1e-4), 0.0, 1.0);
    col = v_col;
    if (flap) col = mix(col, u_undersideColour, u_underside);
    // --- half shade: the half away from the light, a flat darker tone.
    float lit = across * v_side * (flap ? -1.0 : 1.0);
    float shadeM = 1.0 - smoothstep(-0.04, 0.04, lit);
    float strength = 0.5 + 0.5 * smoothstep(0.0, 0.35, abs(v_side));
    col *= 1.0 - u_halfShade * shadeM * strength * (0.6 + 0.4 * a);
    // --- edge shade
    col *= 1.0 - u_edgeShade * a * a * a;
    // --- hatching: chevrons that sweep toward the tip like the veins, on the shaded half,
    // fading out before they get too fine to draw.
    float h = (along + a * u_hatchSlope) * u_hatchDensity + v_seed * 3.1;
    float fw = fwidth(h);
    float dl = abs(fract(h + 0.5) - 0.5);
    float lw = 0.15 * (0.45 + smoothstep(0.2, 1.0, a));
    float line = 1.0 - smoothstep(lw - fw * 0.75, lw + fw * 0.75, dl);
    float hm = u_hatching * shadeM * smoothstep(0.12, 0.7, a) * (1.0 - smoothstep(0.16, 0.36, fw)) * (flap ? 0.35 : 1.0);
    col = mix(col, u_ink, line * hm * 0.55);
    // --- gloss: a soft highlight along the lit half.
    float g = u_gloss * (1.0 - shadeM) * exp(-pow((a - 0.4) / 0.15, 2.0)) * smoothstep(0.05, 0.3, along) * (1.0 - smoothstep(0.7, 0.98, along));
    col = mix(col, u_highlight, g * 0.5);
    // --- hairiness: a velvety pale bloom toward the edge.
    col = mix(col, u_highlight, u_hairiness * 0.2 * a * a);
    // --- crease shadow on the flap.
    if (flap) col *= 1.0 - 0.28 * exp(-v_fold * 30.0);
  } else {
    // --- strokes: analytic edge, swelling and thinning along the line, broken where
    // the block printed light.
    float n1 = texture(u_noise, vec2(v_bl.y * 1.3 + v_seed * 0.173, v_seed * 0.71)).r;
    float wv = v_wPx * (1.0 + u_strokeVariance * (n1 - 0.5) * 1.6);
    alpha = clamp(wv - abs(v_acrossPx) + 0.5, 0.0, 1.0);
    float n2 = texture(u_noise, vec2(v_bl.y * 4.0 + v_seed * 0.37, v_seed * 0.29 + 0.5)).g;
    alpha *= smoothstep(u_dryBrush * 0.75 - 0.08, u_dryBrush * 0.75 + 0.04, n2);
    if (v_kind == 2 || v_kind == 3) {
      col = flap ? mix(u_veinColour, u_undersideColour, 0.35) * 0.95 : u_veinColour;
    } else if (v_kind == 6) {
      col = mix(u_stemColour, u_ink, smoothstep(0.4, 0.95, abs(v_acrossPx) / max(v_wPx, 1.0)));
    } else {
      col = u_ink;
      if (v_kind == 4) alpha *= 0.8;
    }
  }
  o = vec4(col * alpha, alpha);
}`;

export const blur = `
uniform sampler2D u_src;
uniform vec2 u_dir;    // uv step between taps
uniform vec4 u_chan;   // which channel to read
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float s = 0.0, ws = 0.0;
  for (int i = -4; i <= 4; i++) {
    float w = exp(-float(i * i) / 8.0);
    s += dot(texture(u_src, uv + u_dir * float(i)), u_chan) * w;
    ws += w;
  }
  s /= ws;
  o = vec4(s);
}`;

export const composite = `
uniform sampler2D u_leaves;
uniform sampler2D u_shadowTex;
uniform sampler2D u_noise;
out vec4 o;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 css = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / f_px;
  vec4 L = texture(u_leaves, uv);
  // --- paper: broad mottle, fibre and tooth.
  float big = texture(u_noise, css / 900.0).g + texture(u_noise, css.yx / 1370.0 + 0.37).g - 1.0;
  float fib = texture(u_noise, css / vec2(240.0, 160.0)).b - 0.5;
  float tooth = texture(u_noise, css / 60.0 + 0.21).r - 0.5;
  vec3 g = u_ground * (1.0 + u_groundMottle * big + u_paper * (fib * 0.05 + tooth * 0.1));
  // --- shadow cast on the paper, away from the light.
  float sh = texture(u_shadowTex, uv + f_shadow).r;
  g *= 1.0 - u_shadow * sh * 0.6;
  // --- leaves: ink laid down unevenly, the paper's tooth showing through where it's thin.
  float ink = texture(u_noise, css / 130.0 + 0.53).r - 0.5;
  vec3 lc = L.rgb * (1.0 + u_inkMottle * ink * 0.55);
  float thin = smoothstep(0.1, 0.4, ink * 0.8 + tooth) * u_inkMottle;
  lc = mix(lc, g * L.a, thin * 0.4);
  vec3 c = g * (1.0 - L.a) + lc;
  // --- vignette
  vec2 q = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  c *= 1.0 - u_vignette * smoothstep(0.35, 1.1, length(q)) * 0.6;
  // --- grain: static, like the paper itself.
  c += (hash(gl_FragCoord.xy) - 0.5) * u_grain;
  o = vec4(c, 1.0);
}`;
