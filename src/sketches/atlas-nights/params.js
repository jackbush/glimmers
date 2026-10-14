// Atlas Nights — every default. The pane is generated from this file (fields: ParamDef in
// src/kit/types.ts).
// Angles are in degrees, sizes in CSS px, hour angles in hours (0 = due south, − east, + west).
// The twilight colours are sampled from the reference photo (IMG_1171), then pushed a little.

import { playback } from '../../kit/standard.js';
import { film } from '../../kit/film.js';

export default [
  playback({}, {
    quality: true,
    extra: [
      { key: 'seed', label: 'Seed', value: 1, min: 0, max: 100, step: 1, uniform: false, desc: 'A different run of shooting stars.' },
    ],
  }),
  {
    group: 'Night',
    params: [
      { key: 'nightLength', label: 'Loop (s)', value: 96, min: 20, max: 300, step: 1, uniform: false, desc: 'Seconds for one whole day and night. The sky turns once per loop.' },
      { key: 'startPhase', label: 'Start', value: 0.06, min: 0, max: 1, step: 0.005, uniform: false, desc: 'Where the loop starts: 0 = the brightest twilight, 0.5 = the dead of night.' },
      { key: 'month', label: 'Month', value: 6.3, min: 1, max: 12.99, step: 0.1, uniform: false, desc: 'Time of year: which stars fill the night. 12.5 = mid-December.' },
      { key: 'twilightShare', label: 'Twilight share', value: 0.22, min: 0.05, max: 0.6, step: 0.005, uniform: false, desc: 'Share of the loop with any light in the sky. The rest is full night.' },
    ],
  },
  {
    group: 'View',
    params: [
      { key: 'fov', label: 'Field of view', value: 84, min: 30, max: 120, step: 1, uniform: false, desc: 'How much sky fits top to bottom.' },
      { key: 'minWidth', label: 'Min width', value: 55, min: 20, max: 120, step: 1, uniform: false, desc: 'The narrowest view across, in degrees. Phones in portrait zoom out to keep it.' },
      { key: 'horizon', label: 'Horizon height', value: 0.02, min: 0, max: 0.4, step: 0.005, uniform: false, desc: 'Where the southern horizon sits, as a share of the screen height from the bottom.' },
    ],
  },
  {
    group: 'Twilight',
    params: [
      { key: 'glowHeight', label: 'Glow height', value: 20, min: 5, max: 45, step: 0.5, desc: 'How far up the sky the twilight colours reach at their brightest.' },
      { key: 'glowSink', label: 'Glow sink', value: 0.6, min: 0, max: 1, step: 0.01, desc: 'How far the colours sink toward the horizon as the light fades.' },
      { key: 'glowWidth', label: 'Glow width', value: 55, min: 10, max: 180, step: 1, desc: 'How far either side of the sun the warm colours spread before turning cool.' },
      { key: 'warmHorizon', label: 'Warm horizon', type: 'color', value: '#cc6418', desc: 'Right on the horizon below the sun: burnt orange.' },
      { key: 'warmLow', label: 'Warm low', type: 'color', value: '#dcb98a', desc: 'Low over the sun: pale cream.' },
      { key: 'warmMid', label: 'Warm middle', type: 'color', value: '#8e7282', desc: 'Halfway up over the sun: dusty mauve.' },
      { key: 'warmHigh', label: 'Warm high', type: 'color', value: '#382d55', desc: 'High over the sun: indigo, before it goes to night.' },
      { key: 'coolHorizon', label: 'Cool horizon', type: 'color', value: '#6c7a74', desc: 'On the horizon away from the sun.' },
      { key: 'coolLow', label: 'Cool low', type: 'color', value: '#4c6274', desc: 'Low, away from the sun.' },
      { key: 'coolMid', label: 'Cool middle', type: 'color', value: '#1c3458', desc: 'Halfway up, away from the sun: deep blue.' },
      { key: 'coolHigh', label: 'Cool high', type: 'color', value: '#0d1a3a', desc: 'High, away from the sun.' },
    ],
  },
  {
    group: 'Night sky',
    params: [
      { key: 'nightSky', label: 'Night sky', type: 'color', value: '#040506', desc: 'The sky with no sun: near-black, not blue.' },
      { key: 'nightHorizon', label: 'Night horizon', type: 'color', value: '#080a0d', desc: 'The faint airglow along the horizon at night.' },
      { key: 'airglowHeight', label: 'Airglow height', value: 4, min: 0, max: 40, step: 0.5, desc: 'How far up the airglow reaches.' },
    ],
  },
  {
    group: 'Stars',
    params: [
      { key: 'nightLimit', label: 'Faintest at night', value: 6.4, min: 3, max: 6.5, step: 0.05, uniform: false, desc: 'Faintest magnitude shown in full dark (6.5 = a perfect desert sky).' },
      { key: 'twilightLimit', label: 'Faintest at dusk', value: 0.2, min: -1.5, max: 3, step: 0.05, uniform: false, desc: 'Faintest magnitude shown at the brightest twilight: only the brightest stars.' },
      { key: 'starBrightness', label: 'Brightness', value: 3.9, min: 0, max: 4, step: 0.01, desc: 'Brightness of a magnitude-0 star\'s core.' },
      { key: 'starContrast', label: 'Contrast', value: 0.42, min: 0.2, max: 1, step: 0.01, desc: 'How much brighter bright stars are than faint ones. 1 = true to life (most stars vanish).' },
      { key: 'starSize', label: 'Size', value: 0.6, min: 0.3, max: 3, step: 0.01, desc: 'Width of each star\'s core.' },
      { key: 'starHalo', label: 'Halo', value: 0.22, min: 0, max: 1, step: 0.005, desc: 'Brightness of the soft halo around the brightest stars.' },
      { key: 'haloSize', label: 'Halo size', value: 8, min: 1, max: 24, step: 0.1, desc: 'Halo radius for a magnitude-0 star.', when: { key: 'starHalo', not: [0] } },
      { key: 'starColour', label: 'Colour', value: 0.75, min: 0, max: 1.5, step: 0.01, desc: 'How strongly stars show their own colour (blue-white to orange).' },
      { key: 'twinkle', label: 'Twinkle', value: 0.35, min: 0, max: 1, step: 0.01, desc: 'How much stars flicker. Low stars flicker more, as through more air.' },
      { key: 'twinkleSpeed', label: 'Twinkle speed', value: 9, min: 0, max: 30, step: 0.1, desc: 'Flicker rate (radians per second), shared out unevenly between stars.', when: { key: 'twinkle', not: [0] } },
      { key: 'extinction', label: 'Extinction', value: 0.3, min: 0, max: 1, step: 0.01, desc: 'How much dimmer stars get near the horizon, in magnitudes per extra airmass.' },
      { key: 'reddening', label: 'Reddening', value: 0.5, min: 0, max: 1, step: 0.01, desc: 'How much low stars turn orange.', when: { key: 'extinction', not: [0] } },
    ],
  },
  {
    group: 'Constellations',
    params: [
      { key: 'lineRank', label: 'Which', value: 2, min: 1, max: 3, step: 1, desc: '1 = only the major constellations, 3 = all of them.' },
      { key: 'lineColour', label: 'Colour', type: 'color', value: '#182567', desc: 'Line colour.' },
      { key: 'lineWidth', label: 'Width', value: 0.9, min: 0.25, max: 4, step: 0.05, desc: 'Width of the bright core of each line.' },
      { key: 'lineOpacity', label: 'Opacity', value: 0.36, min: 0, max: 1, step: 0.01, desc: 'Brightness of the line core.' },
      { key: 'lineGlowWidth', label: 'Glow width', value: 5, min: 0, max: 16, step: 0.1, desc: 'Width of the dim glow around each line.' },
      { key: 'lineGlow', label: 'Glow', value: 0.06, min: 0, max: 1, step: 0.01, desc: 'Brightness of the glow.', when: { key: 'lineGlowWidth', not: [0] } },
      { key: 'lineGap', label: 'Gap at stars', value: 0, min: 0, max: 20, step: 0.5, desc: 'Lines stop short of each star by this much.' },
      { key: 'drawStart', label: 'Start drawing', value: -4, min: -12, max: 12, step: 0.1, desc: 'Hour angle where a rising constellation starts tracing in (−4 = 4 hours before it crosses due south).' },
      { key: 'drawEnd', label: 'Fully drawn', value: -2, min: -12, max: 12, step: 0.1, desc: 'Hour angle where it\'s fully traced.' },
      { key: 'traceOverlap', label: 'Trace overlap', value: 0.3, min: 0.02, max: 1, step: 0.01, desc: 'How many lines grow at once as a constellation traces in: low = one after another.' },
      { key: 'fadeStart', label: 'Start fading', value: 0, min: -12, max: 12, step: 0.1, desc: 'Hour angle where a setting constellation starts to fade.' },
      { key: 'fadeEnd', label: 'Gone', value: 2.5, min: -12, max: 12, step: 0.1, desc: 'Hour angle where it has faded out.' },
      { key: 'lineTwilight', label: 'Dark enough', value: 0.3, min: 0.01, max: 1, step: 0.01, uniform: false, desc: 'Lines trace in at dusk once the twilight drops below this, and fade at dawn as it passes it (0 = full dark, 1 = brightest).' },
    ],
  },
  {
    group: 'Hover',
    params: [
      { key: 'hoverReach', label: 'Reach', value: 36, min: 0, max: 150, step: 1, uniform: false, desc: 'How close the pointer must be to a constellation\'s lines to pick it out. 0 = off.' },
      { key: 'hoverFade', label: 'Fade (s)', value: 0.25, min: 0, max: 2, step: 0.01, uniform: false, desc: 'How long the highlight and the name take to come and go.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverOpacity', label: 'Opacity', value: 0.8, min: 0, max: 1, step: 0.01, desc: 'Brightness of a highlighted line\'s core.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverLighten', label: 'Lighten', value: 0.35, min: 0, max: 1, step: 0.01, desc: 'How far a highlighted line\'s colour moves toward white.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverGlowWidth', label: 'Glow width', value: 9, min: 0, max: 24, step: 0.1, desc: 'Width of the glow around a highlighted line.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverGlow', label: 'Glow', value: 0.28, min: 0, max: 1, step: 0.01, desc: 'Brightness of that glow.', when: { key: 'hoverReach', not: [0] } },
      { key: 'labelOpacity', label: 'Name', value: 0.92, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Opacity of the name label. 0 = no label.', when: { key: 'hoverReach', not: [0] } },
      { key: 'labelSize', label: 'Name size', value: 15, min: 9, max: 32, step: 0.5, uniform: false, desc: 'Font size of the name.', when: { key: 'labelOpacity', not: [0] } },
      { key: 'labelColour', label: 'Name colour', type: 'color', value: '#efe6d2', desc: 'Colour of the name.', uniform: false, when: { key: 'labelOpacity', not: [0] } },
      { key: 'labelBackground', label: 'Lozenge', type: 'color', value: '#000000', desc: 'Colour of the lozenge behind the name.', uniform: false, when: { key: 'labelOpacity', not: [0] } },
      { key: 'labelOffset', label: 'Name offset', value: 14, min: 0, max: 60, step: 1, uniform: false, desc: 'How far below and right of the pointer the name sits.', when: { key: 'labelOpacity', not: [0] } },
    ],
  },
  {
    group: 'Shooting stars',
    params: [
      { key: 'meteorRate', label: 'Per loop', value: 1.2, min: 0, max: 20, step: 0.1, uniform: false, desc: 'Shooting stars per loop, on average. Many loops have none.' },
      { key: 'meteorTime', label: 'Duration (s)', value: 0.65, min: 0.1, max: 3, step: 0.05, uniform: false, desc: 'How long each one lasts.', when: { key: 'meteorRate', not: [0] } },
      { key: 'meteorLength', label: 'Length', value: 156, min: 20, max: 600, step: 1, uniform: false, desc: 'How far it travels.', when: { key: 'meteorRate', not: [0] } },
      { key: 'meteorTail', label: 'Tail', value: 0.88, min: 0.05, max: 1, step: 0.01, uniform: false, desc: 'Length of the glowing trail, as a share of how far it travels.', when: { key: 'meteorRate', not: [0] } },
      { key: 'meteorWidth', label: 'Width', value: 0.8, min: 0.25, max: 6, step: 0.05, desc: 'Width of the trail.', when: { key: 'meteorRate', not: [0] } },
      { key: 'meteorBrightness', label: 'Brightness', value: 0.95, min: 0, max: 4, step: 0.01, desc: 'Brightness of the head.', when: { key: 'meteorRate', not: [0] } },
      { key: 'meteorColour', label: 'Colour', type: 'color', value: '#e6efff', desc: 'Trail colour.', when: { key: 'meteorRate', not: [0] } },
    ],
  },
  {
    group: 'Ridge',
    params: [
      { key: 'ridgeSpan', label: 'Span', value: 70, min: 20, max: 180, step: 1, desc: 'How wide the traced skyline is, in degrees. Beyond it the skyline mirrors.' },
      { key: 'ridgeScale', label: 'Height', value: 1, min: 0, max: 4, step: 0.01, desc: 'Height of the skyline: 1 = as in the photo.' },
      { key: 'ridgeColour', label: 'Colour', type: 'color', value: '#040101', desc: 'The mountains: a silhouette.' },
    ],
  },
  {
    group: 'Film',
    params: [
      { key: 'exposure', label: 'Exposure', value: 1, min: 0.3, max: 2, step: 0.01, desc: 'Overall brightness before grain.' },
      { key: 'vignette', label: 'Vignette', value: 0.35, min: 0, max: 1, step: 0.01, desc: 'Darkening toward the corners.' },
      { key: 'filmFps', label: 'Film frame rate', value: 24, min: 6, max: 60, step: 1, uniform: false, desc: 'Rate at which grain and dust update.' },
    ],
  },
  film({ grainAmount: 0.075, grainSharpness: 3.74, dust: 0 }),
];
