import { tour } from './tour.js';

/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Sprig',
  year: 2026,
  pageColour: 'paper',
  presetSeconds: 4,
  // The page opens on a random preset, then cycles on through the rest, in a loop that keeps
  // each morph small (tour.js), until the settings pane opens.
  autoplay: { hold: 1, sequence: tour() },
  // The cover holds on each species, then morphs to the next, and back to the first.
  capture: {
    presets: { sequence: ['Hawthorn', 'Whitebeam', 'Oak, Holm', 'Laburnum'], hold: 1 },
    // The link preview: elder, flowers and berries at once.
    share: 'Elder',
    crf: 31,
  },
};
