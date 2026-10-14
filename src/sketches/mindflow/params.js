// Mindflow — every default. The pane is generated from this file (fields: ParamDef in
// src/kit/types.ts).
//
// In 2015 the two Brain data values streamed live from a NeuroSky headset (its eSense
// attention and meditation, both 0–100). Here they're sliders.

import { playback } from '../../kit/standard.js';

export default [
  {
    group: 'Brain data',
    params: [
      { key: 'attention', label: 'Attention', value: 50, min: 0, max: 100, step: 1, desc: 'eSense attention, 0–100. Higher draws the two circles together until they overlap completely.' },
      { key: 'meditation', label: 'Meditation', value: 60, min: 0, max: 100, step: 1, desc: 'eSense meditation, 0–100. Higher calms the frenetic outline; at 100 it\'s a still circle.' },
    ],
  },
  playback({}, {
    extra: [
      { key: 'seed', label: 'Seed', value: 1, min: 0, max: 100, step: 1, desc: 'A different random take of the outline jitter.' },
    ],
  }),
  {
    group: 'Circles',
    params: [
      { key: 'size', label: 'Size', value: 0.8, min: 0.1, max: 1.2, step: 0.01, desc: 'Circle diameter as a fraction of the screen height.' },
      { key: 'separation', label: 'Separation', value: 0.28, min: 0, max: 1, step: 0.01, desc: 'How far each circle sits from the centre at zero attention, as a fraction of the diameter.' },
      { key: 'jitter', label: 'Jitter', value: 0.07, min: 0, max: 0.3, step: 0.005, desc: 'Largest outline distortion at zero meditation, as a fraction of the diameter.' },
      { key: 'fill', label: 'Fill colour', type: 'color', value: '#40ceff', desc: 'Fill of each circle.' },
      { key: 'fillOpacity', label: 'Fill opacity', value: 0.012, min: 0, max: 0.2, step: 0.001, desc: 'Opacity of each fill. Six are drawn every tick, so it builds up quickly.' },
      { key: 'stroke', label: 'Stroke colour', type: 'color', value: '#0c2340', desc: 'Colour of the outlines.' },
      { key: 'strokeOpacity', label: 'Stroke opacity', value: 0.12, min: 0, max: 1, step: 0.01, desc: 'Opacity of each outline.' },
      { key: 'strokeWidth', label: 'Stroke width', value: 1, min: 0.25, max: 4, step: 0.05, desc: 'Outline width in CSS pixels.' },
    ],
  },
  {
    group: 'Trails',
    params: [
      { key: 'background', label: 'Background', type: 'color', value: '#ffffff', desc: 'Page and canvas colour, and what the trails fade back to.' },
      { key: 'fade', label: 'Fade', value: 0.04, min: 0.005, max: 1, step: 0.005, desc: 'How much of the background is painted over the picture each tick. Lower = longer trails.' },
      { key: 'tickRate', label: 'Tick rate', value: 60, min: 5, max: 120, step: 1, desc: 'Drawing steps per second (the original ran at 60). Fixed, so the look doesn\'t change with the screen\'s refresh rate.' },
    ],
  },
];
