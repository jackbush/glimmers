// Foliage — shaders.
//
// One pass: instanced leaf geometry drawn straight onto the canvas (cleared to the ground
// colour), premultiplied. Everything is printed as a woodcut or etching would allow: flat
// inks only, no gradients. Tone comes from line, never from shading a colour:
//   - fills are one flat ink per leaf (surface / underside, autumn or not);
//   - hatching lines are solid ink. Toward the margin they swell wider, a second set
//     doubles their density, and contour lines cross them where it's darkest;
//   - every edge (fill, line, hatch) is torn a little by fine noise, and lines break where
//     the block printed light.
// Each leaf's own lower (−y) half is its shaded half; mirrored and underside leaves vary it.
//
// Uniforms:
//   u_<key>   every param without `uniform: false` (auto-declared by sketch.js)
//   f_view    canvas size in CSS px          f_px     canvas px per CSS px

export const leafVert = `
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_nrm;
layout(location = 2) in vec4 a_attr;   // half-width, across, along, kind
layout(location = 3) in float a_seed;
layout(location = 4) in vec4 i_m;      // instance mat2, column-major
layout(location = 5) in vec4 i_t;      // translate x, y, seed, tone
layout(location = 6) in float i_fade;  // 1 → 0 as a deleted leaf fades
out vec2 v_bl;
out vec2 v_lp;
out float v_acrossPx;
out float v_wPx;
out float v_alongPx;
out float v_seed;
flat out int v_kind;
flat out int v_tone;
flat out float v_fade;

void main() {
  mat2 M = mat2(i_m.x, i_m.y, i_m.z, i_m.w);
  int k = int(a_attr.w + 0.5);
  vec2 c = M * a_pos + i_t.xy;
  float sc = sqrt(abs(i_m.x * i_m.w - i_m.y * i_m.z)); // leaf units → CSS px
  v_acrossPx = 0.0;
  v_wPx = 0.0;
  if (k != 0) {
    // --- strokes: extrude along the normal, at least the finest line wide.
    vec2 nn = M * a_nrm;
    vec2 dir = nn / max(length(nn), 1e-6);
    float w = a_attr.x * sc;
    if (k == 1) w *= 1.0 + u_strokeShade * max(0.0, -a_nrm.y); // heavier along the shaded half
    w = max(w, u_minLine * 0.5 * clamp(sc / 24.0, 0.0, 1.0));
    float pad = w * u_strokeVariance * 0.6 + u_ragged + 0.8 / f_px;
    c += dir * a_attr.y * (w + pad);
    v_acrossPx = a_attr.y * (w + pad) * f_px;
    v_wPx = w * f_px;
  } else {
    // --- fills: the colour block slips a little from its outline, per leaf.
    float ang = i_t.z * 43.7;
    c += vec2(cos(ang), sin(ang)) * u_misregister * clamp(sc / 24.0, 0.0, 1.0);
  }
  v_bl = a_attr.yz;
  v_lp = a_pos;
  v_alongPx = a_attr.z * sc;
  v_seed = a_seed + i_t.z * 7.31;
  v_kind = k;
  v_tone = int(i_t.w + 0.5);
  v_fade = i_fade;
  gl_Position = vec4(c.x / f_view.x * 2.0 - 1.0, 1.0 - c.y / f_view.y * 2.0, 0.0, 1.0);
}`;

