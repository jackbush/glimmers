// Orb — every default. The pane is generated from this file (fields: ParamDef in
// src/kit/types.ts).

import { playback } from '../../kit/standard.js';

export default [
  playback({}, {
    extra: [
      { key: 'seed', label: 'Seed', value: 1, min: 0, max: 100, step: 1, desc: 'A different random take: point sizes, angles and starting directions.' },
    ],
  }),
  {
    group: 'Blob',
    params: [
      { key: 'layers', label: 'Layers', value: 5, min: 1, max: 12, step: 1, desc: 'Overlapping translucent blobs sharing a centre.' },
      { key: 'points', label: 'Points', value: 5, min: 3, max: 12, step: 1, desc: 'Control points around each outline; a smooth curve runs through them.' },
      { key: 'size', label: 'Size', value: 0.35, min: 0.05, max: 0.6, step: 0.005, desc: 'Mean radius as a fraction of the screen\'s short side.' },
      { key: 'sizeJitter', label: 'Size jitter', value: 0.25, min: 0, max: 0.6, step: 0.01, desc: 'How much each point\'s resting radius varies.' },
      { key: 'irregularity', label: 'Irregularity', value: 0.35, min: 0, max: 1, step: 0.01, desc: 'How far points stray from even spacing around the circle.' },
      { key: 'spread', label: 'Breathing', value: 0.1, min: 0, max: 0.4, step: 0.005, desc: 'How far each point swings in and out, as a fraction of its radius.' },
      { key: 'speed', label: 'Breathing speed', value: 0.6, min: 0, max: 3, step: 0.01, desc: 'How fast points swing. Smaller points swing faster, so the layers drift in and out of step.' },
    ],
  },
  {
    group: 'Colour',
    params: [
      { key: 'colour', label: 'Blob colour', type: 'color', value: '#00d4ff', desc: 'Fill colour of every layer.' },
      { key: 'opacity', label: 'Layer opacity', value: 0.2, min: 0.01, max: 1, step: 0.01, desc: 'Opacity of each layer; overlaps build up brighter.' },
      { key: 'background', label: 'Background', type: 'color', value: '#071e38', desc: 'Page and canvas background.' },
    ],
  },
];
