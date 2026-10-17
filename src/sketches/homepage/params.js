// Homepage — every default. The pane is generated from this file (fields: ParamDef in
// src/kit/types.ts). Each param is also `uniform float u_<key>` (`vec3` for colours) in the
// shader, unless it has `uniform: false`: then only the CPU reads it (perFrame() in shader.js,
// switches.js, page.js, sketch.js, or the kit for the standard Playback params).

import { playback } from '../../kit/standard.js';

export default [
  playback({}, {
    extra: [
      { key: 'seed', label: 'Seed', value: 0, min: 0, max: 100, step: 1, uniform: false, desc: 'Where on the tab demo switches start.' },
      { key: 'activeTab', label: 'Active tab', type: 'select', options: ['Projects', 'Roles'], value: 'Projects', uniform: false, desc: 'Which tab the page opens on.' },
      { key: 'autoSwitch', label: 'Demo switch (s)', value: 0, min: 0, max: 10, step: 0.1, uniform: false, desc: 'Switch theme on its own every this many seconds, from a random point on the toggle. 0 = off.' },
    ],
  }),
  {
    group: 'Colours',
    params: [
      { key: 'windowHue', label: 'Hue from window', type: 'bool', value: false, uniform: false, desc: 'The theme follows where the browser window sits on your screen: across sets the hue (the whole wheel, left to right), down sets the lightness. Not saved as the Theme colour.' },
      { key: 'windowMinLightness', label: 'Min lightness', value: 0.85, min: 0.85, max: 1, step: 0.01, uniform: false, desc: 'OKLCH lightness with the window at the bottom of the screen; it rises to white at the top. The slider starts where the inverse text passes AA at every hue, at full chroma and Minor text opacity 0.8 (0.849).', when: { key: 'windowHue', is: [true] } },
      { key: 'windowChroma', label: 'Chroma', value: 0.045, min: 0, max: 0.074, step: 0.001, uniform: false, desc: 'OKLCH chroma. Up to 0.074, every hue at lightness 0.85 fits sRGB; higher up the screen less fits, and channels clip toward white.', when: { key: 'windowHue', is: [true] } },
      { key: 'windowHueOffset', label: 'Hue offset °', value: 0, min: 0, max: 360, step: 1, uniform: false, desc: 'Turns the wheel: the hue with the window at the left edge.', when: { key: 'windowHue', is: [true] } },
      { key: 'themeColour', label: 'Theme colour', type: 'color', value: '#f3ead6', uniform: false, when: { key: 'windowHue', is: [false] }, desc: 'The one colour behind the whole theme: the page in Projects, and the text in Roles. Projects\' text and the Roles page are its inverse. Flickers if that\'s below AA (4.5:1).' },
      { key: 'minorOpacity', label: 'Minor text opacity', value: 0.8, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Body text: the page\'s inverse at this opacity over it. Flickers if that\'s below AA (4.5:1).' },
      { key: 'cardOpacity', label: 'Card opacity', value: 0.25, min: 0, max: 1, step: 0.01, uniform: false, desc: 'The wash behind card text: the theme colour screened over a bright page (lighter) or multiplied over a dark one (deeper), at this opacity.' },
    ],
  },
  {
    group: 'Switch',
    params: [
      { key: 'startSize', label: 'Start size (px)', value: 1, min: 0, max: 400, step: 1, uniform: false, desc: 'Diameter of the new theme the moment you click, in CSS px.' },
      { key: 'switchSpeed', label: 'Start speed', value: 0.195, min: 0, max: 2, step: 0.005, uniform: false, desc: 'How fast the new theme sets off from the click, in short sides per second.' },
      { key: 'switchAccel', label: 'Acceleration', value: 5.07, min: 0.1, max: 20, step: 0.01, uniform: false, desc: 'How fast it speeds up (short sides per s²), until it has passed the whole screen.' },
      { key: 'oldTextFade', label: 'Old text fade (s)', value: 0.23, min: 0, max: 2, step: 0.01, uniform: false, desc: 'How long the old list takes to fade out. The new one appears inside the switch as it spreads.' },
      { key: 'interruptFade', label: 'Interrupt fade (s)', value: 0.05, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Switching back mid-switch: how long the half-revealed list takes to fade out. Its switch keeps spreading.' },
      { key: 'barsLead', label: 'Bars lead (s)', value: 0.15, min: 0, max: 1, step: 0.01, uniform: false, desc: 'The browser\'s bars take one flat colour, so they follow the page along the top edge: this many seconds before the switch covers it, they change.' },
    ],
  },
  {
    group: 'Shape',
    params: [
      { key: 'wobble', label: 'Wobble', value: 0.12, min: 0, max: 0.5, step: 0.005, uniform: false, desc: 'How far each point of the outline swings in and out, as a share of the reach. 0 = a circle.' },
      { key: 'wobblePoints', label: 'Points', value: 6, min: 3, max: 12, step: 1, uniform: false, desc: 'Points round the outline; it\'s a smooth curve through them.', when: { key: 'wobble', not: [0] } },
      { key: 'wobbleSpeed', label: 'Speed', value: 0.8, min: 0, max: 4, step: 0.01, uniform: false, desc: 'Swings per second for each point.', when: { key: 'wobble', not: [0] } },
      { key: 'wobbleSpeedJitter', label: 'Speed jitter', value: 0.35, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Each point\'s own speed, so they drift in and out of step.', when: { key: 'wobble', not: [0] } },
      { key: 'wobbleAmpJitter', label: 'Size jitter', value: 0.5, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Each point\'s own swing size.', when: { key: 'wobble', not: [0] } },
    ],
  },
];
