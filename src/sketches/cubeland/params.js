// Cubeland — parameter schema. The pane is generated from this file, and every default
// lives here. Fields: key, label, value, type ('range' | 'color' | 'bool'), min/max/step, desc.
// Distances are in scene units (the camera sits 5 units back); speeds are per second.

import { playback } from '../../kit/standard.js';

export default [
  playback({}, {
    extra: [
      { key: 'seed', label: 'Seed', value: 1, min: 0, max: 100, step: 1, desc: 'A different random sequence of drops.' },
    ],
  }),
  {
    group: 'Drops',
    params: [
      { key: 'autoDrop', label: 'Auto drop (s)', value: 4, min: 0, max: 30, step: 0.5, desc: 'Drop a batch every this many seconds (0 = only when you click).' },
      { key: 'count', label: 'Cubes per drop', value: 200, min: 1, max: 1000, step: 1, desc: 'How many cubes each drop (or click) adds.' },
      { key: 'maxSize', label: 'Max size', value: 0.5, min: 0.05, max: 2, step: 0.01, desc: 'Each side is a random length up to this.' },
      { key: 'spawnSpread', label: 'Spread', value: 7, min: 0, max: 20, step: 0.1, desc: 'Width of the area cubes start in.' },
      { key: 'spawnHeight', label: 'Start height', value: 20, min: 4, max: 60, step: 0.5, desc: 'How far above the view cubes start.' },
    ],
  },
  {
    group: 'Motion',
    params: [
      { key: 'fallBase', label: 'Fall speed', value: 2.4, min: 0, max: 10, step: 0.05, desc: 'Random part of each cube\'s fall speed.' },
      { key: 'fallScale', label: 'Fall ramp', value: 0.18, min: 0, max: 1, step: 0.005, desc: 'Extra fall speed per cube in a drop, so later cubes fall faster and the batch stretches into a stream.' },
      { key: 'spinX', label: 'Spin X', value: 0.6, min: 0, max: 5, step: 0.05, desc: 'Random part of each cube\'s spin around X.' },
      { key: 'spinY', label: 'Spin Y', value: 1.2, min: 0, max: 5, step: 0.05, desc: 'Random part of each cube\'s spin around Y.' },
      { key: 'spinZ', label: 'Spin Z', value: 0.6, min: 0, max: 5, step: 0.05, desc: 'Random part of each cube\'s spin around Z.' },
      { key: 'spinScale', label: 'Spin ramp', value: 0.18, min: 0, max: 1, step: 0.005, desc: 'Extra spin per cube in a drop.' },
      { key: 'drift', label: 'Drift', value: 1.2, min: 0, max: 5, step: 0.05, desc: 'Maximum sideways drift.' },
    ],
  },
  {
    group: 'Light',
    params: [
      { key: 'background', label: 'Background', type: 'color', value: '#111118', desc: 'Page and scene background.' },
      { key: 'ambient', label: 'Ambient light', value: 0.6, min: 0, max: 3, step: 0.05, desc: 'Even light from everywhere.' },
      { key: 'sun', label: 'Key light', value: 1.8, min: 0, max: 6, step: 0.05, desc: 'Directional light from above right.' },
    ],
  },
];
