// Leaf — shaders: a botanical study in fineliner (and watercolour) on warm paper.
//
// Two passes, straight to the canvas, drawn only when something changes (see sketch.js):
//   1. background  the paper: its colour and grain.
//   2. leaf        the leaf geometry (one instance, or a sprig's stem and leaves), drawn
//                  leaflet by leaflet: the fill marks the stencil, the veins are clipped to
//                  it, then the pen outline. Fruit and flowers last, filled like leaves in their
//                  colours.
//
// The finish is three layers, each on or off (Finish: Outline, Shading, Watercolour). With all
// off, fills are bare paper (they still hide what's beneath).
//   u_penLines     pen outline, and pen edges along veins and stalks.
//   u_shading      hatching: solid lines only, tone from how many lines are drawn, wandering
//                  and broken like a hand-held fineliner. No greys. Its own width and ink.
//   u_watercolour  a transparent wash under the pen work: shaded half, blooms, grain, a halo
//                  (or overshoot) against the pen line, lifted veins.
// Outline lines are all the same fine width, like one fineliner. Veins are drawn along both
// edges (one line down the thinnest); stalks are pen-edged and fade into the midrib
// (`o` in the along slot: 1 stalk → 0 vein).
//
// Uniforms:
//   u_<key>   every param without `uniform: false` (auto-declared by sketch.js), including
//             the finish's three toggles (0 or 1)
//   f_view    canvas size in CSS px          f_px     canvas px per CSS px

const paperFn = `
uniform sampler2D u_noise;
// The paper's grain, −0.5…0.5, in screen space: shared by the paper and the wash.
float grainAt() {
  // Spread the texture over 4× the grain size (so its features are about that size); two
  // rotated, mismatched lookups hide the repeat.
  vec2 p = gl_FragCoord.xy / f_px / (u_grainScale * 4.0);
  vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * p * 1.37 + 0.31;
  return (texture(u_noise, p).r + texture(u_noise, r).r) * 0.5 - 0.5;
}
vec3 paperAt() {
  float broad = texture(u_noise, gl_FragCoord.xy / f_px / 900.0).g - 0.5;
  return u_paper * (1.0 + u_grain * (grainAt() * 0.07 + broad * 0.03));
}
`;

export const background = paperFn + `
out vec4 o;
void main() { o = vec4(paperAt(), 1.0); }`;

export const leafVert = `
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_nrm;
layout(location = 2) in vec4 a_attr;   // half-width, across, along, kind
layout(location = 3) in float a_seed;
layout(location = 4) in vec4 i_m;      // instance mat2, column-major
layout(location = 5) in vec2 i_t;      // translate
out vec2 v_bl;
out vec2 v_lp;
out vec2 v_pos;
out float v_s;
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
  v_s = 0.0;
  if (k == 0 || k >= 7) {
    // Fills (leaf, bud, fruit, petals, flower centres): v_s is the signed distance past the margin along each spoke, as a share of the
    // spoke (−1 at the midrib, 0 at the margin). For a wash that overshoots the pen line,
    // margin vertices are pushed out along their spoke first.
    float grow = u_watercolour > 0.5 ? max(0.0, u_washGapJitter - u_washGap) + 0.003 : 0.0;
    bool outer = abs(a_attr.y) > 0.5;
    c += (M * a_nrm) * (outer ? grow * a_attr.x : 0.0);
    v_s = outer ? grow : -1.0;
  } else {
    vec2 nn = M * a_nrm;
    vec2 dir = nn / max(length(nn), 1e-6);
    float w = max(a_attr.x * sc, u_minLine * 0.5);
    float pad = 0.8 / f_px;
    c += dir * a_attr.y * (w + pad);
    v_acrossPx = a_attr.y * (w + pad) * f_px;
    v_wPx = w * f_px;
  }
  v_bl = a_attr.yz;
  v_lp = a_pos + a_seed * 13.7; // leaf coordinates, offset per leaflet so noise differs
  v_pos = a_pos;
  v_kind = k;
  gl_Position = vec4(c.x / f_view.x * 2.0 - 1.0, 1.0 - c.y / f_view.y * 2.0, 0.0, 1.0);
}`;

