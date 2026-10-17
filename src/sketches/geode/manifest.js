/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Geode',
  year: 2026,
  // The studio's edge colour, for the browser bars.
  pageColour: 'studioEdge',
  // The cover: one second, forwards then back. The dark backdrop's gradient bands unless its
  // dither survives: CRF 16 and x264's grain tune keep it.
  capture: { seconds: 1, crf: 16, tune: 'grain' },
};
