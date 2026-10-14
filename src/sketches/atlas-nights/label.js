// Atlas Nights — the constellation name that follows the pointer: italic serif on a dark
// lozenge, beside the crosshair.
//
// It's a DOM element over the canvas. The pointer handler moves it; the frame loop touches the
// DOM only when the hovered constellation changes or a param does, never per frame.

import { NAMES } from './sky.js';

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

  let shown = -1, version = -1;
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
      }
      if (index === shown) return;
      shown = index;
      if (index >= 0) {
        el.textContent = NAMES[index];
        el.style.opacity = String(P.labelOpacity.value);
      } else {
        el.style.opacity = '0'; // keeps the last name while it fades
      }
    },
  };
}
