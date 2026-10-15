/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Atlas Nights',
  year: 2026,
  // The night sky fills most of the screen, so the browser bars take its colour.
  pageColour: 'nightSky',
  startPaused: false,
  // The cover: the whole day in one loop, as long as it can be under the cover size limit (~3MB),
  // always in twilight, with a mouse resting mid-screen so constellations light up as they pass
  // (names hidden). One loop is one turn of the sky, so it loops without ping-pong; starting one
  // loop in lets the hover settle before the first frame. Film grain defeats video compression,
  // so the cover trades a little grain for size.
  capture: {
    seconds: 34, start: 34, pingpong: false, crf: 29,
    set: { nightLength: 34, twilightShare: 1, labelOpacity: 0 },
    pointer: [0.5, 0.5],
  },
};
