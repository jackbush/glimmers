// Geode — every default. The pane is generated from this file (fields: ParamDef in
// src/kit/types.ts). Each param is also `uniform float u_<key>` (`vec3` for colours) in every
// pass, unless it has `uniform: false`: then only the CPU reads it (cluster.js and perFrame()
// in shader.js, or the kit for the standard Playback params).

import { playback } from '../../kit/standard.js';
import { film } from '../../kit/film.js';

export default [
  // Heavy: every pixel is ray-traced, so a lower pixel ratio and a 30fps cap (the cluster
  // turns slowly) buy the most.
  playback({ maxDpr: 1.5, maxFps: 30 }, {
    quality: true,
    extra: [
      { key: 'seed', label: 'Seed', value: 7, min: 0, max: 100, step: 1, uniform: false, desc: 'A different cluster: layout, faces and inclusions.' },
    ],
  }),
  {
    group: 'Camera',
    params: [
      { key: 'fov', label: 'Lens °', value: 21, min: 8, max: 70, step: 1, uniform: false, desc: 'Field of view: low = flat telephoto, high = wide. With Distance: zoom in from far, or go wide and close.' },
      { key: 'tilt', label: 'Height °', value: 0, min: -30, max: 60, step: 0.5, uniform: false, desc: 'How far the camera looks down on the cluster (0 = dead side-on, negative = from below).' },
      { key: 'distance', label: 'Distance', value: 2.9, min: 1, max: 20, step: 0.05, uniform: false, desc: 'How far the camera stands from the middle of the cluster (the tallest point is 1 long). With Lens: far and narrow flattens it, close and wide stretches it.' },
    ],
  },
  {
    group: 'Motion',
    params: [
      { key: 'spin', label: 'Spin °/s', value: 7, min: -60, max: 60, step: 0.5, uniform: false, desc: 'How fast the cluster turns about its upright axis.' },
      { key: 'sway', label: 'Sway °', value: 0, min: 0, max: 25, step: 0.5, uniform: false, desc: 'The cluster rocks gently as it turns.' },
      { key: 'swaySpeed', label: 'Sway speed', value: 0.07, min: 0, max: 0.5, step: 0.005, uniform: false, desc: 'Rocks per second.', when: { key: 'sway', not: [0] } },
    ],
  },
  {
    group: 'Cluster',
    params: [
      { key: 'crystals', label: 'Crystals', value: 7, min: 1, max: 16, step: 1, uniform: false, desc: 'How many points in the cluster.' },
      { key: 'fan', label: 'Fan °', value: 55, min: 0, max: 80, step: 1, uniform: false, desc: 'How far the outer points lean away from upright.' },
      { key: 'crossAt', label: 'Cross point', value: 0.45, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Where along their length the points all cross: 0.5 through their middles, 1 at their outer tips (a hat), 0 at their roots (a bowl).' },
      { key: 'lengthJitter', label: 'Length variety', value: 0.17, min: 0, max: 0.9, step: 0.01, uniform: false, desc: 'How much shorter the other points are than the tallest.' },
      { key: 'thickness', label: 'Thickness', value: 0.05, min: 0.05, max: 0.4, step: 0.005, uniform: false, desc: 'Prism radius as a share of a point\'s length.' },
      { key: 'thicknessJitter', label: 'Thickness variety', value: 0.35, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How much each point\'s girth varies.' },
      { key: 'faceJitter', label: 'Face variety', value: 0.6, min: 0, max: 0.6, step: 0.01, uniform: false, desc: 'Uneven prism faces: wide and narrow sides, like real quartz.' },
      { key: 'tipAngle', label: 'Tip angle °', value: 67.8, min: 30, max: 75, step: 0.1, uniform: false, desc: 'Angle between each tip face\'s normal and the point\'s axis (quartz: 51.8). Lower = blunter.' },
      { key: 'tipJitter', label: 'Tip variety', value: 0.8, min: 0, max: 0.8, step: 0.01, uniform: false, desc: 'Uneven tip faces, so points end in ridges and chisels, not perfect pyramids.' },
      { key: 'faceDominance', label: 'Big/small faces', value: 0.18, min: 0, max: 0.5, step: 0.01, uniform: false, desc: 'Three large tip faces and three small, as quartz grows (0 = all equal).' },
    ],
  },
  {
    group: 'Stone',
    params: [
      { key: 'stoneColour', label: 'Colour', type: 'color', value: '#a77fe0', uniform: false, desc: 'Light through one unit of stone (the tallest point is 1 long). Also sets the backdrop\'s hue.' },
      { key: 'colourDepth', label: 'Colour depth', value: 2.6, min: 0, max: 6, step: 0.05, uniform: false, desc: 'How strongly the stone tints light that passes through it (0 = clear).' },
      { key: 'colourZoning', label: 'Tip colour', value: 0.7, min: 0, max: 1, step: 0.01, desc: 'Colour gathers toward the tips, as in amethyst (0 = even).', when: { key: 'colourDepth', not: [0] } },
      { key: 'ior', label: 'Refraction', value: 1.544, min: 1, max: 2.6, step: 0.001, desc: 'Index of refraction (quartz 1.544, diamond 2.42).' },
      { key: 'fire', label: 'Fire', value: 0.035, min: 0, max: 0.15, step: 0.001, desc: 'Dispersion: how far white light splits into colour on the way out (quartz really ≈ 0.013).' },
      { key: 'fireSamples', label: 'Fire samples', value: 5, min: 2, max: 9, step: 1, desc: 'Wavelengths traced for fire. More = smoother rainbows, slower.', when: { key: 'fire', not: [0] } },
      { key: 'bounces', label: 'Bounces', value: 6, min: 1, max: 8, step: 1, desc: 'Internal reflections followed inside each point. More = more sparkle, slower.' },
      { key: 'depth', label: 'Pass-throughs', value: 3, min: 1, max: 4, step: 1, desc: 'How many points one ray can pass through.' },
    ],
  },
  {
    group: 'Surface',
    params: [
      { key: 'striations', label: 'Striations', value: 0.12, min: 0, max: 1, step: 0.01, desc: 'Fine horizontal growth ridges across the prism faces.' },
      { key: 'striationScale', label: 'Ridge spacing', value: 140, min: 20, max: 400, step: 1, desc: 'Ridges per unit of length.', when: { key: 'striations', not: [0] } },
      { key: 'frostShare', label: 'Frosted faces', value: 0.22, min: 0, max: 1, step: 0.01, desc: 'Share of faces that are etched and translucent rather than polished.' },
      { key: 'frost', label: 'Frost', value: 0.3, min: 0, max: 1, step: 0.01, desc: 'How rough a frosted face is.', when: { key: 'frostShare', not: [0] } },
      { key: 'edgeWear', label: 'Edge wear', value: 0.6, min: 0, max: 1, step: 0.01, desc: 'Chips and bruising along edges.' },
      { key: 'edgeWidth', label: 'Wear width', value: 0.05, min: 0.005, max: 0.2, step: 0.001, desc: 'How far the wear reaches from an edge (share of the point\'s radius).', when: { key: 'edgeWear', not: [0] } },
    ],
  },
  {
    group: 'Inclusions',
    params: [
      { key: 'milk', label: 'Milky cloud', value: 0.26, min: 0, max: 4, step: 0.01, desc: 'Cloudy white wisps inside the stone.' },
      { key: 'milkBase', label: 'Milkier at base', value: 0.75, min: 0, max: 1, step: 0.01, desc: 'Cloud gathers toward the roots and clears toward the tips.', when: { key: 'milk', not: [0] } },
      { key: 'veils', label: 'Veils', value: 1.2, min: 0, max: 4, step: 0.01, desc: 'Thin rippling sheets of tiny trapped bubbles.' },
      { key: 'inclusionScale', label: 'Scale', value: 2.2, min: 0.5, max: 8, step: 0.05, desc: 'Size of clouds and veils: higher = finer.' },
      { key: 'inclusionLight', label: 'Brightness', value: 1.2, min: 0, max: 5, step: 0.05, desc: 'How brightly clouds and veils catch the studio light.' },
      { key: 'inclusionSteps', label: 'Steps', value: 17, min: 2, max: 32, step: 1, desc: 'Samples per ray through each point. More = smoother clouds, slower.' },
      { key: 'phantom', label: 'Phantoms', value: 0.3, min: 0, max: 2, step: 0.01, desc: 'Ghostly outline of an earlier, smaller crystal inside each point.' },
      { key: 'phantomRate', label: 'Phantom rate', value: 0.2, min: 0, max: 1, step: 0.01, desc: 'Share of the points that have a phantom.', when: { key: 'phantom', not: [0] } },
      { key: 'phantomSize', label: 'Phantom size', value: 0.62, min: 0.2, max: 0.95, step: 0.01, desc: 'The phantom as a share of its point.', when: { key: 'phantom', not: [0] } },
      { key: 'needles', label: 'Rutile needles', value: 0, min: 0, max: 12, step: 1, desc: 'Fine golden needles per point.' },
      { key: 'needleWidth', label: 'Needle width', value: 0.0025, min: 0.0005, max: 0.012, step: 0.0001, desc: 'Needle radius in units (the tallest point is 1 long).', when: { key: 'needles', not: [0] } },
      { key: 'needleColour', label: 'Needle colour', type: 'color', value: '#d8a24a', desc: 'Rutile gold.', when: { key: 'needles', not: [0] } },
      { key: 'fractures', label: 'Rainbow cracks', value: 0.45, min: 0, max: 1, step: 0.01, desc: 'Share of points with an internal crack that shimmers in thin-film colours.' },
      { key: 'fractureGlow', label: 'Crack shimmer', value: 1.4, min: 0, max: 4, step: 0.05, desc: 'How strongly the cracks reflect.', when: { key: 'fractures', not: [0] } },
    ],
  },
  {
    group: 'Studio',
    params: [
      { key: 'hueShift', label: 'Hue shift °', value: 270, min: 0, max: 360, step: 1, uniform: false, desc: 'Backdrop hue relative to the stone\'s (0 or 360 = the same hue, 180 = opposite).' },
      { key: 'backdropSat', label: 'Backdrop sat.', value: 0.45, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Saturation of the backdrop glow.' },
      { key: 'backdropLight', label: 'Backdrop light', value: 0.075, min: 0, max: 0.4, step: 0.005, uniform: false, desc: 'Brightness of the glow behind the cluster.' },
      { key: 'glowSize', label: 'Glow size °', value: 16.5, min: 2, max: 40, step: 0.5, desc: 'Spread of the glow behind the cluster.', when: { key: 'backdropLight', not: [0] } },
      { key: 'studioEdge', label: 'Edge colour', type: 'color', value: '#030304', desc: 'The studio away from the glow; also the page colour.' },
      { key: 'lightColour', label: 'Light colour', type: 'color', value: '#fff3e4', uniform: false, desc: 'Colour of every softbox.' },
      { key: 'keyLight', label: 'Key light', value: 7, min: 0, max: 30, step: 0.1, uniform: false, desc: 'The main softbox, up and to the left of the camera.' },
      { key: 'keyAngle', label: 'Key angle °', value: -48, min: -180, max: 180, step: 1, uniform: false, desc: 'Where the key light sits around the cluster (0 = behind the camera).', when: { key: 'keyLight', not: [0] } },
      { key: 'keyHeight', label: 'Key height °', value: 38, min: -20, max: 85, step: 1, uniform: false, desc: 'How high the key light sits.', when: { key: 'keyLight', not: [0] } },
      { key: 'fillLight', label: 'Fill light', value: 1.6, min: 0, max: 20, step: 0.1, uniform: false, desc: 'A large dim softbox opposite the key.' },
      { key: 'rimLight', label: 'Rim lights', value: 9, min: 0, max: 40, step: 0.1, uniform: false, desc: 'Two tall strip lights behind the cluster that line its edges.' },
      { key: 'rimAngle', label: 'Rim angle °', value: 125, min: 60, max: 175, step: 1, uniform: false, desc: 'How far round behind the cluster the strips stand.', when: { key: 'rimLight', not: [0] } },
      { key: 'lightSize', label: 'Light size', value: 0.8, min: 0.2, max: 3, step: 0.01, uniform: false, desc: 'Scales every softbox: bigger = broader, softer highlights.' },
      { key: 'lightSoftness', label: 'Light softness', value: 0.06, min: 0, max: 0.5, step: 0.005, desc: 'Feathering at the softbox edges.' },
    ],
  },
  {
    group: 'Image',
    params: [
      { key: 'exposure', label: 'Exposure', value: 1, min: 0.1, max: 4, step: 0.01, desc: 'Brightness before tone mapping.' },
      { key: 'bloom', label: 'Bloom', value: 0.35, min: 0, max: 2, step: 0.01, desc: 'Glow around the brightest glints.' },
      { key: 'bloomThreshold', label: 'Bloom threshold', value: 1.2, min: 0, max: 6, step: 0.05, desc: 'Brightness above which light blooms.', when: { key: 'bloom', not: [0] } },
      { key: 'vignette', label: 'Vignette', value: 0, min: 0, max: 1, step: 0.01, desc: 'Darkening toward the corners.' },
      { key: 'filmFps', label: 'Film frame rate', value: 24, min: 6, max: 60, step: 1, uniform: false, desc: 'Rate at which grain and dust update.' },
    ],
  },
  film({ grainAmount: 0.02, grainSharpness: 1.29, dust: 0 }),
];
