// Leaf — parameter schema.
//
// One leaf (or one sprig) centred on the screen, drawn as if backlit on a light table.
// Shape groups, then Finish (the drawing style). Params without
// `uniform: false` are auto-declared in the shader as `u_<key>` (`vec3` for colours).

import { playback } from '../../kit/standard.js';

const pb = playback({}, {
  quality: true,
  extra: [
    { key: 'seed', label: 'Seed', value: 7, min: 0, max: 100, step: 1, uniform: false, desc: 'A different take on the same leaf: small irregularities in outline, veins and capillaries.' },
  ],
});
// Sway goes at the bottom of Playback.
pb.params.push(
  { key: 'sway', label: 'Sway', value: 0, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How much the sprig and its leaves rock at rest, each on its own slow rhythm (0 = still).' },
  { key: 'swaySpeed', label: 'Sway speed', value: 0.04, min: 0.005, max: 1, step: 0.005, uniform: false, desc: 'Rocking rhythm, in cycles per second.' },
);

const schema = [
  pb,
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
      { key: 'morph', label: 'Morph time', value: 0.7, min: 0, max: 3, step: 0.05, uniform: false, desc: 'Seconds the shape takes to settle after a slider or menu change: categories morph, numbers glide, leaves grow in from the stem. Presets take their own, longer morph.' },
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
      { key: 'petioleLength', label: 'Petiole length', value: 0.27, min: 0, max: 0.8, step: 0.01, uniform: false, desc: 'Leaf-stalk length relative to the blade.' },
      { key: 'petioleFlat', label: 'Flattened', value: 0, min: 0, max: 1, step: 0.01, uniform: false, desc: 'A broad, flat stalk (aspen).' },
      { key: 'petioleWing', label: 'Winged', value: 0, min: 0, max: 1, step: 0.01, uniform: false, desc: 'A leafy wing running down the stalk.' },
      { key: 'stipules', label: 'Stipules', value: 0, min: 0, max: 1, step: 0.01, uniform: false, desc: 'Size of the pair of small leafy flaps at the stalk\'s base (0 = none).' },
    ],
  },
  {
    group: 'Stem',
    params: [
      { key: 'arrangement', label: 'Arrangement', type: 'select', options: ['No stem', 'Alternate', 'Opposite', 'Whorled'], value: 'Alternate', uniform: false, desc: 'Loose leaves, or sprigs: leaves one per node, in pairs, or in rings. A sprig moves as one piece.' },
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
      { key: 'stemTaper', label: 'Stem taper', value: 0.44, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How much the stem thins toward the tip.' },
      { key: 'stemCurve', label: 'Stem curve', value: 0.69, min: -1.5, max: 1.5, step: 0.01, uniform: false, desc: 'Overall bend of the stem.' },
      { key: 'stemDroop', label: 'Droop', value: -0.06, min: -1, max: 1.5, step: 0.01, uniform: false, desc: 'Extra bend toward the tip, as if weighed down.' },
      { key: 'zigzag', label: 'Zigzag °', value: 25.5, min: 0, max: 40, step: 0.5, uniform: false, desc: 'Kink at each node, away from its leaf (hornbeam, elm).' },
      { key: 'terminal', label: 'Terminal', type: 'select', options: ['Leaf', 'Bud', 'Bare'], value: 'Bud', uniform: false, desc: 'What ends the sprig.' },
      { key: 'stemTexture', label: 'Stem texture', value: 0.35, min: 0, max: 1, step: 0.01, desc: 'Fibrous streaks running along the stem and stalks.' },
      { key: 'stemShading', label: 'Stem shading', value: 0.35, min: 0, max: 1, step: 0.01, desc: 'Short pen strokes across the shaded side of the stem and stalks (pen and watercolour styles).' },
      { key: 'stemFade', label: 'Stem fade', value: 0.2, min: 0, max: 1.5, step: 0.01, desc: 'How far up from the cut end the stem\'s wash fades in and its pen lines break up, in leaf lengths.' },
      { key: 'budType', label: 'Bud', type: 'select', options: ['Pointed', 'Plump', 'Scaled', 'Cluster'], value: 'Pointed', uniform: false, desc: 'Shape of the terminal bud: long and pointed (beech), plump (lime), scaled (horse chestnut), or a cluster (oak).' },
      { key: 'budStem', label: 'Bud stem', value: 0.06, min: 0, max: 0.6, step: 0.005, uniform: false, desc: 'How far the stem runs on past the last node to the bud, relative to leaf length.' },
      { key: 'budSize', label: 'Bud size', value: 0.055, min: 0.02, max: 0.4, step: 0.005, uniform: false, desc: 'Length of the terminal bud, as a fraction of leaf length.' },
      { key: 'leafVariety', label: 'Leaf variety', value: 0.31, min: 0, max: 1, step: 0.01, uniform: false, desc: 'How much the leaves on a sprig differ from one another.' },
    ],
  },
  {
    group: 'Finish',
    params: [
      { key: 'style', label: 'Style', type: 'select', options: ['Outline', 'Shaded pen', 'Watercolour'], value: 'Watercolour', uniform: false, desc: 'Outline: a plain 0.1 mm fineliner drawing, just the shape. Shaded pen: adds scratchy hand-hatched shading, all line. Watercolour: a wash over the top.' },
      // Pen
      { key: 'outlineWeight', label: 'Pen weight', value: 0.0005, min: 0, max: 0.01, step: 0.0001, uniform: false, desc: 'Half-width of the pen outline, as a fraction of leaf length.' },
      { key: 'minLine', label: 'Finest line px', value: 0.2, min: 0.1, max: 3, step: 0.05, desc: 'Thinnest any pen line gets, in CSS px (hatching and vein lines use this width).' },
      { key: 'wobble', label: 'Wobble', value: 0.007, min: 0, max: 0.02, step: 0.0005, uniform: false, desc: 'Hand unevenness in the outline and veins, as a fraction of leaf length.' },
      { key: 'penOpacity', label: 'Pen opacity', value: 1, min: 0, max: 1, step: 0.01, desc: 'Strength of the pen lines.' },
      { key: 'penVeins', label: 'Pen veins', value: 0.5, min: 0, max: 1, step: 0.01, desc: 'Pen lines along both edges of each vein (one line down the thinnest).' },
      { key: 'penSkip', label: 'Pen skip', value: 0.15, min: 0, max: 1, step: 0.01, desc: 'Where the fineliner skips and the line breaks.' },
      // Shading (Shaded pen and Watercolour)
      { key: 'hatching', label: 'Hatching', value: 0.6, min: 0, max: 1, step: 0.01, desc: 'How much pen shading: more of the hatch lines are drawn where it\'s darker (no greys, only lines).' },
      { key: 'hatchDensity', label: 'Hatch density', value: 90, min: 10, max: 300, step: 1, desc: 'Hatch lines per leaf length.' },
      { key: 'hatchAngle', label: 'Hatch angle °', value: 55, min: -90, max: 90, step: 1, desc: 'Direction of the hatching, against the midrib.' },
      { key: 'crossHatch', label: 'Cross-hatch', value: 0.5, min: 0, max: 1, step: 0.01, desc: 'A second set of lines across the first in the darkest places.' },
      { key: 'hatchWonk', label: 'Wonk', value: 0.5, min: 0, max: 1, step: 0.01, desc: 'How hand-made the hatching is: wandering lines, short broken strokes.' },
      // Watercolour
      { key: 'washDensity', label: 'Wash density', value: 0.88, min: 0, max: 1, step: 0.01, desc: 'How much pigment the leaf wash carries (0 = bare paper).' },
      { key: 'halfShade', label: 'Shaded half', value: 0.66, min: 0, max: 1, step: 0.01, desc: 'How strongly one half of each leaf is painted in the shade colour.' },
      { key: 'shadeBlend', label: 'Shade softness', value: 0.58, min: 0.02, max: 1, step: 0.01, desc: 'How softly the shade colour bleeds across the midrib into the light half.' },
      { key: 'bloom', label: 'Blooms', value: 0.72, min: 0, max: 1, step: 0.01, desc: 'Soft unevenness in the wash, where pigment settled more or less.' },
      { key: 'bloomScale', label: 'Bloom scale', value: 7.3, min: 0.5, max: 20, step: 0.1, desc: 'Size of the blooms: patches per leaf length (higher = smaller).' },
      { key: 'edgeDarken', label: 'Dried edge', value: 0, min: 0, max: 1, step: 0.01, desc: 'The darker rim where a wash dried, pigment pooled at its edge.' },
      { key: 'washGap', label: 'Paper halo', value: 0.01, min: -0.2, max: 0.2, step: 0.005, desc: 'Where the wash stops against the pen line, as a share of the leaf half-width: positive leaves a sliver of paper, negative overshoots the line.' },
      { key: 'washGapJitter', label: 'Halo jitter', value: 0.02, min: 0, max: 0.2, step: 0.005, desc: 'How much the halo wanders either way along the edge (with halo 0 and jitter 0.1, the wash is sometimes inside the line, sometimes outside).' },
      { key: 'veinLift', label: 'Vein lift', value: 0.75, min: 0, max: 1, step: 0.01, desc: 'Veins left unpainted: how much paper shows through along them.' },
      { key: 'veinPool', label: 'Vein pooling', value: 0.18, min: 0, max: 1, step: 0.01, desc: 'Pigment pooled darker along each side of the veins.' },
      // Paper
      { key: 'grain', label: 'Grain', value: 0.1, min: 0, max: 1, step: 0.01, desc: 'The paper\'s grain: its texture, and where wash pigment settles into it.' },
      { key: 'grainScale', label: 'Grain scale', value: 23, min: 4, max: 120, step: 1, desc: 'Size of the paper grain, in CSS px.' },
      // Colour
      { key: 'paper', label: 'Paper', type: 'color', value: '#f0eadb', desc: 'Warm paper behind everything (and the page).' },
      { key: 'leafWash', label: 'Leaf wash', type: 'color', value: '#9db470', desc: 'The light, sage wash of the leaf.' },
      { key: 'leafShade', label: 'Leaf shade', type: 'color', value: '#3f6a55', desc: 'The deeper blue-green of the shaded half and pooled edges.' },
      { key: 'budColour', label: 'Bud', type: 'color', value: '#22180d', desc: 'The bud\'s wash: a warm, papery brown.' },
      { key: 'budShade', label: 'Bud shade', type: 'color', value: '#030101', desc: 'The bud\'s shaded half.' },
      { key: 'stemWash', label: 'Stem wash', type: 'color', value: '#876a3b', desc: 'Stalk and stem.' },
      { key: 'penColour', label: 'Pen', type: 'color', value: '#000000', desc: 'Fineliner ink: a warm sepia-black.' },
    ],
  },
];

