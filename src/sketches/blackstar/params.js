// Blackstar — every default. The pane is generated from this file (fields: ParamDef in
// src/kit/types.ts). Each param is also `uniform float u_<key>` (`vec3` for colours) in every
// pass, unless it has `uniform: false`: then only the CPU reads it (perFrame() in shader.js,
// or the kit for the standard Playback params).

import { playback } from '../../kit/standard.js';
import { film } from '../../kit/film.js';

export default [
  playback({ timeScale: 0.41 }, {
    quality: true,
    extra: [
      { key: 'seed', label: 'Seed', value: 0, min: 0, max: 100, step: 0.01, desc: 'Offsets every noise field — a different take of the same design.' },
    ],
  }),
  {
    group: 'Background',
    params: [
      { key: 'bgBottom', label: 'Bottom colour', type: 'color', value: '#f9e9a8', desc: 'Buttery yellow at the low end of the gradient.' },
      { key: 'bgTop', label: 'Top colour', type: 'color', value: '#f3a63c', desc: 'Orange-yellow at the high end of the gradient.' },
      { key: 'bgAngle', label: 'Base angle °', value: 263, min: 0, max: 360, step: 1, uniform: false, desc: 'Direction the gradient runs bottom→top (90 = straight up).' },
      { key: 'bgWobbleRange', label: 'Wobble range °', value: 90, min: 0, max: 180, step: 1, uniform: false, desc: 'Total arc the gradient direction swings through.' },
      { key: 'bgWobbleSpeed', label: 'Wobble speed', value: 0.41, min: 0, max: 1, step: 0.005, uniform: false, desc: 'How quickly the gradient direction drifts.', when: { key: 'bgWobbleRange', not: [0] } },
      { key: 'bgBias', label: 'Gradient bias', value: 2.04, min: 0.3, max: 3, step: 0.01, desc: '>1 holds the bottom colour longer, <1 pushes the top colour down.' },
      { key: 'bgWarp', label: 'Line warp', value: 0.205, min: 0, max: 0.6, step: 0.005, desc: 'How far the gradient bands bend away from a straight line.' },
      { key: 'bgWarpScale', label: 'Warp scale', value: 2.2, min: 0.1, max: 5, step: 0.05, desc: 'Size of the bends — low = broad curves, high = ripples.', when: { key: 'bgWarp', not: [0] } },
      { key: 'bgMottle', label: 'Mottle', value: 0, min: 0, max: 0.3, step: 0.001, desc: 'Subtle brightness variance across the field.' },
      { key: 'bgMottleScale', label: 'Mottle scale', value: 0.2, min: 0.2, max: 12, step: 0.1, desc: 'Size of the mottled patches.', when: { key: 'bgMottle', not: [0] } },
    ],
  },
  {
    group: 'Orb',
    params: [
      { key: 'orbRadius', label: 'Size', value: 1.005, min: 0.1, max: 1.5, step: 0.005, uniform: false, desc: 'Mean radius relative to half the screen\'s short side — 1 = touching the narrow edges.' },
      { key: 'orbWobbleAmp', label: 'Undulation', value: 0.06, min: 0, max: 0.3, step: 0.001, uniform: false, desc: 'How far each point swings in and out, as a fraction of the radius.' },
      { key: 'orbPoints', label: 'Points', value: 6, min: 3, max: 12, step: 1, uniform: false, desc: 'Number of control points around the edge; the outline is a smooth curve through them.', when: { key: 'orbWobbleAmp', not: [0] } },
      { key: 'orbWobbleSpeed', label: 'Undulation speed', value: 0.11, min: 0, max: 1, step: 0.005, uniform: false, desc: 'Sine cycles per second for each point.', when: { key: 'orbWobbleAmp', not: [0] } },
      { key: 'orbSpeedJitter', label: 'Speed jitter', value: 0.35, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Per-point variation in sine speed, so points drift in and out of phase.', when: { key: 'orbWobbleAmp', not: [0] } },
      { key: 'orbAmpJitter', label: 'Amplitude jitter', value: 0.5, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How much each point\'s swing size wanders over time.', when: { key: 'orbWobbleAmp', not: [0] } },
      { key: 'orbAmpJitterSpeed', label: 'Jitter speed', value: 0.06, min: 0, max: 1, step: 0.005, uniform: false, desc: 'How fast the swing sizes wander.', when: { key: 'orbAmpJitter', not: [0] } },
      { key: 'orbDrift', label: 'Drift', value: 0.052, min: 0, max: 0.1, step: 0.001, uniform: false, desc: 'How far the orb wanders from centre.' },
      { key: 'orbEdgeSoftness', label: 'Edge softness', value: 0.0005, min: 0, max: 0.03, step: 0.0005, desc: 'Extra feathering on the silhouette (0 = crisp, antialiased).' },
      { key: 'orbColor', label: 'Edge colour', type: 'color', value: '#1c0605', desc: 'Red-black body colour near the edge.' },
      { key: 'orbCoreColor', label: 'Core colour', type: 'color', value: '#030000', desc: 'Colour at the centre of the orb.' },
      { key: 'orbHueShare', label: 'Halo hue share', value: 0.32, min: 0, max: 1.5, step: 0.005, desc: 'How much of the nearest halo colour bleeds into the orb rim.' },
      { key: 'orbHueDepth', label: 'Hue share depth', value: 0.03, min: 0.005, max: 0.6, step: 0.005, desc: 'How far inward the borrowed halo hue reaches.', when: { key: 'orbHueShare', not: [0] } },
      { key: 'orbSheen', label: 'Inner sheen', value: 0.05, min: 0, max: 0.5, step: 0.005, desc: 'Faint swirling halo-tinted texture inside the orb.' },
    ],
  },
  {
    group: 'Halo',
    params: [
      { key: 'haloInner', label: 'Inner colour', type: 'color', value: '#ff7a22', desc: 'Halo colour hugging the orb.' },
      { key: 'haloOuter', label: 'Outer colour', type: 'color', value: '#d2260c', desc: 'Halo colour toward its fading edge.' },
      { key: 'haloHueVariation', label: 'Hue variation', value: 1, min: 0, max: 1, step: 0.01, desc: 'Angular drift between inner and outer colour around the ring.' },
      { key: 'haloIntensity', label: 'Intensity', value: 0.88, min: 0, max: 1, step: 0.01, desc: 'Peak opacity of the halo.' },
      { key: 'haloColorBias', label: 'Colour bias', value: 1, min: 0.1, max: 3, step: 0.01, desc: '<1 brings the outer colour in closer to the orb.', when: { key: 'haloIntensity', not: [0] } },
      { key: 'haloReach', label: 'Reach', value: 0.385, min: 0.02, max: 1.2, step: 0.005, uniform: false, desc: 'Distance beyond the halo body over which it fades to zero.', when: { key: 'haloIntensity', not: [0] } },
      { key: 'haloFalloff', label: 'Falloff', value: 1.7, min: 0.3, max: 6, step: 0.01, desc: 'Shape of the fade — higher = tighter glow, longer faint tail.', when: { key: 'haloIntensity', not: [0] } },
      { key: 'haloScale', label: 'Body scale', value: 1.04, min: 0.5, max: 2, step: 0.005, desc: 'Size of the halo body relative to the orb.', when: { key: 'haloIntensity', not: [0] } },
      { key: 'haloLag', label: 'Lag (s)', value: 1.2, min: 0, max: 5, step: 0.01, uniform: false, desc: 'How far behind the orb the halo follows the same undulation.', when: { key: 'haloIntensity', not: [0] } },
      { key: 'haloIndependence', label: 'Independence', value: 0.3, min: 0, max: 1, step: 0.01, desc: '0 = lagged copy of the orb shape, 1 = its own shape entirely.', when: { key: 'haloIntensity', not: [0] } },
      { key: 'haloWobbleAmp', label: 'Own undulation', value: 0.06, min: 0, max: 0.4, step: 0.001, desc: 'Amplitude of the halo\'s independent shape (fraction of radius).', when: { key: 'haloIndependence', not: [0] } },
      { key: 'haloWobbleFreq', label: 'Own lobes', value: 1, min: 0.2, max: 4, step: 0.01, desc: 'Size of the bulges in the halo\'s independent shape.', when: { key: 'haloWobbleAmp', not: [0] } },
      { key: 'haloWobbleSpeed', label: 'Own speed', value: 0.08, min: 0, max: 1, step: 0.005, desc: 'How fast the halo\'s independent shape evolves.', when: { key: 'haloWobbleAmp', not: [0] } },
      { key: 'haloPulse', label: 'Breathing', value: 0.12, min: 0, max: 0.6, step: 0.005, uniform: false, desc: 'How much the reach swells and contracts.', when: { key: 'haloIntensity', not: [0] } },
      { key: 'haloPulseSpeed', label: 'Breath speed', value: 0.25, min: 0, max: 2, step: 0.005, uniform: false, desc: 'Speed of the swell.', when: { key: 'haloPulse', not: [0] } },
      { key: 'haloRays', label: 'Flame texture', value: 0, min: 0, max: 1.5, step: 0.01, desc: 'Streaky outward-moving texture in the outer halo.', when: { key: 'haloIntensity', not: [0] } },
    ],
  },
  {
    group: 'Film burn',
    params: [
      { key: 'exposure', label: 'Exposure', value: 1.04, min: 0.5, max: 1.6, step: 0.01, desc: 'Overall brightness before grain.' },
      { key: 'filmFps', label: 'Film frame rate', value: 24, min: 6, max: 60, step: 1, uniform: false, desc: 'Rate at which grain and dust update.' },
      { key: 'vignette', label: 'Vignette', value: 0.41, min: 0, max: 1, step: 0.01, desc: 'Corner burn: the image is multiplied by the vignette colour toward the corners.' },
      { key: 'vignetteColor', label: 'Vignette colour', type: 'color', value: '#ff6a2a', desc: 'Multiply tint for the corners. Saturated warm colours scorch without greying; darker colours darken.', when: { key: 'vignette', not: [0] } },
      { key: 'leak', label: 'Light leaks', value: 1.23, min: 0, max: 1.5, step: 0.01, desc: 'Drifting hot blooms creeping in from the edges, over everything.' },
      { key: 'leakColor', label: 'Leak colour', type: 'color', value: '#ff5a1e', desc: 'Colour of the light leaks.', when: { key: 'leak', not: [0] } },
      { key: 'leakSpeed', label: 'Leak speed', value: 0.08, min: 0, max: 1, step: 0.005, desc: 'How fast leaks drift and morph.', when: { key: 'leak', not: [0] } },
      { key: 'burnHighlights', label: 'Highlight burn', value: 0.6, min: 0, max: 1, step: 0.01, desc: 'Over-bright areas blow out toward the burn colour.' },
      { key: 'burnColor', label: 'Burn colour', type: 'color', value: '#fff3d2', desc: 'What blown highlights clip to.', when: { key: 'burnHighlights', not: [0] } },
    ],
  },
  film(),
];
