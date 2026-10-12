// Constellations — drifting stars joined by fading lines when they pass close (Canvas 2D).
//
// Each star circles its own start point; the orbit radius is Orbit size divided by a random
// factor in [−0.5, 1.5], so factors near zero make a few stars sweep across the whole sky
// while the rest barely move. Every pair closer than Link distance gets a line: a wide dim
// glow plus a bright core, both fading with distance, in a hue that cycles slowly.
//
// Lines are batched: pairs are sorted into opacity buckets, and each bucket is one path and
// one stroke, instead of two strokes per pair. Star state lives in typed arrays and colour
// strings are cached, so a frame allocates nothing.

import { rng } from '../../kit/random.js';

const MAX_STARS = 400;
const BUCKETS = 12;
const TAU = Math.PI * 2;

/** HSV (h in degrees, s and v 0–1) → '#rrggbb'. */
function hsv(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return '#' + ((1 << 24) | (f(5) << 16) | (f(3) << 8) | f(1)).toString(16).slice(1);
}

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');

  const sx = new Float32Array(MAX_STARS), sy = new Float32Array(MAX_STARS); // start, 0–1 of the sky
  const orbit = new Float32Array(MAX_STARS); // 1 / random factor
  const size = new Float32Array(MAX_STARS); // 0–1 between min and max size
  const phase = new Float32Array(MAX_STARS), rate = new Float32Array(MAX_STARS); // twinkle
  const kind = new Uint8Array(MAX_STARS); // 0 blue-white, 1 white, 2 warm, 3 orange
  const x = new Float32Array(MAX_STARS), y = new Float32Array(MAX_STARS);
  // Pairs to join, per opacity bucket: star indices packed as a * MAX_STARS + b.
  const pairs = new Uint32Array(BUCKETS * (MAX_STARS * (MAX_STARS - 1)) / 2 / 4);
  const perBucket = Math.floor(pairs.length / BUCKETS);
  const fill = new Uint32Array(BUCKETS);
  const glowCache = new Array(361).fill(''), coreCache = new Array(361).fill('');
  const kinds = ['blueWhite', 'white', 'warm', 'orange'];

  let builtSeed = NaN;
  function buildIfNeeded() {
    if (P.seed.value === builtSeed) return;
    builtSeed = P.seed.value;
    const rand = rng(P.seed.value);
    for (let i = 0; i < MAX_STARS; i++) {
      sx[i] = rand();
      sy[i] = rand();
      orbit[i] = 1 / (2 * rand() - 0.5);
      size[i] = rand();
      phase[i] = rand() * TAU;
      rate[i] = (0.02 + rand() * 0.06) * 60; // the original's per-frame rates, at 60fps
      const roll = rand();
      kind[i] = roll < 0.55 ? 0 : roll < 0.8 ? 1 : roll < 0.93 ? 2 : 3;
    }
  }

  let w = 1, h = 1, px = 1;
  return {
    resize(width, height, pxRatio) { w = width; h = height; px = pxRatio; },
    frame(t, _dt, rt) {
      buildIfNeeded();
      const W = w / px, H = h / px; // sky size in CSS px; everything below is in CSS px
      const n = Math.min(P.count.value, MAX_STARS);
      const link = P.linkDistance.value, link2 = link * link;
      const drift = t * P.drift.value, wander = P.wander.value;
      const sin = Math.sin(drift), cos = Math.cos(drift);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.background.value;
      ctx.fillRect(0, 0, w, h);
      ctx.setTransform(px, 0, 0, px, 0, 0);

      for (let i = 0; i < n; i++) {
        x[i] = sx[i] * W + wander * orbit[i] * sin;
        y[i] = sy[i] * H + wander * orbit[i] * cos;
      }

      // Sort close pairs into buckets by how close they are.
      fill.fill(0);
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          const dx = x[a] - x[b], dy = y[a] - y[b], d2 = dx * dx + dy * dy;
          if (d2 >= link2) continue;
          const bucket = Math.min(BUCKETS - 1, Math.floor((1 - Math.sqrt(d2) / link) * BUCKETS));
          if (fill[bucket] < perBucket) pairs[bucket * perBucket + fill[bucket]++] = a * MAX_STARS + b;
        }
      }

      const hue = Math.round((P.hue.value + P.hueRange.value * (0.5 + 0.5 * Math.sin(t * P.hueSpeed.value))) % 360);
      if (!glowCache[hue]) { glowCache[hue] = hsv(hue, 0.55, 0.95); coreCache[hue] = hsv(hue, 0.35, 1); }
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        const glow = pass === 0;
        const width = glow ? P.glowWidth.value : P.lineWidth.value;
        const opacity = glow ? P.glowOpacity.value : P.lineOpacity.value;
        if (width <= 0 || opacity <= 0) continue;
        ctx.strokeStyle = glow ? glowCache[hue] : coreCache[hue];
        ctx.lineWidth = width;
        for (let k = 0; k < BUCKETS; k++) {
          if (!fill[k]) continue;
          ctx.globalAlpha = opacity * (k + 0.5) / BUCKETS;
          ctx.beginPath();
          for (let j = 0; j < fill[k]; j++) {
            const p = pairs[k * perBucket + j], a = (p / MAX_STARS) | 0, b = p % MAX_STARS;
            ctx.moveTo(x[a], y[a]);
            ctx.lineTo(x[b], y[b]);
          }
          ctx.stroke();
        }
      }

      // Stars, with a soft halo on the bigger ones.
      const minS = P.minSize.value, span = P.maxSize.value - minS, bias = P.sizeBias.value;
      const tw = P.twinkle.value, twSpeed = P.twinkleSpeed.value, glowFrom = P.glowSize.value;
      for (let i = 0; i < n; i++) {
        const diameter = minS + span * Math.pow(size[i], bias);
        const twinkle = (1 - tw) + tw * Math.sin(rt * rate[i] * twSpeed + phase[i]);
        const d = diameter * (0.85 + 0.15 * twinkle);
        ctx.fillStyle = P[kinds[kind[i]]].value;
        if (diameter >= glowFrom) {
          ctx.globalAlpha = 18 / 255;
          ctx.beginPath(); ctx.arc(x[i], y[i], d * 2, 0, TAU); ctx.fill();
          ctx.globalAlpha = 35 / 255;
          ctx.beginPath(); ctx.arc(x[i], y[i], d * 1.1, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = (180 + 75 * twinkle) / 255;
        ctx.beginPath(); ctx.arc(x[i], y[i], d / 2, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
}
