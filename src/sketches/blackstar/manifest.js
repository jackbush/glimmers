/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Blackstar',
  year: 2026,
  // The orb's edge colour fills the screen's narrow edges, so browser bars match it.
  pageColour: 'orbColor',
  // Film grain defeats video compression, so the cover trades a little grain for size.
  capture: { crf: 29 },
};
