/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Mindflow',
  year: 2015,
  pageColour: 'background',
  // Trails build up over a few seconds, so start once they have. Then the brain data sweeps
  // to full attention and meditation (one calm circle) and back out, and the loop repeats.
  capture: {
    start: 4,
    seconds: 10,
    pingpong: false,
    animate: { attention: [50, 100], meditation: [60, 100] },
  },
};