export const leafFrag = `
uniform sampler2D u_noise;
in vec2 v_bl;
in vec2 v_lp;
in float v_acrossPx;
in float v_wPx;
in float v_alongPx;
in float v_seed;
flat in int v_kind;
flat in int v_tone;
flat in float v_fade;
out vec4 o;

// Antialiased solid line: 1 inside a band of half-width w (in the units of d), 0 outside.
float band(float d, float w, float fw) { return w <= 0.0 ? 0.0 : 1.0 - smoothstep(w - fw * 0.6, w + fw * 0.6, d); }

void main() {
  vec2 css = gl_FragCoord.xy / f_px;
  // Fine tearing noise in screen space, ±0.5: every edge is a little ragged.
  float tear = texture(u_noise, css / 9.0 + v_seed * 0.37).r - 0.5;
  bool under = v_tone >= 2;
  vec3 col;
  float alpha;
  if (v_kind == 0) {
    float across = v_bl.x, along = v_bl.y, a = abs(across);
    float fwa = max(fwidth(a), 1e-4);
    alpha = clamp((1.0 - a) / fwa + tear * 2.0 * u_ragged * f_px, 0.0, 1.0);
    col = v_tone == 0 ? u_leafSurface : v_tone == 1 ? u_autumnSurface : v_tone == 2 ? u_leafUnderside : u_autumnUnderside;

    // --- shading by line. S is how heavily this spot is shaded, 0…1: near the margin, and
    // further in (and along the midrib) on the shaded half.
    float shaded = 1.0 - smoothstep(-0.05, 0.05, across);
    float reach = max(u_hatchReach, 1e-3);
    float S = mix(smoothstep(1.0 - reach * 0.6, 1.0, a) * 0.7,
                  max(smoothstep(1.0 - reach, 0.97, a), 0.55 * (1.0 - smoothstep(0.0, 0.18 * reach, a))),
                  shaded);
    // Hatch lines are evenly spaced in leaf units: chevrons off the midrib that sweep
    // toward the tip like the veins, wobbling a little like a hand-cut line.
    vec2 lp = v_lp;
    float wob = texture(u_noise, lp * 3.0 + v_seed * 0.11).g - 0.5;
    float h = (lp.x + abs(lp.y) * u_hatchSlope) * u_hatchDensity + v_seed * 3.1 + wob * 0.35;
    float fw = fwidth(h);
    float rag = tear * 0.06 * u_ragged * min(1.0, S * 4.0); // torn edges, only on lines that exist
    // Set A wherever shaded; it swells with S, so lines taper to points where shading ends.
    float lines = band(abs(fract(h + 0.5) - 0.5), 0.36 * u_hatchWeight * S + rag, fw);
    // Set B, between them, only where it's darker: density doubles. Widths are capped so
    // the lines never close up into a solid tone.
    float sB = clamp(S * 2.0 - 1.0, 0.0, 1.0);
    lines = max(lines, band(abs(fract(h) - 0.5), 0.22 * u_hatchWeight * sB + rag * step(0.001, sB), fw));
    // Cross-hatch: a second chevron family at a steeper angle, darkest areas only.
    float cc = (abs(lp.y) - lp.x * 0.35) * u_hatchDensity * 0.8 + wob * 0.25;
    float fwc = fwidth(cc);
    float sC = clamp((S - 0.6) / 0.4, 0.0, 1.0) * u_crossHatch;
    lines = max(lines, band(abs(fract(cc + 0.5) - 0.5), 0.25 * u_hatchWeight * sC + rag * step(0.001, sC), fwc));
    // Too fine to cut at this size: leave it out rather than smear it into a tone.
    lines *= 1.0 - smoothstep(0.25, 0.4, max(fw, fwc * step(0.001, u_crossHatch)));
    col = mix(col, u_ink, lines);
  } else {
    // --- strokes: torn edges, swelling and thinning along the line, broken where the
    // block printed light.
    float n1 = texture(u_noise, vec2(v_bl.y * 1.3 + v_seed * 0.173, v_seed * 0.71)).r;
    float wv = v_wPx * (1.0 + u_strokeVariance * (n1 - 0.5) * 1.6);
    float edgeTear = texture(u_noise, vec2(v_alongPx / 5.0, sign(v_acrossPx) * 3.7 + v_seed)).r - 0.5;
    alpha = clamp(wv + edgeTear * 2.0 * u_ragged * f_px - abs(v_acrossPx) + 0.5, 0.0, 1.0);
    float n2 = texture(u_noise, vec2(v_alongPx / 40.0 + v_seed * 0.37, v_seed * 0.29 + 0.5)).g;
    alpha *= step(u_dryBrush * 0.75, n2 + tear * 0.15);
    if (v_kind == 2 || v_kind == 3) {
      // Upper side: veins cut into the block, pale. Underside: raised, printed in ink.
      col = under ? u_ink : u_veinColour;
    } else if (v_kind == 6) {
      col = abs(v_acrossPx) > max(v_wPx, 1.0) * 0.6 ? u_ink : u_stemColour;
    } else {
      col = u_ink;
    }
  }
  alpha *= v_fade;
  o = vec4(col * alpha, alpha);
}`;
