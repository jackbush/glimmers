/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Leaf',
  year: 2026,
  pageColour: 'paper',
  presetSeconds: 4,
  // The page opens on a random preset, then cycles on through the rest alphabetically, until
  // the settings pane opens.
  autoplay: { hold: 1 },
  // The cover holds on each species, then morphs to the next, and back to the first.
  capture: { presets: { sequence: ['Oak', 'Aspen', 'Eucalyptus'], hold: 1 }, crf: 31 },
};