export default schema;

// ---------------------------------------------------------------- species presets
// Each species is the current shape defaults (every group but Finish, minus Scale and Morph
// time) with what makes that tree changed on top, so picking one always lands on the same
// leaf. It also brings the tree's colours: leaf, stem and bud as they are in summer (a few in
// autumn colour instead), on a faint pastel paper from the far side of the hue wheel. The
// rest of Finish (style, pen, wash) is left as it is. Alphabetical, as the menu shows them.

const SHAPE_GROUPS = ['Leaf', 'Lobes', 'Margin', 'Veins', 'Stalk', 'Stem'];
const NOT_SHAPE = ['scale', 'morph'];
const base = {};
for (const g of schema) {
  if (!SHAPE_GROUPS.includes(g.group)) continue;
  for (const p of g.params) if (!NOT_SHAPE.includes(p.key)) base[p.key] = p.value;
}
const species = (values) => ({ ...base, ...values });

export const presets = {
  // Alder (Alnus glutinosa): rounded and broadest near the top, the tip dented in, doubly
  // toothed; leaves in three ranks, and a purple bud held up on its own short stalk. Dark
  // glossy green on pale shell-pink paper.
  Alder: species({
    compound: 'Simple',
    outline: 'Obovate', width: 1.15, base: 'Cuneate', apex: 'Notched', bend: 0.05, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Doubly serrate', teeth: 18, toothDepth: 0.015,
    venation: 'Pinnate', veinCount: 7, veinAngle: 45, veinCurve: 0.15, veinlets: 4,
    veinWeight: 0.006, midribWeight: 0.012,
    petioleLength: 0.2, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 5, divergence: 120, internode: 0.4, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 55, tipInsertion: 40, sizeGradient: 0.25, stemWidth: 0.011, stemTaper: 0.45,
    stemCurve: 0.2, stemDroop: 0, zigzag: 10, stemTexture: 0.3, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.1, budSize: 0.1, leafVariety: 0.25,
    paper: '#f9efef', leafWash: '#4c7a3a', leafShade: '#203f22',
    stemWash: '#6a4a40', budColour: '#6a3a4a', budShade: '#2a1420',
  }),
  // Ash (Fraxinus excelsior): pinnate, eleven finely toothed lanceolate leaflets, in
  // opposite pairs that turn 90° at each node on a smooth, stout grey twig, ending in the
  // famous black bud. Fresh yellow-green on lilac paper.
  Ash: species({
    compound: 'Pinnate', leaflets: 11, leafletAngle: 62,
    outline: 'Lanceolate', width: 1.15, base: 'Cuneate', apex: 'Acuminate', bend: 0.08, sCurve: 0.06,
    lobing: 'Unlobed',
    margin: 'Serrate', teeth: 18, toothDepth: 0.009,
    venation: 'Pinnate', veinCount: 9, veinAngle: 55, veinCurve: 0.35, veinlets: 3,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.15, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Opposite', decussate: true, nodes: 3, internode: 0.45, internodeTaper: 0.2, bareStem: 0.35,
    insertion: 50, tipInsertion: 32, sizeGradient: 0.15, stemWidth: 0.012, stemTaper: 0.3,
    stemCurve: 0.15, stemDroop: 0, zigzag: 0, stemTexture: 0.15, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Scaled', budStem: 0.03, budSize: 0.055, leafVariety: 0.2,
    paper: '#f4eff8', leafWash: '#98bc62', leafShade: '#3f6336',
    stemWash: '#8e9183', budColour: '#211f1c', budShade: '#080808',
  }),
  // Aspen (Populus tremula): nearly round with big blunt teeth, on a long stalk flattened
  // sideways (which is why it trembles). In autumn colour: gold washing to scarlet on the
  // shaded half, pale yellow stalks, on pale cream paper.
  Aspen: species({
    compound: 'Simple',
    outline: 'Orbicular', width: 1.1, base: 'Truncate', apex: 'Acute', bend: 0.05, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Crenate', teeth: 14, toothDepth: 0.02,
    venation: 'Pinnate', veinCount: 5, veinAngle: 50, veinCurve: 0.4, veinlets: 5,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.7, petioleFlat: 0.25, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 5, divergence: 144, internode: 0.45, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 60, tipInsertion: 40, sizeGradient: 0.2, stemWidth: 0.011, stemTaper: 0.45,
    stemCurve: 0.2, stemDroop: 0, zigzag: 8, stemTexture: 0.25, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.07, leafVariety: 0.25,
    paper: '#faf2e4', leafWash: '#f2a52c', leafShade: '#d4402a',
    stemWash: '#d8b04a', budColour: '#8a5a2a', budShade: '#3a200c',
  }),
  // Beech (Fagus sylvatica): a neat oval with a wavy, silky-fringed edge and seven or eight
  // dead-straight parallel veins; two-ranked on a slender zigzag twig, ending in the long,
  // cigar-shaped copper bud. In autumn copper: russet washing to deep rust, on pale blue-grey paper.
  Beech: species({
    compound: 'Simple',
    outline: 'Elliptic', width: 0.95, base: 'Rounded', apex: 'Acute', bend: 0.1, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Wavy', teeth: 8, toothDepth: 0.012,
    venation: 'Pinnate', veinCount: 8, veinAngle: 42, veinCurve: 0.05, veinlets: 3,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.08, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 9, divergence: 180, internode: 0.36, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 58, tipInsertion: 38, sizeGradient: 0.2, stemWidth: 0.01, stemTaper: 0.5,
    stemCurve: 0.15, stemDroop: 0.05, zigzag: 18, stemTexture: 0.2, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.22, leafVariety: 0.25,
    paper: '#ecf2f6', leafWash: '#c8783a', leafShade: '#8a4220',
    stemWash: '#6b4a3a', budColour: '#a8683a', budShade: '#4a2a16',
  }),
  // Box (Buxus sempervirens): tiny, glossy ovals with a dented tip, packed in opposite pairs
  // along a green twig. Dark glossy green on blush paper.
  Box: species({
    compound: 'Simple',
    outline: 'Elliptic', width: 0.8, base: 'Rounded', apex: 'Notched', bend: 0.05, sCurve: 0.02,
    lobing: 'Unlobed',
    margin: 'Entire',
    venation: 'Pinnate', veinCount: 8, veinAngle: 45, veinCurve: 0.2, veinlets: 1,
    veinWeight: 0.002, midribWeight: 0.012,
    petioleLength: 0.02, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Opposite', decussate: false, nodes: 8, internode: 1.1, internodeTaper: 0.2, bareStem: 0.3,
    insertion: 70, tipInsertion: 55, sizeGradient: 0.1, stemWidth: 0.007, stemTaper: 0.45,
    stemCurve: 0.15, stemDroop: 0, zigzag: 0, stemTexture: 0.1, stemShading: 0.3, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.02, budSize: 0.03, leafVariety: 0.15,
    paper: '#f8eef2', leafWash: '#3e6a34', leafShade: '#18301a',
    stemWash: '#7a8a4a', budColour: '#6a7a3a', budShade: '#2a3018',
  }),
  // Wild cherry (Prunus avium): drooping, broadest above the middle, toothed, drawn out to a
  // point on a long stalk; leaves crowded on short spurs of glossy red-brown bark round a
  // cluster of shiny buds. In autumn: orange-scarlet washing to crimson, on pale celadon paper.
  Cherry: species({
    compound: 'Simple',
    outline: 'Obovate', width: 0.9, base: 'Rounded', apex: 'Acuminate', bend: 0.15, sCurve: 0.1,
    lobing: 'Unlobed',
    margin: 'Serrate', teeth: 30, toothDepth: 0.015,
    venation: 'Pinnate', veinCount: 10, veinAngle: 45, veinCurve: 0.3, veinlets: 4,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.3, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 3, divergence: 144, internode: 0.2, internodeTaper: 0.3, bareStem: 0.45,
    insertion: 50, tipInsertion: 35, sizeGradient: 0.1, stemWidth: 0.016, stemTaper: 0.35,
    stemCurve: 0.15, stemDroop: 0, zigzag: 5, stemTexture: 0.3, stemShading: 0.4, stemFade: 0.2,
    terminal: 'Bud', budType: 'Cluster', budStem: 0.03, budSize: 0.08, leafVariety: 0.25,
    paper: '#ecf5ef', leafWash: '#e0602e', leafShade: '#9e1f2e',
    stemWash: '#7a3a32', budColour: '#8a3a28', budShade: '#36120a',
  }),
  // Dogwood (Cornus sanguinea): smooth ovals whose few veins arch round to meet at the tip, in
  // opposite pairs on a blood-red twig. Mid-green on pale celadon paper, to set off the red.
  Dogwood: species({
    compound: 'Simple',
    outline: 'Ovate', width: 0.9, base: 'Rounded', apex: 'Acuminate', bend: 0.1, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Entire',
    venation: 'Arcuate', veinCount: 4, veinAngle: 30, veinCurve: 0.8, veinlets: 3,
    veinWeight: 0.006, midribWeight: 0.012,
    petioleLength: 0.15, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Opposite', decussate: true, nodes: 4, internode: 0.4, internodeTaper: 0.3, bareStem: 0.35,
    insertion: 50, tipInsertion: 35, sizeGradient: 0.2, stemWidth: 0.011, stemTaper: 0.45,
    stemCurve: 0.1, stemDroop: 0, zigzag: 0, stemTexture: 0.1, stemShading: 0.4, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.05, leafVariety: 0.2,
    paper: '#eef5f0', leafWash: '#6a9448', leafShade: '#2c4a2a',
    stemWash: '#9a2a24', budColour: '#8a3a2a', budShade: '#3a1208',
  }),
  // Elder (Sambucus nigra): five or seven pointed, toothed leaflets, in opposite pairs on a
  // stout grey twig rough with corky warts; purplish scaled bud. Deep green on rose paper.
  Elder: species({
    compound: 'Pinnate', leaflets: 7, leafletAngle: 60,
    outline: 'Elliptic', width: 0.75, base: 'Cuneate', apex: 'Acuminate', bend: 0.08, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Serrate', teeth: 30, toothDepth: 0.01,
    venation: 'Pinnate', veinCount: 8, veinAngle: 50, veinCurve: 0.35, veinlets: 3,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.15, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Opposite', decussate: true, nodes: 3, internode: 0.45, internodeTaper: 0.2, bareStem: 0.3,
    insertion: 50, tipInsertion: 35, sizeGradient: 0.15, stemWidth: 0.018, stemTaper: 0.3,
    stemCurve: 0.1, stemDroop: 0, zigzag: 0, stemTexture: 0.7, stemShading: 0.4, stemFade: 0.2,
    terminal: 'Bud', budType: 'Scaled', budStem: 0.03, budSize: 0.07, leafVariety: 0.2,
    paper: '#f8eef3', leafWash: '#5a8a40', leafShade: '#24461f',
    stemWash: '#8a8070', budColour: '#6a3a4a', budShade: '#2a1420',
  }),
  // Elm (Ulmus): the lopsided base is the giveaway; doubly toothed, a dozen or more straight
  // parallel veins running out into the teeth, on a very short stalk; two-ranked on a
  // zigzag, reddish-brown twig ending in a small dark pointed bud. Dark green on rose paper.
  Elm: species({
    compound: 'Simple',
    outline: 'Elliptic', width: 1.05, base: 'Asymmetric', apex: 'Acuminate', bend: 0.18, sCurve: 0.08,
    lobing: 'Unlobed',
    margin: 'Doubly serrate', teeth: 24, toothDepth: 0.02,
    venation: 'Pinnate', veinCount: 14, veinAngle: 40, veinCurve: 0.06, veinlets: 3,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.05, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 8, divergence: 180, internode: 0.42, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 62, tipInsertion: 42, sizeGradient: 0.3, stemWidth: 0.011, stemTaper: 0.55,
    stemCurve: 0.2, stemDroop: 0.1, zigzag: 22, stemTexture: 0.25, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.04, budSize: 0.05, leafVariety: 0.25,
    paper: '#f8eff5', leafWash: '#688d53', leafShade: '#24422e',
    stemWash: '#654334', budColour: '#462920', budShade: '#190d0b',
  }),
  // Blue gum (Eucalyptus globulus), grown-up leaves: long, sickle-curved and leathery, hanging
  // from a reddish twig, with one vein just inside the edge. Blue-grey on pale apricot paper.
  Eucalyptus: species({
    compound: 'Simple',
    outline: 'Lanceolate', width: 0.55, base: 'Cuneate', apex: 'Acuminate', bend: 0.8, sCurve: -0.2,
    lobing: 'Unlobed',
    margin: 'Entire',
    venation: 'Pinnate', veinCount: 18, veinAngle: 70, veinCurve: 0, veinlets: 1,
    veinWeight: 0.003, midribWeight: 0.012,
    petioleLength: 0.2, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 8, divergence: 144, internode: 0.4, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 25, tipInsertion: 15, sizeGradient: 0.2, stemWidth: 0.008, stemTaper: 0.45,
    stemCurve: 0.3, stemDroop: 0.8, zigzag: 5, stemTexture: 0.1, stemShading: 0.3, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.03, leafVariety: 0.25,
    paper: '#fbefe6', leafWash: '#8aa5a0', leafShade: '#3f5f60',
    stemWash: '#a0704a', budColour: '#8a9a8a', budShade: '#3a4a40',
  }),
  // Field maple (Acer campestre): small, with five rounded blunt lobes and no teeth, in
  // opposite pairs on a corky twig. In autumn butter-yellow, deepening to amber, on pale lavender paper.
  'Field maple': species({
    compound: 'Simple',
    outline: 'Orbicular', width: 1.1, base: 'Cordate', apex: 'Obtuse', bend: 0.05, sCurve: 0.05,
    lobing: 'Palmately lobed', lobeDepth: 0.55, lobes: 5, lobeSharpness: 0.1,
    margin: 'Entire',
    venation: 'Palmate', veinCount: 5, veinAngle: 45, veinCurve: 0.2, veinlets: 4,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.5, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Opposite', decussate: true, nodes: 4, internode: 0.5, internodeTaper: 0.3, bareStem: 0.35,
    insertion: 55, tipInsertion: 40, sizeGradient: 0.2, stemWidth: 0.02, stemTaper: 0.4,
    stemCurve: 0.1, stemDroop: 0, zigzag: 0, stemTexture: 0.7, stemShading: 0.4, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.05, leafVariety: 0.25,
    paper: '#eeeefa', leafWash: '#e8c23a', leafShade: '#d4902c',
    stemWash: '#8a6a40', budColour: '#6a4a30', budShade: '#2a1a0e',
  }),
  // Hazel (Corylus avellana): almost round, soft and hairy, heart-shaped at the base with a
  // short sudden point, doubly toothed; zigzag twig, plump green-brown bud. Mid-green on
  // blush paper.
  Hazel: species({
    compound: 'Simple',
    outline: 'Orbicular', width: 1, base: 'Cordate', apex: 'Acuminate', bend: 0.1, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Doubly serrate', teeth: 20, toothDepth: 0.025,
    venation: 'Pinnate', veinCount: 7, veinAngle: 48, veinCurve: 0.2, veinlets: 5,
    veinWeight: 0.006, midribWeight: 0.012,
    petioleLength: 0.12, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 6, divergence: 180, internode: 0.55, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 65, tipInsertion: 45, sizeGradient: 0.25, stemWidth: 0.01, stemTaper: 0.5,
    stemCurve: 0.2, stemDroop: 0.05, zigzag: 28, stemTexture: 0.3, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Plump', budStem: 0.03, budSize: 0.07, leafVariety: 0.3,
    paper: '#f8eff3', leafWash: '#6b9a4c', leafShade: '#2f5530',
    stemWash: '#8a6a4a', budColour: '#6e7a3a', budShade: '#2e3418',
  }),
  // Holly (Ilex aquifolium): thick, glossy and wavy, its edge running out into sharp spines;
  // short-stalked on a green twig. Near-black green on pale blush paper.
  Holly: species({
    compound: 'Simple',
    outline: 'Elliptic', width: 0.85, base: 'Rounded', apex: 'Acute', bend: 0.1, sCurve: 0.2,
    lobing: 'Unlobed',
    margin: 'Spiny', teeth: 35, toothDepth: 0.025,
    venation: 'Pinnate', veinCount: 7, veinAngle: 50, veinCurve: 0.4, veinlets: 2,
    veinWeight: 0.004, midribWeight: 0.016,
    petioleLength: 0.08, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 6, divergence: 144, internode: 0.42, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 55, tipInsertion: 40, sizeGradient: 0.2, stemWidth: 0.012, stemTaper: 0.45,
    stemCurve: 0.15, stemDroop: 0, zigzag: 6, stemTexture: 0.1, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.04, leafVariety: 0.25,
    paper: '#faeef0', leafWash: '#2f5a32', leafShade: '#122a18',
    stemWash: '#4a6a3a', budColour: '#4a6a3a', budShade: '#1a2a14',
  }),
  // Horse chestnut (Aesculus hippocastanum): a hand of seven big leaflets, broadest near their
  // tips and doubly toothed, on a long stalk; opposite pairs on a stout twig ending in the huge,
  // sticky, glossy dark red-brown bud. Deep green on rose paper.
  'Horse chestnut': species({
    compound: 'Palmate', leaflets: 7, leafletAngle: 55,
    outline: 'Obovate', width: 0.9, base: 'Cuneate', apex: 'Acuminate', bend: 0.05, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Doubly serrate', teeth: 30, toothDepth: 0.012,
    venation: 'Pinnate', veinCount: 18, veinAngle: 45, veinCurve: 0.1, veinlets: 2,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.7, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Opposite', decussate: true, nodes: 3, internode: 0.9, internodeTaper: 0.2, bareStem: 0.3,
    insertion: 35, tipInsertion: 25, sizeGradient: 0.1, stemWidth: 0.025, stemTaper: 0.3,
    stemCurve: 0.1, stemDroop: 0, zigzag: 0, stemTexture: 0.3, stemShading: 0.4, stemFade: 0.2,
    terminal: 'Bud', budType: 'Scaled', budStem: 0.02, budSize: 0.2, leafVariety: 0.15,
    paper: '#f8eef4', leafWash: '#4f8040', leafShade: '#1e3e22',
    stemWash: '#8a6a4a', budColour: '#6a2a1a', budShade: '#2a0c06',
  }),
  // Laburnum (Laburnum anagyroides): three smooth oval leaflets on a long stalk, crowded on
  // short spurs of a green-grey twig; silky silver bud. Grey-green on pale peach paper.
  Laburnum: species({
    compound: 'Trifoliate', leafletAngle: 50,
    outline: 'Elliptic', width: 0.9, base: 'Cuneate', apex: 'Acute', bend: 0.05, sCurve: 0.02,
    lobing: 'Unlobed',
    margin: 'Entire',
    venation: 'Pinnate', veinCount: 6, veinAngle: 50, veinCurve: 0.3, veinlets: 3,
    veinWeight: 0.004, midribWeight: 0.011,
    petioleLength: 0.5, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 4, divergence: 144, internode: 0.4, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 50, tipInsertion: 35, sizeGradient: 0.15, stemWidth: 0.011, stemTaper: 0.4,
    stemCurve: 0.15, stemDroop: 0.05, zigzag: 8, stemTexture: 0.15, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.06, leafVariety: 0.2,
    paper: '#faefe9', leafWash: '#7a9a60', leafShade: '#3a5434',
    stemWash: '#6a8a5a', budColour: '#9a9a8a', budShade: '#3a3a30',
  }),
  // Lime (Tilia × europaea): heart-shaped and lopsided, finely toothed, drawn to a point, on a
  // longish stalk; a zigzag red twig with fat, shiny red buds. Fresh green on lilac paper.
  Lime: species({
    compound: 'Simple',
    outline: 'Cordate', width: 1, base: 'Cordate', apex: 'Acuminate', bend: 0.1, sCurve: 0.1,
    lobing: 'Unlobed',
    margin: 'Serrate', teeth: 30, toothDepth: 0.012,
    venation: 'Pinnate', veinCount: 7, veinAngle: 45, veinCurve: 0.3, veinlets: 6,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.4, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 7, divergence: 180, internode: 0.42, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 60, tipInsertion: 40, sizeGradient: 0.25, stemWidth: 0.011, stemTaper: 0.45,
    stemCurve: 0.2, stemDroop: 0.05, zigzag: 30, stemTexture: 0.15, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Plump', budStem: 0.03, budSize: 0.07, leafVariety: 0.25,
    paper: '#f4eff9', leafWash: '#7aa04e', leafShade: '#355a2c',
    stemWash: '#7a3a2a', budColour: '#b0402a', budShade: '#4a1208',
  }),
  // Magnolia (Magnolia × soulangeana): big, smooth and broadest near the tip, crowded at the
  // end of a stout twig behind a huge bud in grey fur. Mid-green on lavender paper.
  Magnolia: species({
    compound: 'Simple',
    outline: 'Obovate', width: 0.9, base: 'Cuneate', apex: 'Acute', bend: 0.1, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Entire',
    venation: 'Pinnate', veinCount: 9, veinAngle: 50, veinCurve: 0.5, veinlets: 5,
    veinWeight: 0.005, midribWeight: 0.013,
    petioleLength: 0.12, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 3, divergence: 144, internode: 0.2, internodeTaper: 0.3, bareStem: 0.45,
    insertion: 45, tipInsertion: 30, sizeGradient: 0.1, stemWidth: 0.018, stemTaper: 0.35,
    stemCurve: 0.15, stemDroop: 0, zigzag: 5, stemTexture: 0.3, stemShading: 0.4, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.02, budSize: 0.32, leafVariety: 0.2,
    paper: '#f3eff9', leafWash: '#5f8a48', leafShade: '#2a4a2a',
    stemWash: '#6a5a48', budColour: '#8a8470', budShade: '#3a3628',
  }),
  // Norway maple (Acer platanoides): broad, five lobes drawn out into a few long fine points,
  // on a long stalk, in opposite pairs; red-brown scaled bud. Bright green on rose paper.
  'Norway maple': species({
    compound: 'Simple',
    outline: 'Orbicular', width: 1.2, base: 'Cordate', apex: 'Acuminate', bend: 0.05, sCurve: 0.05,
    lobing: 'Palmately lobed', lobeDepth: 0.4, lobes: 5, lobeSharpness: 0.95,
    margin: 'Dentate', teeth: 6, toothDepth: 0.05,
    venation: 'Palmate', veinCount: 6, veinAngle: 45, veinCurve: 0.2, veinlets: 5,
    veinWeight: 0.006, midribWeight: 0.013,
    petioleLength: 0.7, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Opposite', decussate: true, nodes: 3, internode: 0.8, internodeTaper: 0.3, bareStem: 0.4,
    insertion: 55, tipInsertion: 40, sizeGradient: 0.2, stemWidth: 0.015, stemTaper: 0.4,
    stemCurve: 0.1, stemDroop: 0, zigzag: 0, stemTexture: 0.2, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Scaled', budStem: 0.03, budSize: 0.09, leafVariety: 0.2,
    paper: '#f9eef4', leafWash: '#5e9446', leafShade: '#24502a',
    stemWash: '#7a5a40', budColour: '#9a3a2a', budShade: '#3a120a',
  }),
  // English oak (Quercus robur): obovate, four or five pairs of round lobes, two little
  // ears at the base and almost no stalk; leaves bunched at the shoot tip around a cluster of
  // pale brown buds, on a stout olive-brown twig. Olive green on pale mint paper.
  Oak: species({
    compound: 'Simple',
    outline: 'Obovate', width: 0.9, base: 'Cordate', apex: 'Rounded', bend: 0.12, sCurve: 0.15,
    lobing: 'Pinnately lobed', lobeDepth: 0.62, lobes: 5, lobeSharpness: 0.7,
    margin: 'Entire',
    venation: 'Pinnate', veinCount: 5, veinAngle: 50, veinCurve: 0.25, veinlets: 4,
    veinWeight: 0.006, midribWeight: 0.014,
    petioleLength: 0.04, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 4, divergence: 160, internode: 0.28, internodeTaper: 0.55, bareStem: 0.4,
    insertion: 72, tipInsertion: 42, sizeGradient: 0.05, stemWidth: 0.02, stemTaper: 0.35,
    stemCurve: 0.25, stemDroop: 0, zigzag: 8, stemTexture: 0.45, stemShading: 0.4, stemFade: 0.25,
    terminal: 'Bud', budType: 'Cluster', budStem: 0.03, budSize: 0.09, leafVariety: 0.4,
    paper: '#e8f7ec', leafWash: '#8ba451', leafShade: '#37512a',
    stemWash: '#7e684e', budColour: '#975f35', budShade: '#3d2314',
  }),
  // London plane (Platanus × hispanica): big, five sharp lobes and a few large teeth on a long
  // stalk, alternate (which tells it from a maple); pale olive twig, cone-shaped bud. Mid-green
  // on pale violet paper.
  Plane: species({
    compound: 'Simple',
    outline: 'Orbicular', width: 1.25, base: 'Truncate', apex: 'Acuminate', bend: 0.05, sCurve: 0.05,
    lobing: 'Palmately lobed', lobeDepth: 0.45, lobes: 5, lobeSharpness: 0.9,
    margin: 'Dentate', teeth: 8, toothDepth: 0.03,
    venation: 'Palmate', veinCount: 6, veinAngle: 45, veinCurve: 0.2, veinlets: 5,
    veinWeight: 0.006, midribWeight: 0.013,
    petioleLength: 0.55, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 4, divergence: 180, internode: 0.55, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 60, tipInsertion: 40, sizeGradient: 0.25, stemWidth: 0.013, stemTaper: 0.45,
    stemCurve: 0.2, stemDroop: 0, zigzag: 20, stemTexture: 0.2, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.08, leafVariety: 0.25,
    paper: '#f4eef9', leafWash: '#6c9446', leafShade: '#2e5028',
    stemWash: '#8a7a5a', budColour: '#7a5a3a', budShade: '#2e1e10',
  }),
  // False acacia (Robinia pseudoacacia): up to fifteen small, smooth oval leaflets, dented at
  // the tip, with a pair of spines (stipules) at each node of a zigzag twig; the buds hide
  // under the leaf scars. Bright yellow-green on pale violet paper.
  Robinia: species({
    compound: 'Pinnate', leaflets: 15, leafletAngle: 70,
    outline: 'Elliptic', width: 1.1, base: 'Rounded', apex: 'Notched', bend: 0.05, sCurve: 0.02,
    lobing: 'Unlobed',
    margin: 'Entire',
    venation: 'Pinnate', veinCount: 6, veinAngle: 50, veinCurve: 0.3, veinlets: 2,
    veinWeight: 0.003, midribWeight: 0.01,
    petioleLength: 0.1, petioleFlat: 0, petioleWing: 0, stipules: 0.5,
    arrangement: 'Alternate', nodes: 5, divergence: 180, internode: 0.3, internodeTaper: 0.2, bareStem: 0.3,
    insertion: 50, tipInsertion: 35, sizeGradient: 0.1, stemWidth: 0.012, stemTaper: 0.35,
    stemCurve: 0.15, stemDroop: 0, zigzag: 20, stemTexture: 0.25, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bare', budType: 'Pointed', budStem: 0.03, budSize: 0.05, leafVariety: 0.2,
    paper: '#f3eef9', leafWash: '#88aa50', leafShade: '#3d5e2a',
    stemWash: '#6a5a48', budColour: '#6a5a48', budShade: '#2a2018',
  }),
  // Rowan (Sorbus aucuparia): a long pinnate leaf of up to fifteen narrow, toothed leaflets,
  // alternate on a grey-purple twig with a dark, hairy, purple bud. Fresh green on lilac paper.
  Rowan: species({
    compound: 'Pinnate', leaflets: 15, leafletAngle: 75,
    outline: 'Lanceolate', width: 0.7, base: 'Rounded', apex: 'Acute', bend: 0.08, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Serrate', teeth: 16, toothDepth: 0.015,
    venation: 'Pinnate', veinCount: 9, veinAngle: 50, veinCurve: 0.3, veinlets: 2,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.12, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 5, divergence: 144, internode: 0.3, internodeTaper: 0.2, bareStem: 0.35,
    insertion: 45, tipInsertion: 35, sizeGradient: 0.1, stemWidth: 0.013, stemTaper: 0.35,
    stemCurve: 0.15, stemDroop: 0, zigzag: 5, stemTexture: 0.2, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.08, leafVariety: 0.2,
    paper: '#f2eff9', leafWash: '#6a9a4a', leafShade: '#2a502c',
    stemWash: '#6a5048', budColour: '#5a3a4a', budShade: '#24141e',
  }),
  // Silver birch (Betula pendula): small, triangular and doubly toothed on long thin stalks,
  // hanging from fine dark red-brown twigs that droop at the tips. Bright yellow-green on
  // pale periwinkle paper.
  'Silver birch': species({
    compound: 'Simple',
    outline: 'Ovate', width: 1.15, base: 'Truncate', apex: 'Acuminate', bend: 0.1, sCurve: 0.1,
    lobing: 'Unlobed',
    margin: 'Doubly serrate', teeth: 16, toothDepth: 0.03,
    venation: 'Pinnate', veinCount: 7, veinAngle: 45, veinCurve: 0.1, veinlets: 3,
    veinWeight: 0.004, midribWeight: 0.01,
    petioleLength: 0.4, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 10, divergence: 180, internode: 0.5, internodeTaper: 0.4, bareStem: 0.2,
    insertion: 55, tipInsertion: 35, sizeGradient: 0.35, stemWidth: 0.006, stemTaper: 0.6,
    stemCurve: 0.4, stemDroop: 0.6, zigzag: 15, stemTexture: 0.15, stemShading: 0.3, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.03, budSize: 0.06, leafVariety: 0.25,
    paper: '#eff0f9', leafWash: '#8bab4a', leafShade: '#3d5e2a',
    stemWash: '#5a3a30', budColour: '#4f3628', budShade: '#1f140e',
  }),
  // Sweet chestnut (Castanea sativa): long, narrow and glossy, every one of its many straight
  // veins ending in a bristle-tipped tooth; spiralled round a stout olive twig, plump red bud.
  // Dark green on lavender paper.
  'Sweet chestnut': species({
    compound: 'Simple',
    outline: 'Lanceolate', width: 0.8, base: 'Rounded', apex: 'Acuminate', bend: 0.1, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Serrate', teeth: 18, toothDepth: 0.03,
    venation: 'Pinnate', veinCount: 17, veinAngle: 45, veinCurve: 0.02, veinlets: 2,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.1, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 6, divergence: 144, internode: 0.3, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 55, tipInsertion: 35, sizeGradient: 0.2, stemWidth: 0.014, stemTaper: 0.45,
    stemCurve: 0.2, stemDroop: 0.05, zigzag: 10, stemTexture: 0.35, stemShading: 0.4, stemFade: 0.2,
    terminal: 'Bud', budType: 'Plump', budStem: 0.03, budSize: 0.07, leafVariety: 0.2,
    paper: '#f2eef8', leafWash: '#5c8a3c', leafShade: '#27471f',
    stemWash: '#7a5a3c', budColour: '#8c3f2a', budShade: '#3a160e',
  }),
  // Sycamore (Acer pseudoplatanus): five-lobed with coarse rounded teeth, on a long red stalk,
  // in opposite pairs that turn at each node; big green scaled bud. Dark green on rose paper.
  Sycamore: species({
    compound: 'Simple',
    outline: 'Orbicular', width: 1.1, base: 'Cordate', apex: 'Acute', bend: 0.05, sCurve: 0.05,
    lobing: 'Palmately lobed', lobeDepth: 0.45, lobes: 5, lobeSharpness: 0.55,
    margin: 'Crenate', teeth: 26, toothDepth: 0.02,
    venation: 'Palmate', veinCount: 6, veinAngle: 45, veinCurve: 0.2, veinlets: 5,
    veinWeight: 0.006, midribWeight: 0.013,
    petioleLength: 0.8, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Opposite', decussate: true, nodes: 3, internode: 0.8, internodeTaper: 0.3, bareStem: 0.4,
    insertion: 55, tipInsertion: 40, sizeGradient: 0.2, stemWidth: 0.016, stemTaper: 0.4,
    stemCurve: 0.1, stemDroop: 0, zigzag: 0, stemTexture: 0.2, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Scaled', budStem: 0.03, budSize: 0.1, leafVariety: 0.2,
    paper: '#f8eef3', leafWash: '#5a8642', leafShade: '#24462a',
    stemWash: '#9a5040', budColour: '#7a9a50', budShade: '#2e4020',
  }),
  // Walnut (Juglans regia): seven to nine big, smooth, oval leaflets, the end one largest;
  // alternate on a thick olive twig with a squat black velvet bud. Mid-green on lavender paper.
  Walnut: species({
    compound: 'Pinnate', leaflets: 7, leafletAngle: 50,
    outline: 'Elliptic', width: 0.9, base: 'Rounded', apex: 'Acute', bend: 0.08, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Entire',
    venation: 'Pinnate', veinCount: 12, veinAngle: 50, veinCurve: 0.2, veinlets: 3,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.2, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 5, divergence: 144, internode: 0.3, internodeTaper: 0.2, bareStem: 0.3,
    insertion: 50, tipInsertion: 35, sizeGradient: 0.1, stemWidth: 0.02, stemTaper: 0.3,
    stemCurve: 0.1, stemDroop: 0, zigzag: 5, stemTexture: 0.3, stemShading: 0.4, stemFade: 0.2,
    terminal: 'Bud', budType: 'Plump', budStem: 0.03, budSize: 0.08, leafVariety: 0.2,
    paper: '#f3eff9', leafWash: '#6a8e44', leafShade: '#2c4a26',
    stemWash: '#7a6a50', budColour: '#2a2420', budShade: '#0a0806',
  }),
  // Whitebeam (Sorbus aria): oval and doubly toothed with straight veins, dark above and
  // white-felted beneath, so the shaded half is silver; plump green bud. On pale peach paper.
  Whitebeam: species({
    compound: 'Simple',
    outline: 'Elliptic', width: 1, base: 'Cuneate', apex: 'Obtuse', bend: 0.1, sCurve: 0.05,
    lobing: 'Unlobed',
    margin: 'Doubly serrate', teeth: 26, toothDepth: 0.012,
    venation: 'Pinnate', veinCount: 10, veinAngle: 40, veinCurve: 0.05, veinlets: 3,
    veinWeight: 0.005, midribWeight: 0.012,
    petioleLength: 0.18, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 5, divergence: 144, internode: 0.35, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 55, tipInsertion: 38, sizeGradient: 0.2, stemWidth: 0.012, stemTaper: 0.45,
    stemCurve: 0.2, stemDroop: 0, zigzag: 8, stemTexture: 0.25, stemShading: 0.35, stemFade: 0.2,
    terminal: 'Bud', budType: 'Plump', budStem: 0.03, budSize: 0.1, leafVariety: 0.2,
    paper: '#f9efeb', leafWash: '#6f8c55', leafShade: '#b8c4b0',
    stemWash: '#7a6a5a', budColour: '#7a9a4a', budShade: '#2e4020',
  }),
  // White willow (Salix alba): long, narrow and finely toothed, silvery with silky hairs,
  // pressed up along a slim golden twig that droops. Silver-green on pale apricot paper.
  Willow: species({
    compound: 'Simple',
    outline: 'Lanceolate', width: 0.55, base: 'Cuneate', apex: 'Acuminate', bend: 0.25, sCurve: 0.1,
    lobing: 'Unlobed',
    margin: 'Serrate', teeth: 40, toothDepth: 0.005,
    venation: 'Pinnate', veinCount: 16, veinAngle: 40, veinCurve: 0.35, veinlets: 2,
    veinWeight: 0.003, midribWeight: 0.01,
    petioleLength: 0.06, petioleFlat: 0, petioleWing: 0, stipules: 0,
    arrangement: 'Alternate', nodes: 10, divergence: 144, internode: 0.25, internodeTaper: 0.3, bareStem: 0.3,
    insertion: 30, tipInsertion: 20, sizeGradient: 0.3, stemWidth: 0.007, stemTaper: 0.5,
    stemCurve: 0.3, stemDroop: 0.5, zigzag: 5, stemTexture: 0.2, stemShading: 0.3, stemFade: 0.2,
    terminal: 'Bud', budType: 'Pointed', budStem: 0.02, budSize: 0.04, leafVariety: 0.25,
    paper: '#faf0e8', leafWash: '#8ea07a', leafShade: '#47604a',
    stemWash: '#9a7a3a', budColour: '#8a6a3a', budShade: '#3a2a14',
  }),
};
