/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Atlas Nights',
  year: 2026,
  // The night sky fills most of the screen, so the browser bars take its colour.
  pageColour: 'nightSky',
  // Film grain defeats video compression, so the cover trades a little grain for size.
  capture: { crf: 29 },
};
