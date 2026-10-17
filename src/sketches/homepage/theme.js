// Homepage — the theme colour actually in use. Normally the Theme colour param; with Hue from
// window on, an OKLCH colour set by where the browser window sits on its screen: across is hue
// (the whole wheel, left to right), down is lightness (white at the top, Min lightness at the
// bottom), so moving the window recolours the page. Browsers fire no event
// when a window moves, so its position is read every frame; the colour is worked out again
// only when the position or a param changes. Nothing here is saved: the param stays as it was.

import { oklchToRgb } from '../../kit/okhsl';

export function createTheme(/** @type {Record<string, any>} */ P, /** @type {import('../../kit/types').Model} */ model) {
  const theme = {
    /** 0–1 sRGB, updated in place. */
    rgb: new Float32Array(3),
    hex: '',
    /** Bumped whenever the colour changes. */
    version: 0,
    /** Call every frame; true when the colour changed. Allocates only when it does. */
    update,
  };
  // Captures (scripts/capture.mjs) treat the window as centred: headless Chrome puts it wherever,
  // and a cover must come out the same on any machine.
  const capture = new URLSearchParams(location.search).has('capture');
  let x = NaN, y = NaN, seen = -1;
  const next = new Float32Array(3);

  function update() {
    const follow = P.windowHue.value;
    // The window's centre as a share of the screen it's on, 0–1 from the left and from the top.
    const wx = capture ? 0.5 : follow ? (window.screenX + window.outerWidth / 2 - (screen.availLeft ?? 0)) / screen.availWidth : 0;
    const wy = capture ? 0.5 : follow ? (window.screenY + window.outerHeight / 2 - (screen.availTop ?? 0)) / screen.availHeight : 0;
    if (wx === x && wy === y && seen === model.version) return false;
    x = wx; y = wy; seen = model.version;
    if (follow) {
      const across = Math.min(1, Math.max(0, wx)), down = Math.min(1, Math.max(0, wy));
      const min = P.windowMinLightness.value;
      oklchToRgb(1 - down * (1 - min), P.windowChroma.value, across * 360 + P.windowHueOffset.value, next);
    } else {
      next.set(P.themeColour.rgb);
    }
    const n = (Math.round(next[0] * 255) << 16) | (Math.round(next[1] * 255) << 8) | Math.round(next[2] * 255);
    const hex = '#' + n.toString(16).padStart(6, '0');
    if (hex === theme.hex) return false;
    theme.hex = hex;
    for (let i = 0; i < 3; i++) theme.rgb[i] = ((n >> (16 - 8 * i)) & 255) / 255;
    theme.version++;
    return true;
  }
  return theme;
}
