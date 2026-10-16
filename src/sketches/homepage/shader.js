// Homepage — the backdrop shader and its per-frame CPU values.
//
// One full-resolution pass: the theme's page colour (Roles is Projects' inverse), with each switch (switches.js) laying the
// other theme over it in a wobbling ring that grows from the click.
//
// Uniforms: u_<key> for every param without `uniform: false`, f_<name> per frame (below),
// u_res (canvas px), u_screen, u_time (scene s), u_realTime.

import { MAX_POINTS, MAX_SWITCHES } from './switches.js';

const composite = `
#define TAU 6.28318530718

// Switch s's outline offset (a share of its reach) at angle a: Catmull-Rom through its points,
// as radiusAt() in switches.js.
float ringOffset(int s, float a) {
  int n = int(f_ringCount + 0.5);
  float u = fract(a / TAU) * float(n);
  int k = int(u);
  u -= float(k);
  int b = s * ${MAX_POINTS};
  float p0 = f_ring[b + (k + n - 1) % n];
  float p1 = f_ring[b + k % n];
  float p2 = f_ring[b + (k + 1) % n];
  float p3 = f_ring[b + (k + 2) % n];
  return 0.5 * (2.0 * p1 + (p2 - p0) * u + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * u * u
              + (3.0 * (p1 - p2) + p3 - p0) * u * u * u);
}

out vec4 outColor;

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = vec2(fc.x, u_res.y - fc.y) / f_px; // CSS px, y down

  // Theme: 0 = projects, 1 = roles. Each switch lays its theme over what's below.
  float th = f_baseTheme;
  float aa = 0.5 / f_px; // half a device pixel, in CSS px
  for (int s = 0; s < ${MAX_SWITCHES}; s++) {
    if (float(s) >= f_switchCount) break;
    vec2 d = p - vec2(f_switch[s * 4], f_switch[s * 4 + 1]);
    float r = f_switch[s * 4 + 2] * (1.0 + ringOffset(s, atan(d.y, d.x)));
    float ahead = r - length(d); // > 0: the front has passed
    th = mix(th, f_switch[s * 4 + 3], smoothstep(-aa, aa, ahead));
  }
  outColor = vec4(mix(u_themeColour, 1.0 - u_themeColour, th), 1.0);
}
`;

export default {
  common: '',
  composite,

  // name → component count, or [length] for a float array.
  frameUniforms: {
    f_px: 1,              // canvas px per CSS px
    f_baseTheme: 1,       // 0 projects, 1 roles
    f_switchCount: 1,
    f_switch: [MAX_SWITCHES * 4], // click x, y, reach (CSS px), theme
    f_ringCount: 1,                // outline points per switch
    f_ring: [MAX_SWITCHES * MAX_POINTS], // their offsets, as shares of the reach
  },

  /**
   * Values every pixel shares (the switches write their own). Must not allocate.
   * @param {number} px canvas px per CSS px
   * @param {Record<string, Float32Array>} f
   */
  perFrame(px, f) {
    f.f_px[0] = px;
  },
};
