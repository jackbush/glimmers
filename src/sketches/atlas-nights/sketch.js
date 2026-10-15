// Atlas Nights — WebGL2 renderer.
//
// Nothing in here is design-specific: it loads the sky data into buffers, reads the shaders
// and perFrame() from shader.js, and uploads every param without `uniform: false` as
// `u_<key>`. Lines, stars and meteors are added into a float "light" target, the flare and
// the swirl are drawn at lower resolution, and the composite pass draws the sky and puts both over it. The frame loop allocates nothing.

import SHADER, { SEG_LAYOUT } from './shader.js';
import { buildLoops, createHover } from './hover.js';
import { createInput } from './input.js';
import { createLabel } from './label.js';
import { RIDGE, RIDGE_MAX, SEGMENTS, SEGMENT_RANGES, STARS, STAR_RANGES, unpack } from './sky.js';
import { FULLSCREEN_VERT, frameUniforms, program, shaderHeader, shaderParams, uploadFrame, uploadParams } from '../../kit/gl.js';

const DEG = Math.PI / 180;
const UNIT_LIGHT = 0, UNIT_RIDGE = 1, UNIT_FIELDS = 2, UNIT_FLARE = 3;

/** RA, Dec in degrees → equatorial unit vector, written at out[o…o+2]. */
function eqVector(ra, dec, out, o) {
  const a = ra * DEG, d = dec * DEG;
  out[o] = Math.cos(d) * Math.cos(a);
  out[o + 1] = Math.cos(d) * Math.sin(a);
  out[o + 2] = Math.sin(d);
}

/**
 * A star's colour from its B-V index: the Ballesteros (2012) temperature, then Tanner Helland's
 * blackbody fit, scaled so the brightest channel is 1.
 */
function starColour(bv, out, o) {
  const t = 46 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)); // kelvin / 100
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v) => Math.max(0, Math.min(255, v));
  const max = Math.max(c(r), c(g), c(b));
  out[o] = c(r) / max;
  out[o + 1] = c(g) / max;
  out[o + 2] = c(b) / max;
}

