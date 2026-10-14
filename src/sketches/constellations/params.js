// Constellations — every default. The pane is generated from this file (fields: ParamDef in
// src/kit/types.ts).
// Sizes and distances are in CSS pixels.

import { playback } from '../../kit/standard.js';

export default [
  playback({}, {
    extra: [
      { key: 'seed', label: 'Seed', value: 1, min: 0, max: 100, step: 1, desc: 'A different random sky: positions, sizes, colours and orbits.' },
    ],
  }),
  {
    group: 'Stars',
    params: [
      { key: 'count', label: 'Stars', value: 120, min: 10, max: 400, step: 1, desc: 'Number of stars. Links are checked between every pair, so cost grows with the square.' },
      { key: 'minSize', label: 'Min size', value: 1, min: 0.5, max: 10, step: 0.1, desc: 'Smallest star diameter.' },
      { key: 'maxSize', label: 'Max size', value: 5, min: 0.5, max: 16, step: 0.1, desc: 'Largest star diameter.' },
      { key: 'sizeBias', label: 'Size bias', value: 2, min: 0.5, max: 5, step: 0.1, desc: 'Higher = more small stars and fewer big ones.' },
      { key: 'glowSize', label: 'Glow from size', value: 2.8, min: 0.5, max: 16, step: 0.1, desc: 'Stars at least this big get a soft halo.' },
      { key: 'twinkle', label: 'Twinkle', value: 0.4, min: 0, max: 0.6, step: 0.01, desc: 'How much each star pulses in brightness and size.' },
      { key: 'twinkleSpeed', label: 'Twinkle speed', value: 1, min: 0, max: 4, step: 0.01, desc: 'Multiplier on each star\'s own twinkle rate.' },
      { key: 'blueWhite', label: 'Blue-white', type: 'color', value: '#c8dcff', desc: 'Most common star colour (55%).' },
      { key: 'white', label: 'White', type: 'color', value: '#ffffff', desc: 'Second most common (25%).' },
      { key: 'warm', label: 'Warm', type: 'color', value: '#fff5d2', desc: 'Yellow-white stars (13%).' },
      { key: 'orange', label: 'Orange', type: 'color', value: '#ffd2af', desc: 'Rare orange stars (7%).' },
    ],
  },
  {
    group: 'Drift',
    params: [
      { key: 'drift', label: 'Drift speed', value: 0.06, min: 0, max: 0.5, step: 0.001, desc: 'How fast stars travel round their orbits (radians per second).' },
      { key: 'wander', label: 'Orbit size', value: 100, min: 0, max: 400, step: 1, desc: 'Orbit radius scale. Each star divides it by its own random factor, so a few swing very wide.' },
    ],
  },
  {
    group: 'Lines',
    params: [
      { key: 'linkDistance', label: 'Link distance', value: 100, min: 10, max: 300, step: 1, desc: 'Stars closer than this are joined; lines fade out toward the limit.' },
      { key: 'lineWidth', label: 'Line width', value: 1.2, min: 0.25, max: 4, step: 0.05, desc: 'Width of the bright core of each line.' },
      { key: 'lineOpacity', label: 'Line opacity', value: 0.55, min: 0, max: 1, step: 0.01, desc: 'Opacity of the line core at its closest.' },
      { key: 'glowWidth', label: 'Glow width', value: 5, min: 0, max: 16, step: 0.1, desc: 'Width of the dim glow around each line.' },
      { key: 'glowOpacity', label: 'Glow opacity', value: 0.18, min: 0, max: 1, step: 0.01, desc: 'Opacity of the glow at its closest.' },
      { key: 'hue', label: 'Hue', value: 190, min: 0, max: 360, step: 1, desc: 'Line hue at the start of its cycle (190 = teal).' },
      { key: 'hueRange', label: 'Hue range', value: 80, min: 0, max: 360, step: 1, desc: 'How far the line hue travels (80 = teal → blue → violet).' },
      { key: 'hueSpeed', label: 'Hue speed', value: 0.3, min: 0, max: 3, step: 0.01, desc: 'Speed of the hue cycle (radians per second).' },
    ],
  },
  {
    group: 'Sky',
    params: [
      { key: 'background', label: 'Background', type: 'color', value: '#020509', desc: 'Page and canvas background.' },
    ],
  },
];
