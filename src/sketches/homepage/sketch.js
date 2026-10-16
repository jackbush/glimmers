// Homepage — a prototype of jackbush.github.io's light/dark switch, under the real page: each
// Projects/Roles switch runs the other theme out from the click. See NOTES.md.
//
// This file is the engine and the wiring: the GLSL and per-frame values are in shader.js,
// the switch in switches.js, the page in page.js. The frame loop allocates nothing.

import SHADER from './shader.js';
import { createSwitches } from './switches.js';
import { createPage, MODES } from './page.js';
import { invertHex } from './ink.js';
import { rng } from '../../kit/random.js';
import { FULLSCREEN_VERT, frameUniforms, program, shaderHeader, shaderParams, uploadFrame, uploadParams } from '../../kit/gl.js';

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P, model, degrade }) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');

  const uniformParams = shaderParams(model.params);
  const { vals: frameVals, list: frameList } = frameUniforms(SHADER.frameUniforms);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /** @type {null | { prog: WebGLProgram, version: number, uRes: any, uScreen: any, uTime: any, uRealTime: any, paramLocs: any[], frameLocs: any[] }} */
  let pass = null;
  function build() {
    const prog = program(gl, FULLSCREEN_VERT, shaderHeader(uniformParams, frameList) + SHADER.common + SHADER.composite, 'composite');
    const loc = (/** @type {string} */ n) => gl.getUniformLocation(prog, n);
    pass = {
      prog, version: -1,
      uRes: loc('u_res'), uScreen: loc('u_screen'), uTime: loc('u_time'), uRealTime: loc('u_realTime'),
      paramLocs: uniformParams.map((p) => loc('u_' + p.key)),
      frameLocs: frameList.map((f) => loc(f.name)),
    };
    gl.bindVertexArray(gl.createVertexArray());
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pass = null;
    degrade(0.6);
  });
  canvas.addEventListener('webglcontextrestored', build);
  build();

  // The page, and the switch each tab starts. With reduced motion a switch is instant.
  const switches = createSwitches(P);
  const page = createPage({
    P,
    onSwitch(mode, x, y) {
      const theme = MODES.indexOf(mode);
      if (reduceMotion.matches) switches.jump(theme);
      else switches.start(theme, x, y);
    },
  });

  let seen = -1, activeTab = '';
  /** Push param changes to the page; a new Active tab switches at once. */
  function syncParams() {
    if (seen === model.version) return;
    seen = model.version;
    page.sync(P);
    if (P.activeTab.value !== activeTab) {
      activeTab = P.activeTab.value;
      const mode = MODES[activeTab === 'Roles' ? 1 : 0];
      switches.jump(MODES.indexOf(mode));
      page.setMode(mode);
    }
  }

  syncParams();

  // Demo switching (Demo switch param), from a random point on the tab.
  const demoRandom = rng(P.seed.value);
  let demoWait = 0;
  function demo(/** @type {number} */ rdt) {
    const every = P.autoSwitch.value;
    if (!every || (demoWait += rdt) < every) return;
    demoWait = 0;
    const mode = MODES[1 - switches.target];
    const r = page.tab(mode).getBoundingClientRect();
    page.switchTo(mode, r.left + r.width * demoRandom(), r.top + r.height * demoRandom());
  }

  // The browser's bars take one flat colour (theme-color, and the page background in Safari), so
  // they follow the page along the top edge, Bars lead before a switch covers it. The kit sets
  // them to the Projects page on every edit, so they're set again then.
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  let bars = -1, barsVersion = -1;
  function setBars(/** @type {number} */ theme) {
    if (theme === bars && barsVersion === model.version) return;
    bars = theme;
    barsVersion = model.version;
    const c = theme ? invertHex(String(P.themeColour.value)) : String(P.themeColour.value);
    document.documentElement.style.backgroundColor = c;
    document.body.style.backgroundColor = c;
    themeMeta?.setAttribute('content', c);
  }

  let pxRatio = 1;
  return {
    resize(_w, _h, px) { pxRatio = px; },
    frame(t, _dt, rt, rdt) {
      syncParams();
      demo(rdt);
      if (!pass) return;
      const w = canvas.width / pxRatio, h = canvas.height / pxRatio;
      SHADER.perFrame(pxRatio, frameVals);
      switches.update(rdt, w, h, frameVals);
      page.reveal(switches);
      setBars(switches.topEdge);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(pass.prog);
      gl.uniform2f(pass.uRes, canvas.width, canvas.height);
      gl.uniform2f(pass.uScreen, canvas.width, canvas.height);
      gl.uniform1f(pass.uTime, t);
      gl.uniform1f(pass.uRealTime, rt);
      if (pass.version !== model.version) {
        uploadParams(gl, pass.paramLocs, uniformParams);
        pass.version = model.version;
      }
      uploadFrame(gl, pass.frameLocs, frameList);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
