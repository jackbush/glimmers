// Homepage — text in the inverse of whichever page is under it, wherever the switch has reached.
//
// Text at opacity o over a page colour bg should be bg + o·((1 − bg) − bg) = (1 − 2o)·bg + o,
// per channel. The text is drawn three times over the backdrop in blend layers (multiply, then
// difference, then plus-lighter), which together give exactly that:
//
//   o ≥ ½   multiply by 2o − 1, then difference with o:   |o − (2o − 1)·bg| = o − (2o − 1)·bg
//   o < ½   multiply by 1 − 2o, then plus-lighter o:       (1 − 2o)·bg + o
//
// (the unused layer left at its identity: difference with 0, plus 0). Main text, o = 1, is
// just a difference with white. Every pixel the switch is crossing gets the colour between.

/**
 * The blend-layer greys for text at `opacity`: multiply, difference and plus-lighter.
 * @param {number} opacity
 */
export function inkLayers(opacity) {
  return opacity >= 0.5
    ? { m: 2 * opacity - 1, d: opacity, k: 0 }
    : { m: 1 - 2 * opacity, d: 0, k: opacity };
}

/** A colour's inverse. */
export const invert = (/** @type {ArrayLike<number>} */ c) => [0, 1, 2].map((i) => 1 - c[i]);

/** A #rrggbb colour's inverse, as #rrggbb. */
export const invertHex = (/** @type {string} */ h) => '#' + (0xffffff ^ parseInt(h.slice(1), 16)).toString(16).padStart(6, '0');

/** `share` of the way from colour `a` to colour `b`. */
export const mixRgb = (/** @type {ArrayLike<number>} */ a, /** @type {ArrayLike<number>} */ b, /** @type {number} */ share) =>
  [0, 1, 2].map((c) => a[c] + (b[c] - a[c]) * share);

/** WCAG contrast ratio between two 0–1 sRGB colours. */
export function contrast(/** @type {ArrayLike<number>} */ a, /** @type {ArrayLike<number>} */ b) {
  const lum = (/** @type {ArrayLike<number>} */ c) => {
    const l = [0, 1, 2].map((i) => (c[i] <= 0.04045 ? c[i] / 12.92 : ((c[i] + 0.055) / 1.055) ** 2.4));
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  };
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A 0–1 RGB triple as a CSS colour, at full float precision. */
export const css = (/** @type {number[]} */ c) => `color(srgb ${c.map((v) => Math.min(1, Math.max(0, v)).toFixed(4)).join(' ')})`;