// Star and segment attributes, built once from sky.js.
const STAR_N = STARS.length / 4;
const STAR_STRIDE = 7; // eq xyz, magnitude, colour rgb
const starAttrs = new Float32Array(STAR_N * STAR_STRIDE);
for (let i = 0; i < STAR_N; i++) {
  const v = (k) => unpack(STARS[i * 4 + k], STAR_RANGES[k]);
  const o = i * STAR_STRIDE;
  eqVector(v(0), v(1), starAttrs, o);
  starAttrs[o + 3] = v(2);
  starColour(v(3), starAttrs, o + 4);
}
const SEG_FIELDS = SEGMENT_RANGES.length;
const SEG_N = SEGMENTS.length / SEG_FIELDS;
const L = SEG_LAYOUT;
const segAttrs = new Float32Array(SEG_N * L.stride);
for (let i = 0; i < SEG_N; i++) {
  const raw = (k) => SEGMENTS[i * SEG_FIELDS + k];
  const v = (k) => unpack(raw(k), SEGMENT_RANGES[k]);
  const o = i * L.stride;
  eqVector(v(0), v(1), segAttrs, o + L.from);
  eqVector(v(2), v(3), segAttrs, o + L.to);
  eqVector(v(4), v(5), segAttrs, o + L.centre);
  segAttrs[o + L.rank] = raw(6);
  segAttrs[o + L.order] = v(7);
  segAttrs[o + L.index] = raw(8);
  segAttrs[o + L.culture] = raw(9);
}
// Every enclosed shape of every constellation, for hovering inside one.
const loops = buildLoops(segAttrs, SEG_N);
// The skyline as altitude ÷ ridge span (its heights as a share of the photo's width).
const ridgeHeights = Float32Array.from(RIDGE, (h) => (h / 65535) * RIDGE_MAX);

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P, model, degrade }) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const uniformParams = shaderParams(model.params);
  const { vals: frameVals, list: frameList } = frameUniforms(SHADER.frameUniforms);

  let ready = false, passLines = null, passStars = null, passMeteors = null, passFlare = null, passFields = null, passComposite = null;
  let lineVao = null, starVao = null, emptyVao = null;
  let lightTex = null, lightFbo = null, lightW = 0, lightH = 0, lightFormat = 0, lightType = 0;
  let fieldsTex = null, fieldsFbo = null, fieldsW = 0, fieldsH = 0;
  let flareTex = null, flareFbo = null, flareW = 0, flareH = 0;
  let pxRatio = 1;

  /** `vert` null = the fullscreen triangle; otherwise both stages get the shared header. */
  function buildPass(name, vert, frag) {
    const head = shaderHeader(uniformParams, frameList) + SHADER.common;
    const prog = program(gl, vert === null ? FULLSCREEN_VERT : head + vert, head + frag, name);
    const loc = (n) => gl.getUniformLocation(prog, n);
    return {
      prog,
      version: -1,
      uRes: loc('u_res'), uScreen: loc('u_screen'), uTime: loc('u_time'), uRealTime: loc('u_realTime'),
      paramLocs: uniformParams.map((p) => loc('u_' + p.key)),
      frameLocs: frameList.map((f) => loc(f.name)),
    };
  }
  /** A vertex array over `data`, one attribute per [name, size] in order; `divisor` 1 = per instance. */
  function attribs(prog, data, layout, divisor) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = layout.reduce((s, [, n]) => s + n, 0) * 4;
    let offset = 0;
    for (const [name, n] of layout) {
      const at = gl.getAttribLocation(prog, name);
      if (at >= 0) {
        gl.enableVertexAttribArray(at);
        gl.vertexAttribPointer(at, n, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(at, divisor);
      }
      offset += n * 4;
    }
    gl.bindVertexArray(null);
    return vao;
  }
  function buildAll() {
    passLines = buildPass('lines', SHADER.linesVert, SHADER.linesFrag);
    passStars = buildPass('stars', SHADER.starsVert, SHADER.starsFrag);
    passMeteors = buildPass('meteors', SHADER.meteorVert, SHADER.meteorFrag);
    passFlare = buildPass('flare', SHADER.flareVert, SHADER.flareFrag);
    passFields = buildPass('fields', null, SHADER.fields);
    passComposite = buildPass('composite', null, SHADER.composite);
    gl.useProgram(passComposite.prog);
    gl.uniform1i(gl.getUniformLocation(passComposite.prog, 'u_light'), UNIT_LIGHT);
    gl.uniform1i(gl.getUniformLocation(passComposite.prog, 'u_ridge'), UNIT_RIDGE);
    gl.uniform1i(gl.getUniformLocation(passComposite.prog, 'u_fields'), UNIT_FIELDS);
    gl.uniform1i(gl.getUniformLocation(passComposite.prog, 'u_flareMap'), UNIT_FLARE);

    // In SEG_LAYOUT's order. The attribute locations are fixed in the GLSL, so the flare pass
    // draws from this vertex array too.
    lineVao = attribs(passLines.prog, segAttrs, [['a_from', 3], ['a_to', 3], ['a_centre', 3], ['a_rank', 1], ['a_order', 1], ['a_index', 1], ['a_culture', 1]], 1);
    starVao = attribs(passStars.prog, starAttrs, [['a_eq', 3], ['a_mag', 1], ['a_col', 3]], 0);
    emptyVao = gl.createVertexArray();

    // Ridge: one row, mirrored beyond the traced span.
    gl.activeTexture(gl.TEXTURE0 + UNIT_RIDGE);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, ridgeHeights.length, 1, 0, gl.RED, gl.FLOAT, ridgeHeights);

    // Light: half-float where renderable (bright stars add past 1 without clipping), else RGBA8.
    gl.activeTexture(gl.TEXTURE0 + UNIT_LIGHT);
    lightTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, lightTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    lightFbo = gl.createFramebuffer();
    lightFormat = gl.getExtension('EXT_color_buffer_float') ? gl.RGBA16F : gl.RGBA8;
    lightType = lightFormat === gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    lightW = lightH = 0;

    // Swirl and flare: low resolution, smooth enough to upscale linearly.
    fieldsTex = smoothTexture(UNIT_FIELDS);
    fieldsFbo = gl.createFramebuffer();
    flareTex = smoothTexture(UNIT_FLARE);
    flareFbo = gl.createFramebuffer();
    fieldsW = fieldsH = flareW = flareH = 0;
    sizeTargets();
    ready = true;
  }
  function sizeTargets() {
    sizeLight();
    const fw = Math.max(1, Math.ceil(canvas.width / SHADER.fieldsDivisor)), fh = Math.max(1, Math.ceil(canvas.height / SHADER.fieldsDivisor));
    if (fw !== fieldsW || fh !== fieldsH) {
      fieldsW = fw;
      fieldsH = fh;
      gl.activeTexture(gl.TEXTURE0 + UNIT_FIELDS);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fieldsFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldsTex, 0);
    }
    const rw = Math.max(1, Math.ceil(canvas.width / SHADER.flareDivisor)), rh = Math.max(1, Math.ceil(canvas.height / SHADER.flareDivisor));
    if (rw !== flareW || rh !== flareH) {
      flareW = rw;
      flareH = rh;
      // Flare adds up past 1 where lines cross, so it takes the light target's format.
      gl.activeTexture(gl.TEXTURE0 + UNIT_FLARE);
      gl.texImage2D(gl.TEXTURE_2D, 0, lightFormat, rw, rh, 0, gl.RGBA, lightType, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, flareFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, flareTex, 0);
    }
  }
  /** A linearly filtered, edge-clamped texture on its own unit. */
  function smoothTexture(unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  function sizeLight() {
    const w = canvas.width, h = canvas.height;
    if (w === lightW && h === lightH) return;
    lightW = w;
    lightH = h;
    gl.activeTexture(gl.TEXTURE0 + UNIT_LIGHT);
    gl.texImage2D(gl.TEXTURE_2D, 0, lightFormat, w, h, 0, gl.RGBA, lightType, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, lightFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lightTex, 0);
    if (lightFormat === gl.RGBA16F && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      lightFormat = gl.RGBA8;
      lightType = gl.UNSIGNED_BYTE;
      lightW = 0;
      sizeLight();
    }
  }

  let sceneTime = 0, realTime = 0;
  function usePass(pass, w, h) {
    gl.useProgram(pass.prog);
    gl.uniform2f(pass.uRes, w, h);
    gl.uniform2f(pass.uScreen, canvas.width, canvas.height);
    gl.uniform1f(pass.uTime, sceneTime);
    gl.uniform1f(pass.uRealTime, realTime);
    if (pass.version !== model.version) {
      uploadParams(gl, pass.paramLocs, uniformParams);
      pass.version = model.version;
    }
    uploadFrame(gl, pass.frameLocs, frameList);
  }

  // Pointer gestures (input.js: hover, tap, drag to scrub time), what they pick (hover.js), and
  // the name and cursor (label.js). The pointer goes to hover.js in canvas px with y up.
  const label = createLabel(canvas, P, model);
  const input = createInput(canvas, P, label.move);
  const hover = createHover();
  const pointer = { x: NaN, y: NaN, tapped: false, tapX: 0, tapY: 0 };

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ready = false;
    passLines = passStars = passMeteors = passFlare = passFields = passComposite = null;
    lineVao = starVao = emptyVao = lightTex = lightFbo = fieldsTex = fieldsFbo = flareTex = flareFbo = null;
    degrade(0.6); // come back lighter
  });
  canvas.addEventListener('webglcontextrestored', buildAll);

  buildAll();

  return {
    resize(_w, _h, px) {
      pxRatio = px;
      if (ready) sizeTargets();
    },
    frame(t, _dt, rt, rdt) {
      if (!ready) return;
      sceneTime = t + input.scrub;
      realTime = rt;
      const w = canvas.width, h = canvas.height;
      SHADER.perFrame(P, sceneTime, rt, w, h, pxRatio, frameVals);
      pointer.x = input.x * pxRatio;
      pointer.y = h - input.y * pxRatio;
      if (input.tapped) {
        input.tapped = false;
        pointer.tapped = true;
        pointer.tapX = input.tapX * pxRatio;
        pointer.tapY = h - input.tapY * pxRatio;
      }
      label.show(hover.update(P, frameVals, segAttrs, SEG_N, loops, pointer, rt, rdt, pxRatio));
      // A tap's name rides on the tapped point of the sky.
      if (hover.anchored) label.move(hover.anchor[0] / pxRatio, (h - hover.anchor[1]) / pxRatio);

      // Light: lines, stars and meteors added together.
      gl.bindFramebuffer(gl.FRAMEBUFFER, lightFbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      usePass(passLines, w, h);
      gl.bindVertexArray(lineVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, SEG_N);
      usePass(passStars, w, h);
      gl.bindVertexArray(starVao);
      gl.drawArrays(gl.POINTS, 0, STAR_N);
      usePass(passMeteors, w, h);
      gl.bindVertexArray(emptyVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, SHADER.maxMeteors);

      // Flare: light leaking off the lines, at half resolution (its edges are crisp).
      gl.bindFramebuffer(gl.FRAMEBUFFER, flareFbo);
      gl.viewport(0, 0, flareW, flareH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      usePass(passFlare, flareW, flareH);
      gl.bindVertexArray(lineVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, SEG_N);
      gl.disable(gl.BLEND);

      // Fields: the swirl, at low resolution.
      gl.bindVertexArray(emptyVao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fieldsFbo);
      gl.viewport(0, 0, fieldsW, fieldsH);
      usePass(passFields, fieldsW, fieldsH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Composite to the canvas.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      usePass(passComposite, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
