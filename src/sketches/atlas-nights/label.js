// Atlas Nights — the constellation name that follows the pointer (italic serif on a dark
// lozenge), and the crosshair cursor beside it, both in Text colour.
//
// The name is a DOM element over the canvas. The pointer handler moves it, and the frame loop
// touches the DOM only when the hovered constellation changes or a param does, except while a
// tap's name rides along with the sky (one transform per frame then).

import { NAMES } from './sky.js';
import { SKY_CULTURES } from './cultures.js';

const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
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
// Native names in a culture's own hand: its font, loaded the first time it's needed (until it
// arrives, and for cultures without one, the label's own serif shows).
/** @type {Map<string, string>} menu label → CSS font-family */
const families = new Map();
function nativeFont(label) {
  if (!families.has(label)) {
    const c = SKY_CULTURES.find((x) => x.label === label);
    let family = ''; // inherit the label's serif
    if (c && c.font) {
      const face = new FontFace(c.font.family, 'url(' + c.font.url + ')');
      document.fonts.add(face);
      face.load().catch(() => {}); // a font that fails to load leaves the fallback
      family = '"' + c.font.family + '", ' + SERIF;
    }
    families.set(label, family);
  }
  return families.get(label);
}

export function createLabel(canvas, P, model) {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true'); // a hover flourish; the names aren't content
  el.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;white-space:nowrap;opacity:0;' +
    'font-family:' + SERIF + ';font-style:italic;line-height:1;';
  const nativeEl = document.createElement('bdi');
  nativeEl.style.fontStyle = 'normal';
  const nameEl = document.createElement('span');
  el.append(nativeEl, nameEl);
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
    /**
     * Put the name beside (x, y), CSS px from the canvas's top left: below and right of the
     * pointer, or below and left of a tapped point (`left`), clear of the finger on the right.
     */
    move(x, y, left = false) {
      const off = P.labelOffset.value;
      el.style.transform = left
        ? 'translate(calc(' + (x - off) + 'px - 100%),' + (y + off) + 'px)'
        : 'translate(' + (x + off) + 'px,' + (y + off) + 'px)';
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
        // A native name comes first, upright (Arabic has no italic) and isolated so its
        // right-to-left run doesn't reorder the brackets; then the translation in brackets.
        const [name, native] = NAMES[index];
        if (native) {
          nativeEl.style.fontFamily = nativeFont(P.skyCulture.value);
          nativeEl.textContent = native;
          nameEl.textContent = ' (' + name + ')';
        } else {
          nativeEl.textContent = '';
          nameEl.textContent = name;
        }
        el.style.transition = 'opacity ' + P.hoverFade.value + 's';
        el.style.opacity = String(P.labelOpacity.value);
      } else {
        el.style.transition = 'opacity ' + P.hoverFadeOut.value + 's';
        el.style.opacity = '0'; // keeps the last name while it fades
      }
    },
  };
}
