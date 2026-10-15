// Atlas Nights — the constellation name that follows the pointer (italic serif on a dark
// lozenge), and the crosshair cursor beside it, both in Text colour.
//
// The name is a DOM element over the canvas. The pointer handler moves it; the frame loop
// touches the DOM only when the hovered constellation changes or a param does, never per frame.

import { NAMES } from './sky.js';

const CURSOR = 21; // CSS px square, about the size of the system crosshair; hotspot in the middle

/**
 * A plain crosshair in `colour` at `opacity`, as a PNG data URL drawn at `scale` device px per
 * CSS px (the cursor is given at 1× and 2×, so it stays sharp on retina screens).
 */
function crosshair(colour, opacity, scale) {
  const c = document.createElement('canvas');
  c.width = c.height = CURSOR * scale;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const mid = (CURSOR >> 1) * scale;
  ctx.globalAlpha = opacity;
  ctx.fillStyle = colour;
  // One shape, so the centre isn't drawn twice (twice as opaque).
  ctx.fillRect(mid, 0, scale, c.height);
  ctx.fillRect(0, mid, mid, scale);
  ctx.fillRect(mid + scale, mid, c.width - mid - scale, scale);
  return c.toDataURL();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Record<string, any>} P
 * @param {{ version: number }} model
 */
export function createLabel(canvas, P, model) {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true'); // a hover flourish; the names aren't content
  el.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;white-space:nowrap;opacity:0;' +
    'font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-style:italic;line-height:1;';
  canvas.after(el);

  let shown = -1, version = -1, cursorLook = '';
  /** The crosshair over the canvas: 1× for any browser, then 1× and 2× where image-set works
   * (prefixed for older Safari). A value a browser rejects leaves the one before in place. */
  function setCursor(colour, opacity) {
    if (opacity <= 0) { canvas.style.cursor = 'none'; return; }
    const one = 'url(' + crosshair(colour, opacity, 1) + ')', two = 'url(' + crosshair(colour, opacity, 2) + ')';
    const hot = ' ' + (CURSOR >> 1) + ' ' + (CURSOR >> 1) + ', crosshair';
    canvas.style.cursor = one + hot;
    canvas.style.cursor = '-webkit-image-set(' + one + ' 1x, ' + two + ' 2x)' + hot;
    canvas.style.cursor = 'image-set(' + one + ' 1x, ' + two + ' 2x)' + hot;
  }
  return {
    /** Follow the pointer (CSS px from the canvas's top left). Called from the pointer handler. */
    move(x, y) {
      const off = P.labelOffset.value;
      el.style.transform = 'translate(' + (x + off) + 'px,' + (y + off) + 'px)';
    },
    /** Show constellation `index` (−1 hides it). Called every frame; writes only on change. */
    show(index) {
      if (version !== model.version) {
        version = model.version;
        const size = P.labelSize.value;
        el.style.fontSize = size + 'px';
        el.style.padding = (size * 0.45) + 'px ' + (size * 0.9) + 'px';
        el.style.borderRadius = size + 'px';
        el.style.color = P.labelColour.value;
        el.style.background = P.labelBackground.value;
        el.style.transition = 'opacity ' + P.hoverFade.value + 's';
        if (shown >= 0) el.style.opacity = String(P.labelOpacity.value);
        const look = P.labelColour.value + P.cursorOpacity.value;
        if (look !== cursorLook) {
          cursorLook = look;
          setCursor(P.labelColour.value, P.cursorOpacity.value);
        }
      }
      if (index === shown) return;
      shown = index;
      if (index >= 0) {
        el.textContent = NAMES[index].join(' · '); // the name, then the native name if there is one
        el.style.opacity = String(P.labelOpacity.value);
      } else {
        el.style.opacity = '0'; // keeps the last name while it fades
      }
    },
  };
}
