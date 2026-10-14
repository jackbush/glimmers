// Leaf — how long a preset morph should take: a small change (one maple to another) is quick,
// a big one (three leaves to a hundred needles, simple to compound) slow, from a second to
// nine. Measured from what's on screen to the preset.

const MIN = 1, MAX = 9;
// Selects whose change reshapes things (the Finish ones don't count).
const SHAPE_SELECTS = ['compound', 'outline', 'base', 'apex', 'lobing', 'margin', 'venation', 'arrangement', 'fruit', 'fruitForm', 'flower', 'flowerForm'];
// Structures that come or go as a whole (a larch's spurs giving way to a fir's side shoots):
// each switching on or off counts like a select, however little its number moves.
const STRUCTURES = ['spurs', 'sideShoots', 'sheath', 'pegs', 'stipules'];

/** Roughly how many separate blades the sprig shows: leaves (bundles, whorls, rosettes, side shoots) × leaflets. */
export function blades(get) {
  const arr = get('arrangement');
  if (arr === 'No stem') return get('compound') === 'Simple' ? 1 : get('leaflets');
  const per = arr === 'Opposite' ? 2 : arr === 'Whorled' ? get('whorlCount') : get('perNode');
  const leaves = get('nodes') * (per + get('spurs') * get('spurLeaves') / Math.max(1, get('spurEvery'))
    + get('sideShoots') * get('sideNodes') / Math.max(1, get('sideEvery')));
  return leaves * (get('compound') === 'Simple' ? 1 : get('leaflets'));
}

/**
 * Seconds for a morph from the current params P to a preset's `values`: a second, plus time for
 * the change in blade count (each doubling or halving), the selects that switch (and the
 * structures that come or go, at three times a select), and how far the shape numbers move
 * (each as a share of its range).
 */
export function presetSeconds(P, values) {
  const from = (k) => P[k].value, to = (k) => (k in values ? values[k] : P[k].value);
  const dBlades = Math.abs(Math.log2((blades(to) + 1) / (blades(from) + 1)));
  let selects = 0;
  for (const k of SHAPE_SELECTS) if (to(k) !== from(k)) selects++;
  for (const k of STRUCTURES) if ((to(k) > 0) !== (from(k) > 0)) selects += 3;
  if ((to('perNode') > 1) !== (from('perNode') > 1)) selects += 3;
  let numbers = 0;
  for (const k in values) {
    const p = P[k];
    if (!p || p.uniform !== false || p.type === 'select' || p.type === 'color') continue;
    const range = p.type === 'bool' ? 1 : p.max - p.min;
    numbers += Math.abs(Number(to(k)) - Number(from(k))) / range;
  }
  return Math.min(MAX, Math.max(MIN, 1 + 0.6 * dBlades + 0.2 * selects + 0.1 * numbers));
}
