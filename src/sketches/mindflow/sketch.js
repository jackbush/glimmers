// Mindflow — two circles in a Venn diagram, driven by brain data (WebGL2).
//
// Attention pulls the circles together; meditation calms their outline (each tick draws each
// circle three times, once true and twice randomly stretched). Nothing is cleared: each tick
// fades the picture toward the background in a half-float texture, then paints the six
// ellipses over it. NOTES.md has the mapping from the 2015 original and why this is WebGL.
//
// Passes: `tick` (prev texture → next texture: fade + ellipses), `show` (texture → screen),
// `copy` (old texture → resized texture). All are a fullscreen triangle.

import { rng } from '../../kit/random.js';
import { FULLSCREEN_VERT, program } from '../../kit/gl.js';

const MAX_TICKS = 8; // per frame, so a long stall doesn't trigger a burst of drawing

const TICK = `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform vec3 u_bg;
uniform float u_fade;
uniform float u_minStep; // smallest fade per tick, so the last levels never stall
uniform vec4 u_fill;     // rgb, alpha
uniform vec4 u_stroke;   // rgb, alpha
uniform float u_width;   // stroke width, px
uniform vec4 u_ellipse[6]; // centre xy, radii xy, px (y down)
uniform float u_height;
out vec4 outColor;

// Approximate signed distance (px) to an ellipse's edge: the implicit function divided by
// its gradient length. Exact for circles, close for the near-circles drawn here.
float edge(vec2 p, vec4 e) {
  vec2 q = (p - e.xy) / e.zw;
  float l = max(length(q), 1e-4);
  float g = max(length(q / e.zw) / l, 1e-6);
  return (l - 1.0) / g;
}

void main() {
  vec3 c = texelFetch(u_prev, ivec2(gl_FragCoord.xy), 0).rgb;
  vec3 gap = u_bg - c;
  c += sign(gap) * min(abs(gap), max(abs(gap) * u_fade, u_minStep));
  vec2 p = vec2(gl_FragCoord.x, u_height - gl_FragCoord.y);
  for (int i = 0; i < 6; i++) {
    float d = edge(p, u_ellipse[i]);
    c = mix(c, u_fill.rgb, u_fill.a * clamp(0.5 - d, 0.0, 1.0));
    c = mix(c, u_stroke.rgb, u_stroke.a * clamp(0.5 * u_width + 0.5 - abs(d), 0.0, 1.0));
  }
  outColor = vec4(c, 1.0);
}`;

