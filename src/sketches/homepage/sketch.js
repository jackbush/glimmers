// Homepage — a prototype of jackbush.github.io's light/dark switch, under the real page: each
// Projects/Roles switch runs the other theme out from the click. See NOTES.md.
//
// This file is the wiring: the switch is in switches.js, the colours under the page and the
// warp in backdrop.js, the page in page.js. It's all DOM and SVG, so the kit's canvas stays
// hidden; the kit's frame loop still drives it. The frame loop allocates nothing.

import { createBackdrop } from './backdrop.js';
import { createSwitches } from './switches.js';
import { createPage, MODES } from './page.js';
import { createTheme } from './theme.js';
import { invertHex } from './ink.js';
import { rng } from '../../kit/random.js';

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P, model }) {
  canvas.style.visibility = 'hidden';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const theme = createTheme(P, model);

  // The page over its backdrop, and the switch each tab starts. With reduced motion a switch
  // is instant.
  const switches = createSwitches(P);
  const backdrop = createBackdrop();
  document.body.append(backdrop.defs);
  const page = createPage({
    P,
    backdrop: backdrop.svg,
    onSwitch(mode, x, y) {
      const theme = MODES.indexOf(mode);
      if (reduceMotion.matches) switches.jump(theme);
      else switches.start(theme, x, y);
    },
  });

  let seen = -1, seenTheme = -1, activeTab = '';
  /** Push param and theme colour changes to the page; a new Active tab switches at once. */
  function syncParams() {
    theme.update();
    if (seen === model.version && seenTheme === theme.version) return;
    seenTheme = theme.version;
    page.sync(P, theme.rgb);
    backdrop.sync(P);
    if (seen === model.version) return;
    seen = model.version;
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
  let bars = -1, barsVersion = -1, barsTheme = -1;
  function setBars(/** @type {number} */ side) {
    if (side === bars && barsVersion === model.version && barsTheme === theme.version) return;
    bars = side;
    barsVersion = model.version;
    barsTheme = theme.version;
    const c = side ? invertHex(theme.hex) : theme.hex;
    document.documentElement.style.backgroundColor = c;
    document.body.style.backgroundColor = c;
    themeMeta?.setAttribute('content', c);
  }

  let warping = false;
  return {
    resize() {},
    frame(_t, _dt, _rt, rdt) {
      syncParams();
      demo(rdt);
      // The screen, in page px: the hidden canvas still covers it (behind mobile browser bars too).
      const vx = scrollX - page.root.offsetLeft, vy = scrollY - page.root.offsetTop;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      switches.update(rdt, vx, vy, w, h);
      page.reveal(switches);
      const warp = backdrop.update(switches, P, vx, vy, w, h);
      if (warp !== warping) page.root.style.filter = (warping = warp) ? backdrop.filter : '';
      setBars(switches.topEdge);
    },
  };
}
