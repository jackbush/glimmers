/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Cubeland',
  year: 2015,
  pageColour: 'background',
  // Falling cubes look wrong played backwards, so record two drop intervals of the steady
  // stream instead of a ping-pong: the cut back to the start is hard to spot.
  capture: { start: 12, seconds: 8, pingpong: false },
};
