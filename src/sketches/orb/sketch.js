// Orb — translucent layers of an undulating closed curve, sharing a centre (Canvas 2D).
//
// Each layer has N points around a circle, each with its own resting radius and a little
// angular jitter. A point swings between −spread and +spread of its radius, fastest through
// the middle and easing at the ends (the original's "acceleration"), turning back near each
// limit. Smaller points swing faster, so the layers drift in and out of step. The outline
// is a closed Catmull-Rom curve through the points, drawn as Béziers.
//
// Per frame this allocates nothing: point state lives in typed arrays sized for the maximum
// layers × points, and is regenerated only when the seed or a structural param changes.

import { rng } from '../../kit/random.js';

const MAX_LAYERS = 12;
const MAX_POINTS = 12;
const TAU = Math.PI * 2;
const TURN = 0.9; // a point turns back once it's this far (0–1) toward either limit

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P, model }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');

  const n = MAX_LAYERS * MAX_POINTS;
  const scale = new Float32Array(n); // resting radius relative to Size (1 ± jitter)
  const angle = new Float32Array(n);
  const u = new Float32Array(n); // −1..1: where the point is between its limits
  const dir = new Int8Array(n); // +1 growing, −1 shrinking
  const xs = new Float32Array(MAX_POINTS);
  const ys = new Float32Array(MAX_POINTS);

  let bSeed = NaN, bPoints = NaN, bJitter = NaN, bIrregular = NaN;
  function buildIfNeeded() {
    if (P.seed.value === bSeed && P.points.value === bPoints && P.sizeJitter.value === bJitter && P.irregularity.value === bIrregular) return;
    bSeed = P.seed.value; bPoints = P.points.value; bJitter = P.sizeJitter.value; bIrregular = P.irregularity.value;
    const rand = rng(P.seed.value);
    const pts = P.points.value;
    for (let l = 0; l < MAX_LAYERS; l++) {
      for (let i = 0; i < MAX_POINTS; i++) {
        const k = l * MAX_POINTS + i;
        scale[k] = 1 + P.sizeJitter.value * (rand() * 2 - 1);
        angle[k] = -Math.PI / 2 + (i + P.irregularity.value * (rand() - 0.5)) * (TAU / pts);
        u[k] = 0;
        dir[k] = rand() < 0.5 ? 1 : -1;
      }
    }
  }

  let fill = '', fillVersion = -1;
  function syncColour() {
    if (fillVersion === model.version) return;
    fillVersion = model.version;
    const c = P.colour.rgb;
    // Only rebuilt when a param changes, never per frame.
    fill = 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + P.opacity.value + ')';
  }

  let w = 1, h = 1;
  return {
    resize(width, height) { w = width; h = height; },
    frame(_t, dt) {
      buildIfNeeded();
      syncColour();
      const layers = P.layers.value, pts = P.points.value;
      const spread = P.spread.value, speed = P.speed.value * dt;
      const base = P.size.value * Math.min(w, h);
      const cx = w / 2, cy = h / 2;

      ctx.fillStyle = P.background.value;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = fill;

      for (let l = 0; l < layers; l++) {
        const o = l * MAX_POINTS;
        for (let i = 0; i < pts; i++) {
          const k = o + i;
          if (u[k] >= TURN) dir[k] = -1;
          else if (u[k] <= -TURN) dir[k] = 1;
          u[k] += dir[k] * speed * (1 - u[k] * u[k]) / scale[k];
          const r = base * scale[k] * (1 + spread * u[k]);
          xs[i] = cx + r * Math.cos(angle[k]);
          ys[i] = cy + r * Math.sin(angle[k]);
        }
        // Closed Catmull-Rom through the points: segment i→i+1 uses neighbours i−1 and i+2.
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let i = 0; i < pts; i++) {
          const i0 = (i + pts - 1) % pts, i2 = (i + 1) % pts, i3 = (i + 2) % pts;
          ctx.bezierCurveTo(
            xs[i] + (xs[i2] - xs[i0]) / 6, ys[i] + (ys[i2] - ys[i0]) / 6,
            xs[i2] - (xs[i3] - xs[i]) / 6, ys[i2] - (ys[i3] - ys[i]) / 6,
            xs[i2], ys[i2],
          );
        }
        ctx.fill();
      }
    },
  };
}
