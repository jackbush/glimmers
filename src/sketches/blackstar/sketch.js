// Blackstar — WebGL2 renderer.
//
// Nothing in here is design-specific: it reads the passes + perFrame() from shader.js and
// uploads every param without `uniform: false` as `u_<key>`. The frame loop allocates
// nothing, so there is no per-frame garbage for the collector to chase.

import SHADER from './shader.js';

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P, model, degrade }) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const uniformParams = model.params.filter((p) => p.uniform !== false);
  const ANG_N = SHADER.angularSize;
  const UNIT_ANGULAR = 0, UNIT_FIELDS0 = 1, UNIT_FIELDS1 = 2;

  // Per-frame CPU values (f_*): one preallocated array each, plus a flat list for the upload loop.
  /** @type {Record<string, Float32Array>} */
  const frameVals = {};
  const frameList = [];
  // Spec is a component count (1–4 → float/vec2/vec3/vec4) or [length] for a float array.
  for (const name in SHADER.frameUniforms) {
    const spec = SHADER.frameUniforms[name];
    const array = Array.isArray(spec);
    const n = array ? spec[0] : spec;
    frameVals[name] = new Float32Array(n);
    frameList.push({ name, n, array, arr: frameVals[name] });
  }

  let ready = false, vao = null, passAngular = null, passFields = null, passComposite = null;
  let angFbo = null, fldTex0 = null, fldTex1 = null, fldFbo = null, fldW = 0, fldH = 0;
  let pxRatio = 1;

  function compile(type, src, name) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader "' + name + '" failed to compile:\n' + log);
    }
    return sh;
  }
  function header() {
    const vecType = ['', 'float', 'vec2', 'vec3', 'vec4'];
    return '#version 300 es\nprecision highp float;\nprecision highp int;\n' +
      'uniform vec2 u_res;\nuniform vec2 u_screen;\nuniform float u_time;\nuniform float u_realTime;\n' +
      uniformParams.map((p) => 'uniform ' + (p.type === 'color' ? 'vec3' : 'float') + ' u_' + p.key + ';').join('\n') + '\n' +
      frameList.map((f) => f.array ? 'uniform float ' + f.name + '[' + f.n + '];' : 'uniform ' + vecType[f.n] + ' ' + f.name + ';').join('\n') + '\n' +
      SHADER.common;
  }
  function buildPass(name, head) {
    const vs = compile(gl.VERTEX_SHADER, SHADER.vert, 'vert');
    const fs = compile(gl.FRAGMENT_SHADER, head + SHADER[name], name);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('Program "' + name + '" failed to link:\n' + gl.getProgramInfoLog(prog));
    }
    const loc = (n) => gl.getUniformLocation(prog, n);
    return {
      prog,
      version: -1,
      uRes: loc('u_res'), uScreen: loc('u_screen'), uTime: loc('u_time'), uRealTime: loc('u_realTime'),
      paramLocs: uniformParams.map((p) => loc('u_' + p.key)),
      frameLocs: frameList.map((f) => loc(f.name)),
    };
  }
  function makeTexture(unit, wrapS) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex; // stays bound to its own unit for the life of the context
  }
  function buildTargets() {
    // Angular shapes: half-float where renderable (smoother edges at large undulation), else RGBA8.
    const angTex = makeTexture(UNIT_ANGULAR, gl.REPEAT);
    angFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, angFbo);
    const halfFloat = !!gl.getExtension('EXT_color_buffer_float');
    if (halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, ANG_N, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, angTex, 0);
    if (!halfFloat || gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ANG_N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    // Low-res fields: two RGBA8 targets written in one pass. Sized in sizeFields().
    fldTex0 = makeTexture(UNIT_FIELDS0, gl.CLAMP_TO_EDGE);
    fldTex1 = makeTexture(UNIT_FIELDS1, gl.CLAMP_TO_EDGE);
    fldFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fldFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fldTex0, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, fldTex1, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fldW = fldH = 0;
  }
  function sizeFields(w, h) {
    if (w === fldW && h === fldH) return;
    fldW = w;
    fldH = h;
    gl.activeTexture(gl.TEXTURE0 + UNIT_FIELDS0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.activeTexture(gl.TEXTURE0 + UNIT_FIELDS1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  function fieldsSize() {
    sizeFields(Math.max(1, Math.ceil(canvas.width / SHADER.fieldsDivisor)), Math.max(1, Math.ceil(canvas.height / SHADER.fieldsDivisor)));
  }
  function buildAll() {
    const head = header();
    passAngular = buildPass('angular', head);
    passFields = buildPass('fields', head);
    passComposite = buildPass('composite', head);
    gl.useProgram(passComposite.prog);
    gl.uniform1i(gl.getUniformLocation(passComposite.prog, 'u_angular'), UNIT_ANGULAR);
    gl.uniform1i(gl.getUniformLocation(passComposite.prog, 'u_fields0'), UNIT_FIELDS0);
    gl.uniform1i(gl.getUniformLocation(passComposite.prog, 'u_fields1'), UNIT_FIELDS1);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    buildTargets();
    fieldsSize();
    ready = true;
  }

  let sceneTime = 0, realTime = 0;
  function drawPass(pass, fbo, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pass.prog);
    gl.uniform2f(pass.uRes, w, h);
    gl.uniform2f(pass.uScreen, canvas.width, canvas.height);
    gl.uniform1f(pass.uTime, sceneTime);
    gl.uniform1f(pass.uRealTime, realTime);
    if (pass.version !== model.version) {
      for (let i = 0; i < uniformParams.length; i++) {
        const p = uniformParams[i], loc = pass.paramLocs[i];
        if (p.type === 'color') gl.uniform3fv(loc, p.rgb);
        else gl.uniform1f(loc, p.type === 'bool' ? (p.value ? 1 : 0) : p.value);
      }
      pass.version = model.version;
    }
    for (let i = 0; i < frameList.length; i++) {
      const f = frameList[i], loc = pass.frameLocs[i];
      if (f.array || f.n === 1) gl.uniform1fv(loc, f.arr);
      else if (f.n === 2) gl.uniform2fv(loc, f.arr);
      else if (f.n === 3) gl.uniform3fv(loc, f.arr);
      else gl.uniform4fv(loc, f.arr);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ready = false;
    vao = passAngular = passFields = passComposite = null;
    angFbo = fldTex0 = fldTex1 = fldFbo = null;
    degrade(0.6); // come back lighter
  });
  canvas.addEventListener('webglcontextrestored', buildAll);

  buildAll();

  return {
    resize(_w, _h, px) {
      pxRatio = px;
      if (ready) fieldsSize();
    },
    frame(t, _dt, rt) {
      if (!ready) return;
      sceneTime = t;
      realTime = rt;
      SHADER.perFrame(P, t, rt, canvas.width, canvas.height, pxRatio, frameVals);
      drawPass(passAngular, angFbo, ANG_N, 1);
      drawPass(passFields, fldFbo, fldW, fldH);
      drawPass(passComposite, null, canvas.width, canvas.height);
    },
  };
}
