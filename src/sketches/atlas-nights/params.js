// Atlas Nights — every default. The pane is generated from this file (fields: ParamDef in
// src/kit/types.ts).
// Angles are in degrees, sizes in CSS px, hour angles in hours (0 = due south, − east, + west).
// The twilight colours are sampled from the reference photo (IMG_1171), then pushed a little.

import { playback } from '../../kit/standard.js';
import { film } from '../../kit/film.js';
import { SKY_CULTURES } from './cultures.js';

export default [
  playback({}, {
    quality: true,
    extra: [
      { key: 'seed', label: 'Seed', value: 1, min: 0, max: 100, step: 1, uniform: false, desc: 'A different run of shooting stars and light leaks.' },
    ],
  }),
  {
    group: 'Night',
    params: [
      { key: 'nightLength', label: 'Loop (s)', value: 120, min: 20, max: 300, step: 1, uniform: false, desc: 'Seconds for one whole day and night. The sky turns once per loop.' },
      { key: 'startPhase', label: 'Start', value: 0, min: 0, max: 1, step: 0.005, uniform: false, desc: 'Where the loop starts: 0 = the brightest twilight, 0.5 = the dead of night.' },
      { key: 'dragSpan', label: 'Drag span', value: 0.25, min: 0.02, max: 1, step: 0.01, uniform: false, desc: 'Dragging across the sky turns time: one screen width is this share of a loop (right = forward). Mostly vertical drags do nothing.' },
      { key: 'month', label: 'Month', value: 2.5, min: 1, max: 12.99, step: 0.1, uniform: false, desc: 'Time of year: which stars fill the night. 12.5 = mid-December.' },
      { key: 'twilightShare', label: 'Twilight share', value: 0.375, min: 0.05, max: 0.6, step: 0.005, uniform: false, desc: 'Share of the loop with any light in the sky. The rest is full night.' },
    ],
  },
  {
    group: 'View',
    params: [
      { key: 'fov', label: 'Field of view', value: 84, min: 30, max: 120, step: 1, uniform: false, desc: 'How much sky fits top to bottom.' },
      { key: 'minWidth', label: 'Min width', value: 55, min: 20, max: 120, step: 1, uniform: false, desc: 'The narrowest view across, in degrees. Phones in portrait zoom out to keep it.' },
      { key: 'horizon', label: 'Horizon height', value: 0.055, min: 0, max: 0.4, step: 0.005, uniform: false, desc: 'Where the southern horizon sits, as a share of the screen height from the bottom.' },
    ],
  },
  {
    group: 'Twilight',
    params: [
      { key: 'glowHeight', label: 'Glow height', value: 1, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How high the twilight gradient reaches at its brightest: 0 = all below the horizon, 1 = its top touches the top of the view. As the light goes it sets, sliding down from here.' },
      { key: 'glowMid', label: 'Midpoint', value: 0.33, min: 0.05, max: 0.95, step: 0.01, desc: 'Where the twilight colours are halfway through, as a share of the gradient\'s height. 0.5 = spread evenly; lower = warm colours packed near the horizon and the blues stretched above.' },
      { key: 'glowWidth', label: 'Glow width', value: 35, min: 10, max: 180, step: 1, desc: 'How far either side of the sun the warm colours spread before turning cool.' },
      { key: 'warmHorizon', label: 'Warm horizon', type: 'color', value: '#cc6418', desc: 'Right on the horizon below the sun: burnt orange.' },
      { key: 'warmLow', label: 'Warm low', type: 'color', value: '#dcb98a', desc: 'Low over the sun: pale cream.' },
      { key: 'warmMid', label: 'Warm middle', type: 'color', value: '#8e7282', desc: 'Halfway up over the sun: dusty mauve.' },
      { key: 'warmHigh', label: 'Warm high', type: 'color', value: '#382d55', desc: 'High over the sun: indigo.' },
      { key: 'warmDeep', label: 'Warm deep', type: 'color', value: '#15172d', desc: 'Highest over the sun: a rich blue-black, before it goes to night.' },
      { key: 'coolHorizon', label: 'Cool horizon', type: 'color', value: '#6c7a74', desc: 'On the horizon away from the sun.' },
      { key: 'coolLow', label: 'Cool low', type: 'color', value: '#4c6274', desc: 'Low, away from the sun.' },
      { key: 'coolMid', label: 'Cool middle', type: 'color', value: '#1c3458', desc: 'Halfway up, away from the sun: deep blue.' },
      { key: 'coolHigh', label: 'Cool high', type: 'color', value: '#0d1a3a', desc: 'High, away from the sun.' },
      { key: 'coolDeep', label: 'Cool deep', type: 'color', value: '#09101f', desc: 'Highest, away from the sun: blue-black, before it goes to night.' },
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
      { key: 'nightLimit', label: 'Faintest at night', value: 6.5, min: 3, max: 6.5, step: 0.05, uniform: false, desc: 'Faintest magnitude shown in full dark (6.5 = a perfect desert sky).' },
      { key: 'twilightLimit', label: 'Faintest at dusk', value: -1.5, min: -1.5, max: 3, step: 0.05, uniform: false, desc: 'Faintest magnitude shown at the brightest twilight: only the brightest stars.' },
      { key: 'starBrightness', label: 'Brightness', value: 4, min: 0, max: 4, step: 0.01, desc: 'Brightness of a magnitude-0 star\'s core.' },
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
      { key: 'skyCulture', label: 'Sky culture', type: 'select', uniform: false, value: 'Bedouin', options: SKY_CULTURES.map((c) => c.label), desc: 'Whose constellations to draw: Bedouin (the old Arabian desert sky), Tuareg (as recorded in 1864), Maghrebi (the lunar mansions of the farming calendar), Arabic (al-Ṣūfī\'s 10th-century star book), Greek (Ptolemy\'s 48), Western (the IAU\'s 88). Sources and credits: SKY-CULTURES.md.' },
      { key: 'lineWidth', label: 'Width', value: 0.8, min: 0.25, max: 4, step: 0.05, desc: 'Width of the bright core of each line.' },
      { key: 'lineOpacity', label: 'Opacity', value: 0.36, min: 0, max: 1, step: 0.01, desc: 'How strongly the swirl shows through each line\'s core.' },
      { key: 'lineGlowWidth', label: 'Glow width', value: 5, min: 0, max: 16, step: 0.1, desc: 'Width of the dim glow around each line.' },
      { key: 'lineGlow', label: 'Glow', value: 0.06, min: 0, max: 1, step: 0.01, desc: 'How strongly the swirl shows through the glow.', when: { key: 'lineGlowWidth', not: [0] } },
      { key: 'lineGap', label: 'Gap at stars', value: 0, min: 0, max: 20, step: 0.5, desc: 'Lines stop short of each star by this much.' },
      { key: 'drawStart', label: 'Start drawing', value: -9.2, min: -12, max: 12, step: 0.1, desc: 'Hour angle where a rising constellation starts tracing in (−4 = 4 hours before it crosses due south).' },
      { key: 'drawEnd', label: 'Fully drawn', value: -4.4, min: -12, max: 12, step: 0.1, desc: 'Hour angle where it\'s fully traced.' },
      { key: 'traceOverlap', label: 'Trace overlap', value: 0.02, min: 0.02, max: 1, step: 0.01, desc: 'How many lines grow at once as a constellation traces in: low = one after another.' },
      { key: 'fadeStart', label: 'Start fading', value: 4.5, min: -12, max: 12, step: 0.1, desc: 'Hour angle where a setting constellation starts to fade.' },
      { key: 'fadeEnd', label: 'Gone', value: 9, min: -12, max: 12, step: 0.1, desc: 'Hour angle where it has faded out.' },
      { key: 'lineTwilight', label: 'Dark enough', value: 0.44, min: 0.01, max: 1, step: 0.01, uniform: false, desc: 'Lines trace in at dusk once the twilight drops below this, and fade at dawn as it passes it (0 = full dark, 1 = brightest).' },
    ],
  },
  {
    group: 'Swirl',
    params: [
      { key: 'swirlMask', label: 'Mask', type: 'bool', value: true, desc: 'On: the swirl shows only through the constellation lines. Off: it covers the sky, behind the stars and the ridge, and the lines vanish.' },
      { key: 'swirlBrightness', label: 'Brightness', value: 1.4, min: 0, max: 4, step: 0.01, desc: 'Brightness of the swirl, through the lines or over the sky.' },
      { key: 'swirlScale', label: 'Scale', value: 3, min: 0.2, max: 8, step: 0.05, desc: 'Size of the swirls: higher = smaller, busier.' },
      { key: 'swirlSpeed', label: 'Speed', value: 0.08, min: 0, max: 1, step: 0.005, desc: 'How fast the mass churns. It turns with the sky on its own, so 0 holds it still against the stars.' },
      { key: 'swirlWarp', label: 'Warp', value: 1.4, min: 0, max: 4, step: 0.01, desc: 'How much the mass folds and curls into itself.' },
      { key: 'swirlContrast', label: 'Spread', value: 2.6, min: 0, max: 4, step: 0.01, desc: 'How far it ranges along the twilight colours: low = mostly the middle colours, high = horizon orange to high indigo.' },
      { key: 'swirlSaturation', label: 'Saturation', value: 1.5, min: 0, max: 3, step: 0.01, desc: 'Colour intensity of the swirl: 1 = the twilight colours as they are.' },
      { key: 'swirlWarmth', label: 'Warmth', value: 0.15, min: -1, max: 1, step: 0.01, desc: 'Balance of the warm colours (sunward) against the cool ones.' },
    ],
  },
  {
    group: 'Light leaks',
    params: [
      { key: 'flare', label: 'Leaks', value: 0.54, min: 0, max: 3, step: 0.01, desc: 'Brightness of the light leaking out of the lines, in the swirl\'s colours. 0 = none.' },
      { key: 'flareReach', label: 'Reach', value: 34.5, min: 1, max: 150, step: 0.5, desc: 'How far the longest flares reach off a line.', when: { key: 'flare', not: [0] } },
      { key: 'flareShare', label: 'Share', value: 0.18, min: 0, max: 1, step: 0.01, desc: 'Roughly how much of each line is flaring at once.', when: { key: 'flare', not: [0] } },
      { key: 'flareSection', label: 'Section', value: 69, min: 5, max: 300, step: 1, desc: 'Length of the sections that flare on and off.', when: { key: 'flare', not: [0] } },
      { key: 'flareSpeed', label: 'Speed', value: 0.32, min: 0, max: 3, step: 0.01, desc: 'How often each section flares (per second).', when: { key: 'flare', not: [0] } },
      { key: 'flareScale', label: 'Detail', value: 8, min: 1, max: 60, step: 0.5, desc: 'Size of the ragged detail in a flare\'s outline: lower = more jagged.', when: { key: 'flare', not: [0] } },
      { key: 'flareStretch', label: 'Stretch', value: 6.5, min: 0.5, max: 10, step: 0.1, desc: 'How drawn out the flares are away from the line: high = long thin tongues, 1 = blotches.', when: { key: 'flare', not: [0] } },
      { key: 'flareRise', label: 'Rise', value: 46, min: 0, max: 100, step: 0.5, desc: 'How fast the flares stream outward off the lines (px per second).', when: { key: 'flare', not: [0] } },
      { key: 'flareSoftness', label: 'Softness', value: 0.96, min: 0.01, max: 1, step: 0.01, desc: 'How soft a flare\'s edge is: low = crisp tongues, high = hazy.', when: { key: 'flare', not: [0] } },
    ],
  },
  {
    group: 'Hover',
    params: [
      { key: 'labelColour', label: 'Text colour', type: 'color', value: '#efe6d2', uniform: false, desc: 'Colour of the constellation names and of the crosshair cursor.' },
      { key: 'cursorOpacity', label: 'Cursor', value: 0.8, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Opacity of the crosshair cursor over the sky. 0 = no cursor.' },
      { key: 'hoverReach', label: 'Reach', value: 36, min: 0, max: 150, step: 1, uniform: false, desc: 'How close the pointer must be to a constellation\'s lines to pick it out. 0 = off.' },
      { key: 'hoverFade', label: 'Fade in (s)', value: 0.3, min: 0, max: 2, step: 0.01, uniform: false, desc: 'How long the highlight and the name take to come in.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverFadeOut', label: 'Fade out (s)', value: 2, min: 0, max: 6, step: 0.05, uniform: false, desc: 'How long the highlight and the name take to fade once the pointer leaves (or a tap\'s hold ends).', when: { key: 'hoverReach', not: [0] } },
      { key: 'tapHold', label: 'Tap hold (s)', value: 1, min: 0, max: 6, step: 0.05, uniform: false, desc: 'Touch screens: how long a tapped constellation stays lit before it fades.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverOpacity', label: 'Opacity', value: 0.8, min: 0, max: 1, step: 0.01, desc: 'Brightness of a highlighted line\'s core.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverLighten', label: 'Lighten', value: 0.47, min: 0, max: 1, step: 0.01, desc: 'How far a highlighted line turns from the swirl\'s colours toward white.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverGlowWidth', label: 'Glow width', value: 13.6, min: 0, max: 24, step: 0.1, desc: 'Width of the glow around a highlighted line.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverGlow', label: 'Glow', value: 0.28, min: 0, max: 1, step: 0.01, desc: 'Brightness of that glow.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverFlare', label: 'Leaks', value: 1.5, min: 0, max: 8, step: 0.01, desc: 'Brightness of the light leaking off a hovered constellation\'s lines, held steady. 0 = none.', when: { key: 'hoverReach', not: [0] } },
      { key: 'hoverFlareReach', label: 'Leak reach', value: 60, min: 1, max: 150, step: 0.5, desc: 'How far the longest flares reach off a hovered constellation\'s lines.', when: { key: 'hoverFlare', not: [0] } },
      { key: 'hoverFlareShare', label: 'Leak share', value: 0.85, min: 0, max: 1, step: 0.01, desc: 'How much of a hovered constellation\'s lines flare.', when: { key: 'hoverFlare', not: [0] } },
      { key: 'hoverFlareSection', label: 'Leak section', value: 298, min: 5, max: 400, step: 1, desc: 'Length of the sections that flare on a hovered constellation: high = long unbroken runs.', when: { key: 'hoverFlare', not: [0] } },
      { key: 'hoverFlareScale', label: 'Leak detail', value: 17, min: 1, max: 60, step: 0.5, desc: 'Size of the ragged detail in a hovered flare\'s outline: lower = more jagged.', when: { key: 'hoverFlare', not: [0] } },
      { key: 'hoverFlareStretch', label: 'Leak stretch', value: 9.1, min: 0.5, max: 10, step: 0.1, desc: 'How drawn out hovered flares are away from the line: high = long thin tongues, 1 = blotches.', when: { key: 'hoverFlare', not: [0] } },
      { key: 'hoverFlareRise', label: 'Leak rise', value: 15.5, min: 0, max: 100, step: 0.5, desc: 'How fast hovered flares stream outward (px per second).', when: { key: 'hoverFlare', not: [0] } },
      { key: 'hoverFlareSoftness', label: 'Leak softness', value: 1, min: 0.01, max: 1, step: 0.01, desc: 'How soft a hovered flare\'s edge is: low = crisp tongues, high = hazy.', when: { key: 'hoverFlare', not: [0] } },
      { key: 'labelOpacity', label: 'Name', value: 0.92, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Opacity of the name label. 0 = no label.', when: { key: 'hoverReach', not: [0] } },
      { key: 'labelSize', label: 'Name size', value: 14, min: 9, max: 32, step: 0.5, uniform: false, desc: 'Font size of the name.', when: { key: 'labelOpacity', not: [0] } },
      { key: 'labelBackground', label: 'Lozenge', type: 'color', value: '#000000', desc: 'Colour of the lozenge behind the name.', uniform: false, when: { key: 'labelOpacity', not: [0] } },
      { key: 'labelOffset', label: 'Name offset', value: 7, min: 0, max: 60, step: 1, uniform: false, desc: 'How far the name sits below the pointer, and right of it (left of a tapped point, clear of the finger).', when: { key: 'labelOpacity', not: [0] } },
    ],
  },
  {
    group: 'Shooting stars',
    params: [
      { key: 'meteorRate', label: 'Per loop', value: 1.1, min: 0, max: 20, step: 0.1, uniform: false, desc: 'Shooting stars per loop, on average. Many loops have none.' },
      { key: 'meteorTime', label: 'Duration (s)', value: 0.65, min: 0.1, max: 3, step: 0.05, uniform: false, desc: 'How long each one lasts.', when: { key: 'meteorRate', not: [0] } },
      { key: 'meteorLength', label: 'Length', value: 156, min: 20, max: 600, step: 1, uniform: false, desc: 'How far it travels.', when: { key: 'meteorRate', not: [0] } },
      { key: 'meteorTail', label: 'Tail', value: 0.62, min: 0.05, max: 1, step: 0.01, uniform: false, desc: 'Length of the glowing trail, as a share of how far it travels.', when: { key: 'meteorRate', not: [0] } },
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
      { key: 'vignette', label: 'Vignette', value: 0, min: 0, max: 1, step: 0.01, desc: 'Darkening toward the corners.' },
      { key: 'filmFps', label: 'Film frame rate', value: 24, min: 6, max: 60, step: 1, uniform: false, desc: 'Rate at which grain and dust update.' },
    ],
  },
  film({ grainAmount: 0.075, grainSharpness: 3.74, dust: 0 }),
];