const SHOW = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  outColor = vec4(texelFetch(u_tex, ivec2(gl_FragCoord.xy), 0).rgb, 1.0);
}`;

const COPY = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_size;     // new size
uniform vec2 u_oldSize;
uniform vec3 u_bg;
out vec4 outColor;
void main() {
  // Same scale relative to the height, same centre.
  float s = u_oldSize.y / u_size.y;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_size) * s + 0.5 * u_oldSize;
  vec2 uv = p / u_oldSize;
  bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  outColor = vec4(inside ? texture(u_tex, uv).rgb : u_bg, 1.0);
}`;

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const ellipses = new Float32Array(24);
  let rand = rng(P.seed.value), seed = P.seed.value;
  let pending = 0, w = 0, h = 0, px = 1;
  let ready = false, halfFloat = false;
  /** @type {any} */ let tickPass, showPass, copyPass;
  /** @type {(WebGLTexture | null)[]} */ let tex = [null, null];
  /** @type {(WebGLFramebuffer | null)[]} */ let fbo = [null, null];
  let cur = 0;

  function makePass(src, name, uniforms) {
    const prog = program(gl, FULLSCREEN_VERT, src, name);
    const p = { prog };
    for (const u of uniforms) p[u] = gl.getUniformLocation(prog, u);
    return p;
  }

  /** Whether an RGBA16F texture can be rendered to here (the extension alone doesn't promise it). */
  function halfFloatRenders() {
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return false;
    const t = gl.createTexture(), f = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(f);
    gl.deleteTexture(t);
    return ok;
  }

  function target(width, height) {
    const t = /** @type {WebGLTexture} */ (gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f };
  }

  function build() {
    // Half-float targets where renderable (nearly everywhere); 8-bit otherwise, which brings
    // the residue back but still works.
    halfFloat = halfFloatRenders();
    tickPass = makePass(TICK, 'tick', ['u_prev', 'u_bg', 'u_fade', 'u_minStep', 'u_fill', 'u_stroke', 'u_width', 'u_ellipse', 'u_height']);
    showPass = makePass(SHOW, 'show', ['u_tex']);
    copyPass = makePass(COPY, 'copy', ['u_tex', 'u_size', 'u_oldSize', 'u_bg']);
    gl.bindVertexArray(gl.createVertexArray());
    tex = [null, null];
    fbo = [null, null];
    ready = true;
  }

  function draw(pass, framebuffer, width, height) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(pass.prog);
  }

  function bg() { return P.background.rgb; }

  function tick() {
    const d = P.size.value * h;
    const offset = (1 - P.attention.value / 100) * P.separation.value * d;
    const range = (1 - P.meditation.value / 100) * P.jitter.value * d;
    for (let side = 0; side < 2; side++) {
      const cx = w / 2 + (side ? 1 : -1) * offset, o = side * 12;
      ellipses[o] = cx; ellipses[o + 1] = h / 2; ellipses[o + 2] = d / 2; ellipses[o + 3] = d / 2;
      ellipses[o + 4] = cx; ellipses[o + 5] = h / 2;
      ellipses[o + 6] = Math.max((d + range * rand()) / 2, 0.5); ellipses[o + 7] = Math.max((d - range * rand()) / 2, 0.5);
      ellipses[o + 8] = cx; ellipses[o + 9] = h / 2;
      ellipses[o + 10] = Math.max((d - range * rand()) / 2, 0.5); ellipses[o + 11] = Math.max((d + range * rand()) / 2, 0.5);
    }
    const next = 1 - cur;
    draw(tickPass, fbo[next], w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.uniform1i(tickPass.u_prev, 0);
    gl.uniform3fv(tickPass.u_bg, bg());
    gl.uniform1f(tickPass.u_fade, P.fade.value);
    // Half-float still stalls a few levels short (its rounding can truncate); a floor of
    // ~0.4 of a level per tick drains that. On 8-bit it has to be a whole level.
    gl.uniform1f(tickPass.u_minStep, halfFloat ? 0.0015 : 1 / 255);
    const f = P.fill.rgb, s = P.stroke.rgb;
    gl.uniform4f(tickPass.u_fill, f[0], f[1], f[2], P.fillOpacity.value);
    gl.uniform4f(tickPass.u_stroke, s[0], s[1], s[2], P.strokeOpacity.value);
    gl.uniform1f(tickPass.u_width, P.strokeWidth.value * px);
    gl.uniform4fv(tickPass.u_ellipse, ellipses);
    gl.uniform1f(tickPass.u_height, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    cur = next;
  }

  function show() {
    draw(showPass, null, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.uniform1i(showPass.u_tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function resizeTargets(width, height) {
    const a = target(width, height), b = target(width, height);
    if (tex[cur] && w && h) {
      // Copy the old picture into the new target, then drop the old ones.
      draw(copyPass, a.f, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
      gl.uniform1i(copyPass.u_tex, 0);
      gl.uniform2f(copyPass.u_size, width, height);
      gl.uniform2f(copyPass.u_oldSize, w, h);
      gl.uniform3fv(copyPass.u_bg, bg());
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.f);
      const c = bg();
      gl.clearColor(c[0], c[1], c[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    for (const t of tex) if (t) gl.deleteTexture(t);
    for (const f of fbo) if (f) gl.deleteFramebuffer(f);
    tex = [a.t, b.t];
    fbo = [a.f, b.f];
    cur = 0;
  }

  // After a lost context the trails are gone; start again from a blank background.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ready = false; });
  canvas.addEventListener('webglcontextrestored', () => { build(); if (w && h) resizeTargets(w, h); });
  build();

  return {
    resize(width, height, pxRatio) {
      // While the context is lost, just remember the size: the restore builds targets at it.
      if (ready) resizeTargets(width, height);
      w = width; h = height; px = pxRatio;
      if (ready) show();
    },
    frame(_t, dt) {
      if (!ready || !w) return;
      if (P.seed.value !== seed) { seed = P.seed.value; rand = rng(seed); }
      const step = 1 / P.tickRate.value;
      pending = Math.min(pending + dt, step * MAX_TICKS);
      while (pending >= step) {
        pending -= step;
        tick();
      }
      // The drawing buffer isn't preserved between frames, so present every frame.
      show();
    },
  };
}
