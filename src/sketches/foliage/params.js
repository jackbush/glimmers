// Foliage — parameter schema.
//
// One species: every leaf on the page is drawn from these params, varied a little per leaf
// by Variety. Shape is built on the CPU (shapes.js); params without `uniform: false` are
// also auto-declared in every shader as `u_<key>` (`vec3` for colours), like Blackstar.
//
// Select params are the botanical categories. Underneath, each option is a set of
// continuous numbers (see shapes.js), so switching one morphs over Morph time.

import { playback } from '../../kit/standard.js';

export default [
  playback({}, {
    quality: true,
    extra: [
      { key: 'seed', label: 'Seed', value: 7, min: 0, max: 100, step: 1, uniform: false, desc: 'A different take: new leaf variants and a new arrangement.' },
    ],
  }),
  {
    group: 'Layout',
    params: [
      { key: 'scale', label: 'Scale', value: 0.2, min: 0.05, max: 0.7, step: 0.005, uniform: false, desc: 'Leaf length as a fraction of the screen\'s short side. Sets how many leaves fit on the page.' },
      { key: 'isolate', label: 'Key only', type: 'bool', value: false, uniform: false, desc: 'Show only the key leaf at the centre. Turning it off grows a fresh page outward from it.' },
      { key: 'cascade', label: 'Cascade', value: 60, min: 5, max: 300, step: 1, uniform: false, desc: 'Leaves placed per second as the page grows outward from the key.' },
      { key: 'sizeVariance', label: 'Size variance', value: 0.3, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How much leaf sizes differ from one another.' },
      { key: 'gap', label: 'Gap', value: 0.045, min: 0, max: 0.3, step: 0.005, uniform: false, desc: 'Space kept between leaves, as a fraction of leaf length. Sets how densely the page fills.' },
      { key: 'variants', label: 'Variants', value: 8, min: 1, max: 16, step: 1, uniform: false, desc: 'How many different leaf shapes are drawn from the shared params (a wallpaper repeats its motifs).' },
      { key: 'variety', label: 'Variety', value: 0.35, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How far each variant strays from the shared params: width, bend, lobes, teeth.' },
      { key: 'twist', label: 'Twist', value: 0.6, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How freely leaves rotate to tessellate around their neighbours.' },
      { key: 'flowAngle', label: 'Flow angle °', value: -70, min: -180, max: 180, step: 1, uniform: false, desc: 'Direction the leaves tend to point.' },
      { key: 'flowAlign', label: 'Flow', value: 0.25, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How strongly leaves turn toward the flow angle (0 = any direction).' },
      { key: 'mirrorShare', label: 'Mirrored', value: 0.5, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Share of leaves drawn mirrored.' },
      { key: 'turnovers', label: 'Underside up', value: 0.2, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Share of leaves lying the other side up: mirrored, in the underside colours, veins dark.' },
      { key: 'gather', label: 'Gather', value: 0.08, min: 0, max: 0.5, step: 0.005, uniform: false, desc: 'How strongly leaves drift in toward the key, keeping the pattern compact (leaf lengths per second).' },
      { key: 'glide', label: 'Glide', value: 1.2, min: 0.1, max: 4, step: 0.05, uniform: false, desc: 'Top speed of leaves easing apart when shapes change, in leaf lengths per second.' },
      { key: 'morph', label: 'Morph time', value: 0.7, min: 0, max: 3, step: 0.05, uniform: false, desc: 'Seconds a shape takes to morph when you switch a category.' },
    ],
  },
  {
    group: 'Motion',
    params: [
      { key: 'breathFrequency', label: 'Breath rate', value: 0.12, min: 0, max: 1, step: 0.005, uniform: false, desc: 'Breaths per second: each leaf slowly swells and shrinks, the rhythm rippling outward from the key.' },
      { key: 'breathAmplitude', label: 'Breath depth', value: 0.04, min: 0, max: 0.2, step: 0.001, uniform: false, desc: 'How much each leaf swells, as a fraction of its size. Leaves keep room for a full breath, so this never makes them touch.' },
      { key: 'wind', label: 'Wind', value: 0, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How much each leaf sways about its own centre (0 = still).' },
      { key: 'gusts', label: 'Gusts', value: 0, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Unevenness of the sway between leaves.' },
    ],
  },
  {
    group: 'Leaf',
    params: [
      { key: 'compound', label: 'Leaf type', type: 'select', options: ['Simple', 'Pinnate', 'Bipinnate', 'Palmate', 'Trifoliate'], value: 'Simple', uniform: false, desc: 'One blade, or a compound leaf made of leaflets (ash = pinnate, horse chestnut = palmate).' },
      { key: 'leaflets', label: 'Leaflets', value: 7, min: 2, max: 15, step: 1, uniform: false, desc: 'Leaflet count for compound leaves (pinnae for bipinnate). Odd counts end in a terminal leaflet.' },
      { key: 'leafletAngle', label: 'Leaflet angle °', value: 55, min: 10, max: 100, step: 1, uniform: false, desc: 'Angle between side leaflets and the leaf axis.' },
      { key: 'outline', label: 'Outline', type: 'select', options: ['Linear', 'Lanceolate', 'Elliptic', 'Ovate', 'Obovate', 'Cordate', 'Orbicular', 'Deltoid', 'Needle'], value: 'Ovate', uniform: false, desc: 'Overall shape of the blade.' },
      { key: 'width', label: 'Width', value: 1, min: 0.2, max: 3, step: 0.01, uniform: false, desc: 'Blade width relative to the outline\'s natural length:width ratio.' },
      { key: 'base', label: 'Base', type: 'select', options: ['Cuneate', 'Rounded', 'Cordate', 'Truncate', 'Asymmetric'], value: 'Rounded', uniform: false, desc: 'Shape of the blade where it meets the stalk. Asymmetric is the elm giveaway.' },
      { key: 'apex', label: 'Apex', type: 'select', options: ['Acute', 'Acuminate', 'Obtuse', 'Rounded', 'Notched'], value: 'Acuminate', uniform: false, desc: 'Shape of the tip.' },
      { key: 'bend', label: 'Bend', value: 0.35, min: -2, max: 2, step: 0.01, uniform: false, desc: 'How much the midrib curves.' },
      { key: 'sCurve', label: 'S-curve', value: 0.3, min: -2, max: 2, step: 0.01, uniform: false, desc: 'Curve that reverses halfway along the leaf.' },
    ],
  },
  {
    group: 'Lobes & margin',
    params: [
      { key: 'lobing', label: 'Lobing', type: 'select', options: ['Unlobed', 'Pinnately lobed', 'Palmately lobed'], value: 'Unlobed', uniform: false, desc: 'Lobes along the midrib (oak) or radiating from the base (maple, plane).' },
      { key: 'lobeDepth', label: 'Lobe depth', value: 0.5, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How far the sinuses cut toward the midrib.' },
      { key: 'lobes', label: 'Lobes', value: 5, min: 2, max: 9, step: 1, uniform: false, desc: 'Lobe count (per side for pinnate lobing). Palmate venation uses it for its primary veins.' },
      { key: 'lobeSharpness', label: 'Lobe sharpness', value: 0.4, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Rounded lobes (0) to pointed ones (1).' },
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
      { key: 'veinlets', label: 'Veinlets', value: 4, min: 0, max: 12, step: 1, uniform: false, desc: 'Fine cross-veins between neighbouring secondary veins (pinnate venation).' },
      { key: 'veinWeight', label: 'Vein weight', value: 0.0045, min: 0, max: 0.02, step: 0.0005, uniform: false, desc: 'Half-width of secondary veins at their base, as a fraction of leaf length.' },
      { key: 'midribWeight', label: 'Midrib weight', value: 0.009, min: 0, max: 0.03, step: 0.0005, uniform: false, desc: 'Half-width of the midrib, rachis and stalk at the base.' },
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
      { key: 'divergence', label: 'Divergence °', value: 180, min: 90, max: 180, step: 0.5, uniform: false, desc: 'Turn between successive alternate leaves around the stem: 180 = flat, two-ranked; 137.5 = spiral (some leaves foreshortened).' },
      { key: 'decussate', label: 'Decussate', type: 'bool', value: false, uniform: false, desc: 'Opposite pairs turn 90° at each node, so every other pair is seen end-on.' },
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
    ],
  },
  {
    group: 'Print',
    params: [
      { key: 'outlineWeight', label: 'Outline weight', value: 0.0055, min: 0, max: 0.03, step: 0.0005, uniform: false, desc: 'Half-width of the outline, as a fraction of leaf length.' },
      { key: 'minLine', label: 'Finest line px', value: 0.8, min: 0.2, max: 3, step: 0.05, desc: 'Thinnest any cut line gets, in CSS px, so small leaves keep their drawing.' },
      { key: 'strokeShade', label: 'Shadow weight', value: 0.9, min: 0, max: 3, step: 0.01, desc: 'Outlines thicken along the hatched (shaded) half, like an engraved line.' },
      { key: 'strokeVariance', label: 'Line variance', value: 0.45, min: 0, max: 1, step: 0.01, desc: 'Swelling and thinning along every line, as from a hand-cut block.' },
      { key: 'ragged', label: 'Ragged edge px', value: 0.7, min: 0, max: 3, step: 0.05, desc: 'How torn the edges of every line and colour block are, in CSS px.' },
      { key: 'wobble', label: 'Hand wobble', value: 0.004, min: 0, max: 0.02, step: 0.0005, uniform: false, desc: 'Slight unsteadiness in outlines and veins, as a fraction of leaf length.' },
      { key: 'dryBrush', label: 'Broken line', value: 0.22, min: 0, max: 1, step: 0.01, desc: 'Gaps where the block printed light.' },
      { key: 'misregister', label: 'Misregister px', value: 2.2, min: 0, max: 12, step: 0.1, desc: 'How far each leaf\'s colour block slips from its outline, in CSS px.' },
      { key: 'hatchWeight', label: 'Hatch weight', value: 0.75, min: 0, max: 1, step: 0.01, desc: 'Width of hatch lines where shading is heaviest, as a share of their spacing (0 = no hatching). Lines taper to nothing where shading ends.' },
      { key: 'hatchDensity', label: 'Hatch density', value: 70, min: 5, max: 200, step: 1, desc: 'Hatch lines per leaf length. Where shading is heaviest a second set doubles them.' },
      { key: 'hatchSlope', label: 'Hatch slope', value: 0.55, min: -2, max: 2, step: 0.01, desc: 'How steeply hatch lines sweep toward the tip, like the veins.' },
      { key: 'hatchReach', label: 'Hatch reach', value: 0.6, min: 0, max: 1, step: 0.01, desc: 'How far in from the margin the shading reaches (the shaded half reaches further).' },
      { key: 'crossHatch', label: 'Cross-hatch', value: 0.5, min: 0, max: 1, step: 0.01, desc: 'A second set of lines at a steeper angle, crossing the hatching where shading is heaviest.' },
    ],
  },
  {
    group: 'Colour',
    params: [
      { key: 'ground', label: 'Ground', type: 'color', value: '#e7dcc0', desc: 'Paper colour behind the leaves (and the page).' },
      { key: 'leafSurface', label: 'Leaf surface', type: 'color', value: '#5d7046', desc: 'Upper side of the leaves.' },
      { key: 'leafUnderside', label: 'Leaf underside', type: 'color', value: '#a9b48c', desc: 'Underside, on leaves lying the other side up.' },
      { key: 'autumnSurface', label: 'Autumn surface', type: 'color', value: '#9c5134', desc: 'Upper side of autumn leaves.' },
      { key: 'autumnUnderside', label: 'Autumn underside', type: 'color', value: '#c79a6c', desc: 'Underside of autumn leaves.' },
      { key: 'autumnShare', label: 'Autumn share', value: 0.06, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Share of leaves in their autumn colours.' },
      { key: 'ink', label: 'Ink', type: 'color', value: '#232b1c', desc: 'Outline, hatching and underside veins.' },
      { key: 'veinColour', label: 'Veins', type: 'color', value: '#e2d8b4', desc: 'Vein colour on the upper side (pale = cut into the block, so the paper shows).' },
      { key: 'stemColour', label: 'Stem', type: 'color', value: '#5d5232', desc: 'Stem and stalk colour.' },
    ],
  },
];
