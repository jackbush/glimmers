// Geode — WebGL2 renderer.
//
// Nothing in here is design-specific: it bakes the inclusion volume when the seed changes,
// uploads the cluster (cluster.js) into a uniform buffer when a param changes, and runs the
// passes in shader.js: the backdrop, then the trace within the cluster's box, into an HDR target, bloom at ¼ resolution, composite. Every
// param without `uniform: false` is `u_<key>`. The frame loop allocates nothing.

import SHADER from './shader.js';
import { buildCluster, cluster } from './cluster.js';
import { FULLSCREEN_VERT, frameUniforms, program, shaderHeader, shaderParams, uploadFrame, uploadParams } from '../../kit/gl.js';

const UNIT_INCL = 0, UNIT_HDR = 1, UNIT_BLOOM_A = 2, UNIT_BLOOM_B = 3;
const BLOOM_DIVISOR = 4;

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P, model, degrade }) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const uniformParams = shaderParams(model.params);
  const { vals: frameVals, list: frameList } = frameUniforms(SHADER.frameUniforms);
  const INCL = SHADER.inclSize;

  let ready = false, vao = null, ubo = null;
  let passBake = null, passBackdrop = null, passTrace = null, passBright = null, passBlurH = null, passBlurV = null, passComposite = null;
  let inclTex = null, bakeFbo = null, bakedSeed = NaN;
  let hdrTex = null, hdrFbo = null, bloomA = null, bloomAFbo = null, bloomB = null, bloomBFbo = null;
  let hdrW = 0, hdrH = 0, bloomW = 0, bloomH = 0, floatTargets = false;
  let clusterVersion = -1, pxRatio = 1;

  function buildPass(name, src, samplers) {
    const prog = program(gl, FULLSCREEN_VERT, shaderHeader(uniformParams, frameList) + SHADER.common + src, name);
    const loc = (n) => gl.getUniformLocation(prog, n);
    gl.useProgram(prog);
    for (const s in samplers) gl.uniform1i(loc(s), samplers[s]);
    return {
      prog,
      version: -1,
      uRes: loc('u_res'), uScreen: loc('u_screen'), uTime: loc('u_time'), uRealTime: loc('u_realTime'),
      uSlice: loc('u_slice'), uDir: loc('u_dir'),
      paramLocs: uniformParams.map((p) => loc('u_' + p.key)),
      frameLocs: frameList.map((f) => loc(f.name)),
    };
  }
  function texture2D(unit) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex; // stays bound to its own unit for the life of the context
  }
  function framebuffer(tex) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return fbo;
  }
  /** (Re)allocate a colour target: half-float where renderable, else RGBA8 (the HDR is encoded either way). */
  function allocate(unit, w, h) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (floatTargets) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  function sizeTargets() {
    const w = canvas.width, h = canvas.height;
    if (w !== hdrW || h !== hdrH) { hdrW = w; hdrH = h; allocate(UNIT_HDR, w, h); }
    const bw = Math.max(1, Math.ceil(w / BLOOM_DIVISOR)), bh = Math.max(1, Math.ceil(h / BLOOM_DIVISOR));
    if (bw !== bloomW || bh !== bloomH) { bloomW = bw; bloomH = bh; allocate(UNIT_BLOOM_A, bw, bh); allocate(UNIT_BLOOM_B, bw, bh); }
  }
  function buildAll() {
    passBake = buildPass('bake', SHADER.bake, {});
    passBackdrop = buildPass('backdrop', SHADER.backdrop, {});
    passTrace = buildPass('trace', SHADER.trace, { u_incl: UNIT_INCL });
    passBright = buildPass('bright', SHADER.bright, { u_hdr: UNIT_HDR });
    passBlurH = buildPass('blurH', SHADER.blur, { u_src: UNIT_BLOOM_A });
    passBlurV = buildPass('blurV', SHADER.blur, { u_src: UNIT_BLOOM_B });
    passComposite = buildPass('composite', SHADER.composite, { u_hdr: UNIT_HDR, u_bloomTex: UNIT_BLOOM_A });
    gl.useProgram(passBlurH.prog);
    gl.uniform2f(passBlurH.uDir, 1, 0);
    gl.useProgram(passBlurV.prog);
    gl.uniform2f(passBlurV.uDir, 0, 1);

    // The cluster's planes, as a uniform buffer.
    ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, cluster.data.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
    gl.uniformBlockBinding(passTrace.prog, gl.getUniformBlockIndex(passTrace.prog, 'Bodies'), 0);
    clusterVersion = -1;

    // Inclusion volume: tiles in every direction, baked one slice per draw.
    inclTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + UNIT_INCL);
    gl.bindTexture(gl.TEXTURE_3D, inclTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, INCL, INCL, INCL, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    bakeFbo = gl.createFramebuffer();
    bakedSeed = NaN;

    floatTargets = !!gl.getExtension('EXT_color_buffer_float');
    hdrTex = texture2D(UNIT_HDR);
    bloomA = texture2D(UNIT_BLOOM_A);
    bloomB = texture2D(UNIT_BLOOM_B);
    hdrW = hdrH = bloomW = bloomH = 0;
    sizeTargets();
    hdrFbo = framebuffer(hdrTex);
    if (floatTargets && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      floatTargets = false;
      hdrW = hdrH = bloomW = bloomH = 0;
      sizeTargets();
    }
    bloomAFbo = framebuffer(bloomA);
    bloomBFbo = framebuffer(bloomB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    ready = true;
  }

  let sceneTime = 0, realTime = 0;
  function bind(pass, fbo, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
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
  function drawPass(pass, fbo, w, h) {
    bind(pass, fbo, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function bake() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, bakeFbo);
    for (let z = 0; z < INCL; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, inclTex, 0, z);
      bind(passBake, bakeFbo, INCL, INCL);
      gl.uniform1f(passBake.uSlice, z);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    bakedSeed = P.seed.value;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ready = false;
    vao = ubo = inclTex = bakeFbo = hdrTex = hdrFbo = bloomA = bloomAFbo = bloomB = bloomBFbo = null;
    passBake = passBackdrop = passTrace = passBright = passBlurH = passBlurV = passComposite = null;
    degrade(0.6); // come back lighter
  });
  canvas.addEventListener('webglcontextrestored', buildAll);

  buildAll();

  return {
    resize(_w, _h, px) {
      pxRatio = px;
      if (ready) sizeTargets();
    },
    frame(t, _dt, rt) {
      if (!ready) return;
      sceneTime = t;
      realTime = rt;
      if (clusterVersion !== model.version) {
        buildCluster(P);
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, cluster.data);
        clusterVersion = model.version;
      }
      SHADER.perFrame(P, t, rt, canvas.width, canvas.height, pxRatio, frameVals);
      if (bakedSeed !== P.seed.value) bake();
      drawPass(passBackdrop, hdrFbo, hdrW, hdrH);
      const box = SHADER.traceBox;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(box[0], box[1], box[2], box[3]);
      drawPass(passTrace, hdrFbo, hdrW, hdrH);
      gl.disable(gl.SCISSOR_TEST);
      drawPass(passBright, bloomAFbo, bloomW, bloomH);
      drawPass(passBlurH, bloomBFbo, bloomW, bloomH);
      drawPass(passBlurV, bloomAFbo, bloomW, bloomH);
      drawPass(passComposite, null, canvas.width, canvas.height);
    },
  };
}
