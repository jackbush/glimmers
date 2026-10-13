/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Leaf',
  year: 2026,
  pageColour: 'paper',
  presetSeconds: 1.5,
  // The cover holds on each species, then morphs to the next, and back to the first.
  capture: { presets: { sequence: ['Oak', 'Elm', 'Ash'], hold: 1.5 }, crf: 31 },
};
