// Leaf — parameter schema.
//
// One leaf (or one sprig) centred on the screen, drawn as if backlit on a light table.
// Shape params are Foliage's; the light-table look is its own. Params without
// `uniform: false` are auto-declared in the shader as `u_<key>` (`vec3` for colours).

import { playback } from '../../kit/standard.js';

export default [
  playback({}, {
    quality: true,
    extra: [
      { key: 'seed', label: 'Seed', value: 7, min: 0, max: 100, step: 1, uniform: false, desc: 'A different take on the same leaf: small irregularities in outline, veins and capillaries.' },
    ],
  }),
  {
    group: 'Leaf',
    params: [
      { key: 'scale', label: 'Scale', value: 1, min: 0.1, max: 2, step: 0.01, uniform: false, desc: 'Size on screen: 1 fits the leaf (or sprig) to 90% of the short side.' },
      { key: 'compound', label: 'Leaf type', type: 'select', options: ['Simple', 'Pinnate', 'Bipinnate', 'Palmate', 'Trifoliate'], value: 'Simple', uniform: false, desc: 'One blade, or a compound leaf made of leaflets (ash = pinnate, horse chestnut = palmate).' },
      { key: 'leaflets', label: 'Leaflets', value: 7, min: 2, max: 15, step: 1, uniform: false, desc: 'Leaflet count for compound leaves (pinnae for bipinnate). Odd counts end in a terminal leaflet.' },
      { key: 'leafletAngle', label: 'Leaflet angle °', value: 55, min: 10, max: 100, step: 1, uniform: false, desc: 'Angle between side leaflets and the leaf axis.' },
      { key: 'outline', label: 'Outline', type: 'select', options: ['Linear', 'Lanceolate', 'Elliptic', 'Ovate', 'Obovate', 'Cordate', 'Orbicular', 'Deltoid', 'Needle'], value: 'Ovate', uniform: false, desc: 'Overall shape of the blade.' },
      { key: 'width', label: 'Width', value: 1, min: 0.2, max: 3, step: 0.01, uniform: false, desc: 'Blade width relative to the outline\'s natural length:width ratio.' },
      { key: 'base', label: 'Base', type: 'select', options: ['Cuneate', 'Rounded', 'Cordate', 'Truncate', 'Asymmetric'], value: 'Rounded', uniform: false, desc: 'Shape of the blade where it meets the stalk. Asymmetric is the elm giveaway.' },
      { key: 'apex', label: 'Apex', type: 'select', options: ['Acute', 'Acuminate', 'Obtuse', 'Rounded', 'Notched'], value: 'Acuminate', uniform: false, desc: 'Shape of the tip.' },
      { key: 'bend', label: 'Bend', value: 0.35, min: -2, max: 2, step: 0.01, uniform: false, desc: 'How much the midrib curves.' },
      { key: 'sCurve', label: 'S-curve', value: 0.3, min: -2, max: 2, step: 0.01, uniform: false, desc: 'Curve that reverses halfway along the leaf.' },
      { key: 'morph', label: 'Morph time', value: 0.7, min: 0, max: 3, step: 0.05, uniform: false, desc: 'Seconds a shape takes to morph when you switch a category.' },
    ],
  },
  {
    group: 'Lobes',
    params: [
      { key: 'lobing', label: 'Lobing', type: 'select', options: ['Unlobed', 'Pinnately lobed', 'Palmately lobed'], value: 'Unlobed', uniform: false, desc: 'Lobes along the midrib (oak) or radiating from the base (maple, plane).' },
      { key: 'lobeDepth', label: 'Lobe depth', value: 0.5, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How far the sinuses cut toward the midrib.' },
      { key: 'lobes', label: 'Lobes', value: 5, min: 2, max: 9, step: 1, uniform: false, desc: 'Lobe count (per side for pinnate lobing). Palmate venation uses it for its primary veins.' },
      { key: 'lobeSharpness', label: 'Lobe sharpness', value: 0.4, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Rounded lobes (0) to pointed ones (1).' },
    ],
  },
  {
    group: 'Margin',
    params: [
      { key: 'margin', label: 'Margin', type: 'select', options: ['Entire', 'Serrate', 'Doubly serrate', 'Dentate', 'Crenate', 'Wavy', 'Spiny'], value: 'Serrate', uniform: false, desc: 'The edge: smooth, toothed, scalloped, wavy or spiny (holly).' },
      { key: 'teeth', label: 'Teeth', value: 22, min: 3, max: 60, step: 1, uniform: false, desc: 'Teeth (or waves) along each side.' },
      { key: 'toothDepth', label: 'Tooth depth', value: 0.018, min: 0, max: 0.1, step: 0.001, uniform: false, desc: 'Size of the teeth, as a fraction of leaf length.' },
    ],
  },
  {
    group: 'Veins',
    params: [
      { key: 'venation', label: 'Venation', type: 'select', options: ['Pinnate', 'Palmate', 'Parallel', 'Arcuate'], value: 'Pinnate', uniform: false, desc: 'Vein pattern: off a midrib, from the base, running lengthways (grasses), or arching to the tip (dogwood).' },
      { key: 'veinCount', label: 'Veins', value: 8, min: 2, max: 20, step: 1, uniform: false, desc: 'Secondary veins per side.' },
      { key: 'veinAngle', label: 'Vein angle °', value: 48, min: 15, max: 85, step: 1, uniform: false, desc: 'Angle at which secondary veins leave the midrib.' },
      { key: 'veinCurve', label: 'Vein curve', value: 0.35, min: -1, max: 1, step: 0.01, uniform: false, desc: 'How much secondary veins arch toward the tip.' },
      { key: 'veinlets', label: 'Veinlets', value: 6, min: 0, max: 12, step: 1, uniform: false, desc: 'Fine cross-veins between neighbouring secondary veins (pinnate venation).' },
      { key: 'veinWeight', label: 'Vein weight', value: 0.0065, min: 0, max: 0.02, step: 0.0005, uniform: false, desc: 'Half-width of secondary veins at their base, as a fraction of leaf length.' },
      { key: 'midribWeight', label: 'Midrib weight', value: 0.013, min: 0, max: 0.03, step: 0.0005, uniform: false, desc: 'Half-width of the midrib, rachis and stalk at the base.' },
    ],
  },
  {
    group: 'Stalk',
    params: [
      { key: 'petioleLength', label: 'Petiole length', value: 0.16, min: 0, max: 0.8, step: 0.01, uniform: false, desc: 'Leaf-stalk length relative to the blade.' },
      { key: 'petioleFlat', label: 'Flattened', value: 0, min: 0, max: 1, step: 0.01, uniform: false, desc: 'A broad, flat stalk (aspen).' },
      { key: 'petioleWing', label: 'Winged', value: 0, min: 0, max: 1, step: 0.01, uniform: false, desc: 'A leafy wing running down the stalk.' },
      { key: 'stipules', label: 'Stipules', value: 0, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Size of the pair of small leafy flaps at the stalk\'s base (0 = none).' },
    ],
  },
  {
    group: 'Stem',
    params: [
      { key: 'arrangement', label: 'Arrangement', type: 'select', options: ['No stem', 'Alternate', 'Opposite', 'Whorled'], value: 'No stem', uniform: false, desc: 'Loose leaves, or sprigs: leaves one per node, in pairs, or in rings. A sprig moves as one piece.' },
      { key: 'nodes', label: 'Nodes', value: 5, min: 2, max: 10, step: 1, uniform: false, desc: 'Nodes (leaf positions) on each sprig.' },
      { key: 'divergence', label: 'Divergence °', value: 180, min: 90, max: 180, step: 0.5, uniform: false, desc: 'Turn between successive alternate leaves around the stem. Pressed flat: 180 = a clean left-right zigzag; other angles give an irregular rhythm, with some leaves pressed nearer the stem.' },
      { key: 'decussate', label: 'Decussate', type: 'bool', value: false, uniform: false, desc: 'Opposite pairs turn 90° at each node; pressed flat, pairs alternate wide and narrow.' },
      { key: 'whorlCount', label: 'Whorl count', value: 3, min: 3, max: 5, step: 1, uniform: false, desc: 'Leaves in each whorl.' },
      { key: 'internode', label: 'Internode', value: 0.45, min: 0.1, max: 1.5, step: 0.01, uniform: false, desc: 'Stem length between nodes, relative to leaf length.' },
      { key: 'internodeTaper', label: 'Internode taper', value: 0.35, min: 0, max: 0.9, step: 0.01, uniform: false, desc: 'How much the gaps between nodes shorten toward the tip.' },
      { key: 'bareStem', label: 'Bare stem', value: 0.3, min: 0, max: 1.5, step: 0.01, uniform: false, desc: 'Leafless stem below the first node, relative to leaf length.' },
      { key: 'insertion', label: 'Insertion °', value: 55, min: 5, max: 100, step: 1, uniform: false, desc: 'Angle between the stem and the lowest leaves.' },
      { key: 'tipInsertion', label: 'Tip insertion °', value: 30, min: 5, max: 100, step: 1, uniform: false, desc: 'Angle between the stem and the leaves at the tip.' },
      { key: 'sizeGradient', label: 'Size gradient', value: 0.4, min: -0.5, max: 0.9, step: 0.01, uniform: false, desc: 'How much leaves shrink toward the tip (negative = grow).' },
      { key: 'stemWidth', label: 'Stem width', value: 0.014, min: 0.002, max: 0.05, step: 0.001, uniform: false, desc: 'Half-width of the stem at its base, relative to leaf length.' },
      { key: 'stemTaper', label: 'Stem taper', value: 0.6, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How much the stem thins toward the tip.' },
      { key: 'stemCurve', label: 'Stem curve', value: 0.35, min: -1.5, max: 1.5, step: 0.01, uniform: false, desc: 'Overall bend of the stem.' },
      { key: 'stemDroop', label: 'Droop', value: 0.25, min: -1, max: 1.5, step: 0.01, uniform: false, desc: 'Extra bend toward the tip, as if weighed down.' },
      { key: 'zigzag', label: 'Zigzag °', value: 10, min: 0, max: 40, step: 0.5, uniform: false, desc: 'Kink at each node, away from its leaf (hornbeam, elm).' },
      { key: 'terminal', label: 'Terminal', type: 'select', options: ['Leaf', 'Bud', 'Bare'], value: 'Leaf', uniform: false, desc: 'What ends the sprig.' },
      { key: 'leafVariety', label: 'Leaf variety', value: 0.3, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How much the leaves on a sprig differ from one another.' },
    ],
  },
  {
    group: 'Light table',
    params: [
      { key: 'outlineWeight', label: 'Outline weight', value: 0.0025, min: 0, max: 0.02, step: 0.0005, uniform: false, desc: 'Half-width of the margin line, as a fraction of leaf length.' },
      { key: 'minLine', label: 'Finest line px', value: 0.6, min: 0.2, max: 3, step: 0.05, desc: 'Thinnest any line gets, in CSS px.' },
      { key: 'wobble', label: 'Wobble', value: 0.0015, min: 0, max: 0.02, step: 0.0005, uniform: false, desc: 'Natural unevenness in the outline and veins, as a fraction of leaf length.' },
      { key: 'veinCore', label: 'Vein glow', value: 0.55, min: 0, max: 1, step: 0.01, desc: 'Share of each vein\'s width that glows; the rest is its darker edge.' },
      { key: 'capillaryDensity', label: 'Capillaries', value: 80, min: 4, max: 160, step: 1, desc: 'Capillary cells (areoles) across a leaf length.' },
      { key: 'capillaryWeight', label: 'Capillary weight', value: 0.06, min: 0, max: 0.3, step: 0.005, desc: 'Width of capillary lines, as a share of a cell.' },
      { key: 'fineCapillaries', label: 'Fine network', value: 0.5, min: 0, max: 1, step: 0.01, desc: 'A finer, fainter network inside each cell.' },
      { key: 'cellVariation', label: 'Cell variation', value: 0.045, min: 0, max: 0.5, step: 0.01, desc: 'How much each little cell differs in brightness.' },
      { key: 'rim', label: 'Rim', value: 0.35, min: 0, max: 1, step: 0.01, desc: 'Darkening toward the margin, where the leaf is thicker against the light.' },
      { key: 'mottleScale', label: 'Mottle scale', value: 6, min: 0.5, max: 30, step: 0.1, desc: 'Size of the mottling: patches per leaf length (higher = finer).' },
    ],
  },
  {
    group: 'Colour',
    params: [
      { key: 'background', label: 'Background', type: 'color', value: '#05003d', desc: 'Behind the leaf (and the page).' },
      { key: 'backgroundMottle', label: 'Background mottle', value: 0.12, min: 0, max: 1, step: 0.01, desc: 'Unevenness in the background colour.' },
      { key: 'blade', label: 'Blade', type: 'color', value: '#b9cf3c', desc: 'The leaf tissue, lit from behind.' },
      { key: 'bladeMottle', label: 'Blade mottle', value: 0.18, min: 0, max: 1, step: 0.01, desc: 'Unevenness in the blade colour.' },
      { key: 'capillary', label: 'Capillary', type: 'color', value: '#5e7618', desc: 'The fine network between the veins.' },
      { key: 'capillaryMottle', label: 'Capillary mottle', value: 0.25, min: 0, max: 1, step: 0.01, desc: 'Unevenness in the capillary colour.' },
      { key: 'vein', label: 'Vein', type: 'color', value: '#f1f4a6', desc: 'The glowing core of each vein.' },
      { key: 'veinEdge', label: 'Vein edge', type: 'color', value: '#6f8a1d', desc: 'The darker edges of each vein.' },
      { key: 'veinMottle', label: 'Vein mottle', value: 0.15, min: 0, max: 1, step: 0.01, desc: 'Unevenness in the vein colours.' },
      { key: 'outlineColour', label: 'Outline', type: 'color', value: '#33440f', desc: 'The margin line and rim.' },
      { key: 'outlineMottle', label: 'Outline mottle', value: 0.2, min: 0, max: 1, step: 0.01, desc: 'Unevenness in the outline colour.' },
      { key: 'stemColour', label: 'Stem', type: 'color', value: '#8a7a2c', desc: 'Stalk and stem.' },
      { key: 'stemMottle', label: 'Stem mottle', value: 0.2, min: 0, max: 1, step: 0.01, desc: 'Unevenness in the stem colour.' },
    ],
  },
];