export const leafFrag = paperFn + `
uniform float u_stemBase; // 1 while drawing the main stem (its base fades out)
uniform float u_pass;   // 0 everything; veins: 1 pooling, 3 mark insides, 4 pen edges, 2 fill insides
in vec2 v_bl;
in vec2 v_lp;
in vec2 v_pos;
in float v_s;
in float v_acrossPx;
in float v_wPx;
flat in int v_kind;
out vec4 o;

// A smooth noise field in leaf coordinates, −0.5…0.5; layer picks an independent slice.
float field(vec2 p, float layer) { return texture(u_noise, p + vec2(layer * 0.37, layer * 0.61)).g - 0.5; }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Pigment on paper at density d (0 = bare paper).
vec3 wash(vec3 paper, vec3 pig, float d) { return mix(paper, pig, clamp(d, 0.0, 1.0)); }
// Half-width of every pen line, in device px.
float penW() { return max(u_minLine * 0.5 * f_px, 0.35); }
// A solid pen line of half-width penW() at distance d (device px) from its centre.
float pen(float d) { return clamp(penW() - d + 0.5, 0.0, 1.0); }
// The same for hatching, at Hatch weight.
float hatchPen(float d) { return clamp(max(u_hatchWeight * 0.5 * f_px, 0.35) - d + 0.5, 0.0, 1.0); }
// The fineliner skipping now and then.
float skipAt(vec2 p) { return smoothstep(u_penSkip * 0.7, u_penSkip * 0.7 + 0.12, field(p * 9.0, 5.0) + 0.5); }

// One family of hand hatching at angle th (mirrored across the midrib, like veins): solid
// lines, drawn or left out stroke by stroke so that about tone of them appear.
float hatch(vec2 p, float th, float tone, float layer) {
  vec2 q = vec2(p.x, abs(p.y));
  vec2 d = vec2(cos(th), sin(th)), n = vec2(-d.y, d.x);
  float h = dot(q, n) * u_hatchDensity + u_hatchWonk * field(q * 3.0, layer) * 2.2;
  float fw = max(fwidth(h), 1e-4);
  float li = floor(h + 0.5);
  // Along each line: short strokes, each kept or dropped, with small gaps between them.
  float g = dot(q, d) * u_hatchDensity * mix(0.6, 0.18, u_hatchWonk) + hash21(vec2(li, layer)) * 9.0;
  float seg = floor(g);
  float keep = step(hash21(vec2(li, seg + layer * 31.0)), tone);
  float gapIn = step(fract(g), 1.0 - 0.18 * u_hatchWonk);
  // Too dense to draw at this size: leave lines out rather than let them merge into grey.
  keep *= step(hash21(vec2(li * 1.7, layer)), clamp(0.35 / fw, 0.0, 1.0));
  return hatchPen(abs(fract(h + 0.5) - 0.5) / fw) * keep * gapIn;
}

void main() {
  vec3 col;
  float alpha;
  vec3 paper = paperAt();
  float skip = skipAt(v_lp);
  if (v_kind == 0 || v_kind >= 7) {
    bool bud = v_kind == 7, fruit = v_kind == 8 || v_kind == 13; // fruit and nuts take gloss
    float across = v_bl.x, a = abs(across);
    float fw = max(fwidth(v_s), 1e-4);
    float inside = clamp(-v_s / fw, 0.0, 1.0);            // within the pen outline
    col = paper;
    alpha = inside;
    // Which half is shaded, bleeding unevenly across the midrib.
    float bleed = across + field(v_lp * 1.4, 2.0) * u_shadeBlend * 0.8;
    float shaded = 1.0 - smoothstep(-u_shadeBlend * 0.5, u_shadeBlend * 0.5, bleed);
    // Gloss: a fruit's highlight on its lit side, a patch reserved from the wash with a crisp
    // edge that wanders like the wash's own (Halo jitter), growing with Gloss. across runs −1…1
    // over the width, along 0…1 over the length, so ×2 makes it round on a round fruit.
    float gloss = 0.0;
    if (fruit && u_fruitGloss > 0.0) {
      float gd = length(vec2(across - 0.4, (v_bl.y - 0.68) * 2.0)) + u_washGapJitter * field(v_lp * 6.0, 7.0);
      gloss = clamp((0.3 * u_fruitGloss - gd) / max(fwidth(gd), 1e-4), 0.0, 1.0) * u_fruitHighlightOpacity * inside;
    }
    if (u_watercolour > 0.5) {
      // --- the wash, stopping short of (or overshooting) the pen line by a wandering margin.
      float gap = (u_washGap + u_washGapJitter * field(v_lp * 2.2, 7.0) * 2.0) * smoothstep(0.0, 0.08, v_bl.y);
      float washIn = clamp((-gap - v_s) / fw, 0.0, 1.0);
      vec3 pig = bud ? mix(u_budColour, u_budShade, shaded * u_halfShade)
        : v_kind == 8 || v_kind == 14 ? mix(u_fruitColour, u_fruitShade, shaded * u_halfShade)
        : v_kind == 13 ? mix(u_seedColour, u_seedShade, shaded * u_halfShade)
        : v_kind == 12 ? u_fruitFlesh * mix(1.0, 0.9, shaded * u_halfShade)
        : v_kind == 15 ? u_seedScar * mix(1.0, 0.85, shaded * u_halfShade)
        : v_kind == 9 ? mix(u_flowerColour, u_flowerShade, shaded * u_halfShade)
        : v_kind == 10 ? u_flowerCentre * mix(1.0, 0.55, shaded * u_halfShade)
        : v_kind == 11 ? mix(u_bractColour, u_leafShade, shaded * u_halfShade * 0.4)
        : mix(u_leafWash, u_leafShade, shaded * u_halfShade);
      float d = u_washDensity;
      d *= 1.0 + u_bloom * field(v_lp * u_bloomScale / 6.0, 1.0) * 1.4;     // blooms
      d *= 1.0 + u_grain * grainAt() * 0.9;                                  // granulation
      d += u_edgeDarken * 0.45 * (1.0 - smoothstep(0.0, 0.06, -gap - v_s)); // dried rim
      col = mix(paper, wash(paper, pig, d), washIn);
      alpha = max(inside, washIn);
    }
    col = mix(col, u_fruitHighlight, gloss);
    // Stomatal bands: pale stripes along a leaf, two either side of the midrib or one down the
    // middle, with a crisp edge like a reserved wash, fading in and out at the base and tip.
    float band = 0.0;
    if (v_kind == 0 && u_stomata > 0.0) {
      float d = u_stomataBands > 1.5 ? abs(a - 0.5) : a, hw = u_stomataBands > 1.5 ? 0.13 : 0.3;
      band = u_stomata * clamp((hw - d) / max(fwidth(d), 1e-4), 0.0, 1.0) * smoothstep(0.03, 0.12, v_bl.y) * (1.0 - smoothstep(0.85, 0.97, v_bl.y)) * inside;
      col = mix(col, u_stomataColour, band);
    }
    if (u_shading > 0.5) {
      // --- pen hatching: more lines where it's darker; cross-hatching in the darkest.
      float tone = u_hatching * clamp(shaded * 0.7 + smoothstep(0.55, 1.0, a) * 0.45 + field(v_lp * 2.0, 4.0) * 0.4, 0.0, 1.0);
      float th = radians(u_hatchAngle);
      float lines = hatch(v_pos, th, tone, 1.0);
      lines = max(lines, hatch(v_pos, th - 1.4, (tone - 0.5) * 2.0 * u_crossHatch, 2.0));
      col = mix(col, u_hatchColour, lines * (1.0 - gloss) * (1.0 - band) * u_hatchOpacity * inside);
    }
  } else {
    float ax = abs(v_acrossPx);
    float line = clamp(v_wPx - ax + 0.5, 0.0, 1.0);
    // Pen along a line's edges, or once down the middle if it's too thin for two.
    float edgeAt = v_wPx * 0.8;
    float edges = edgeAt > penW() * 2.5 ? pen(abs(ax - edgeAt)) : pen(ax);
    if (v_kind == 2 || v_kind == 3 || v_kind == 6) {
      float o = clamp(v_bl.y, 0.0, 1.0); // 1 stalk … 0 vein
      // Veins are drawn as one network per leaflet (see sketch.js, drawLeaf): their insides
      // are marked in the stencil first, so pen edges stop where another vein's inside
      // begins, and each inside pixel is filled once (no stacking where strips overlap).
      float inner = edgeAt > penW() * 2.5 ? edgeAt - penW() : 0.0;  // inside, up to the pen
      float o2 = clamp(o * 2.0, 0.0, 1.0);  // the midrib's base still carries the stalk's wash
      if (u_pass > 3.5) {
        // Pen along the edges (or down the middle of the thinnest).
        alpha = edges * mix(u_penVeins, u_penOpacity, o2) * skip * u_penLines;
        col = u_penColour;
      } else if (u_pass > 2.5) {
        if (ax > inner) discard;
        alpha = 0.0; col = vec3(0.0);
      } else if (u_pass > 1.5) {
        // Inside: kept clear of hatching; in watercolour, lifted toward paper (or, at the
        // midrib's base, the stalk's wash carrying on).
        alpha = clamp(inner - ax + 0.5, 0.0, 1.0);
        vec3 lifted = u_watercolour > 0.5 ? wash(paper, mix(u_leafWash, u_leafShade, 0.3), u_washDensity * (1.0 - u_veinLift)) : paper;
        vec3 stalk = u_watercolour > 0.5 ? wash(paper, u_stemWash, 0.85 + u_grain * grainAt() * 0.5) : paper;
        col = mix(lifted, stalk, o2);
      } else if (u_pass > 0.5) {
        // Watercolour only: pigment pooled along the vein's sides.
        alpha = u_watercolour > 0.5 ? line * u_veinPool * (1.0 - o) * smoothstep(0.55 * v_wPx, v_wPx, ax) * (1.0 - smoothstep(0.85 * v_wPx, v_wPx, ax)) * 0.8 : 0.0;
        col = wash(paper, u_leafShade, u_washDensity + 0.3);
      } else {
        // Stalk: a wash between pen edges, with fibrous texture and a little pen shading;
        // fades out as it becomes the midrib. The main stem's base fades away.
        float sa = v_acrossPx / max(v_wPx, 1.0);          // −1…1 across the stalk
        float along = length(v_pos);                       // leaf units from the base
        // Texture: streaks running along the stalk.
        float fib = field(vec2(sa * 1.3, along * 0.35), 8.0) + 0.6 * field(vec2(sa * 3.1, along * 0.9), 9.0);
        float d = 0.85 * (1.0 + u_stemTexture * fib * 1.4) + u_grain * grainAt() * 0.5;
        // Base: the wash thins out and the pen breaks up over the last Stem fade.
        float base = u_stemBase > 0.5 ? smoothstep(0.0, max(u_stemFade, 1e-3), along) : 1.0;
        float gaps = field(vec2(along * 18.0, sa > 0.0 ? 1.7 : 4.3), 6.0) + 0.5;
        float penKeep = u_stemBase > 0.5 ? step(1.0 - base, gaps * 0.9) : 1.0;
        vec3 fillCol = u_watercolour > 0.5 ? wash(paper, u_stemWash, d * base) : paper;
        float edgeP = pen(abs(ax - max(v_wPx - penW(), 0.0))) * u_penOpacity * skip * penKeep * u_penLines;
        // Pen shading: short broken strokes across the shaded side.
        float hs = along * u_hatchDensity * 0.9 + field(vec2(along * 4.0, sa), 3.0) * 0.6;
        float fwh = max(fwidth(hs), 1e-4);
        float shadeSide = smoothstep(0.05, 0.5, -sa) * u_stemShading * u_shading;
        float keepH = step(hash21(vec2(floor(hs + 0.5), 3.7)), shadeSide * base) * step(fwh, 0.4);
        float hatchP = hatchPen(abs(fract(hs + 0.5) - 0.5) / fwh) * keepH * u_hatchOpacity;
        col = mix(mix(fillCol, u_hatchColour, hatchP), u_penColour, edgeP);
        float fillA = u_watercolour > 0.5 ? mix(max(edgeP, hatchP), 1.0, base) : 1.0;
        alpha = line * smoothstep(0.0, 0.3, o) * fillA;
      }
    } else {
      // Pen outline.
      alpha = line * u_penOpacity * skip * u_penLines;
      col = u_penColour;
    }
  }
  o = vec4(col * alpha, alpha);
}`;
