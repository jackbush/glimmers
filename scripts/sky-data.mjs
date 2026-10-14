#!/usr/bin/env node
// Builds Atlas Nights' sky data: src/sketches/atlas-nights/sky.js. Needs network and ffmpeg.
//
//   node scripts/sky-data.mjs --photo path/to/IMG_1171.jpg
//
// - Stars: the Yale Bright Star Catalogue, 5th ed. (every star to about magnitude 6.5), J2000
//   positions, V magnitude and B-V colour index. Stars that never rise at the sketch's latitude
//   are left out.
// - Constellation lines: d3-celestial (BSD-3; its notice is copied into sky.js). Each line is a
//   polyline of RA/Dec points, kept in drawing order so a constellation can trace itself in.
// - Ridge: the skyline traced from the reference photo (the user's own, from the Atlas): for
//   each column, how far the dark silhouette reaches up from the bottom, as a fraction of the
//   photo's width, so the sketch can scale it by the angle the photo spans.
//
// Numbers are quantised to uint16 and stored as base64, which keeps the file small; sky.js
// decodes them.

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { cli } from './lib/chrome.mjs';

const { opt } = cli(['--photo']);
const photo = opt('--photo', null);
if (!photo) throw new Error('pass --photo <reference photo> (the ridge is traced from it)');

const LATITUDE = 31.6; // the High Atlas, near Marrakech; the sketch stands here too (sky.js exports it)
const RIDGE_SAMPLES = 512;
const OUT = new URL('../src/sketches/atlas-nights/sky.js', import.meta.url).pathname;

const get = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ': ' + r.status);
  return Buffer.from(await r.arrayBuffer());
};

// ---------------------------------------------------------------- stars
// Fixed-width columns (1-based, inclusive) from the catalogue's ReadMe.
const bsc = gunzipSync(await get('http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz')).toString('latin1').split('\n');
const col = (line, a, b) => line.slice(a - 1, b).trim();
const stars = [];
for (const line of bsc) {
  if (line.length < 114 || !col(line, 76, 77) || !col(line, 103, 107)) continue; // novae and blanks have no position or mag
  const ra = (Number(col(line, 76, 77)) + Number(col(line, 78, 79)) / 60 + Number(col(line, 80, 83)) / 3600) * 15;
  const dec = (col(line, 84, 84) === '-' ? -1 : 1) * (Number(col(line, 85, 86)) + Number(col(line, 87, 88)) / 60 + Number(col(line, 89, 90)) / 3600);
  const mag = Number(col(line, 103, 107));
  const bv = col(line, 110, 114) === '' ? 0.6 : Number(col(line, 110, 114)); // a few lack B-V: call them sunlike
  if (dec < LATITUDE - 90) continue;
  stars.push({ ra, dec, mag, bv });
}
stars.sort((a, b) => a.mag - b.mag); // brightest first

// RA 0–360 and Dec −90–90 to 0–65535; mag −2–8 and B-V −0.5–2.5 to 0–65535.
const q = (v, lo, hi) => Math.max(0, Math.min(65535, Math.round(((v - lo) / (hi - lo)) * 65535)));
const starData = new Uint16Array(stars.length * 4);
stars.forEach((s, i) => starData.set([q(s.ra, 0, 360), q(s.dec, -90, 90), q(s.mag, -2, 8), q(s.bv, -0.5, 2.5)], i * 4));

// ---------------------------------------------------------------- constellation lines
const D3 = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/';
const lines = JSON.parse((await get(D3 + 'data/constellations.lines.json')).toString('utf8'));
const nameOf = Object.fromEntries(JSON.parse((await get(D3 + 'data/constellations.json')).toString('utf8')).features.map((f) => [f.id, f.properties.name]));
const license = (await get(D3 + 'LICENSE')).toString('utf8').trim();
// Per segment: RA/Dec of both ends, the constellation's centre, its rank (1 = major), the
// segment's place in its drawing order (0–1) and the constellation's index in `names`.
const segs = [];
const names = [];
for (const f of lines.features) {
  const polys = f.geometry.coordinates;
  const pts = polys.flat();
  // Centre: the mean direction of the constellation's points.
  let x = 0, y = 0, z = 0;
  for (const [lon, lat] of pts) {
    const a = (lon * Math.PI) / 180, d = (lat * Math.PI) / 180;
    x += Math.cos(d) * Math.cos(a); y += Math.cos(d) * Math.sin(a); z += Math.sin(d);
  }
  const cra = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const cdec = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
  if (Math.max(...pts.map((p) => p[1])) < LATITUDE - 90) continue;
  const n = polys.reduce((s, p) => s + p.length - 1, 0);
  let k = 0;
  for (const poly of polys) {
    for (let i = 0; i + 1 < poly.length; i++, k++) {
      const [ra0, dec0] = poly[i], [ra1, dec1] = poly[i + 1];
      segs.push([(ra0 + 360) % 360, dec0, (ra1 + 360) % 360, dec1, cra, cdec, Number(f.properties.rank), n > 1 ? k / (n - 1) : 0, names.length]);
    }
  }
  names.push(nameOf[f.id]);
}
const segData = new Uint16Array(segs.length * 9);
segs.forEach((s, i) => segData.set([
  q(s[0], 0, 360), q(s[1], -90, 90), q(s[2], 0, 360), q(s[3], -90, 90),
  q(s[4], 0, 360), q(s[5], -90, 90), s[6], q(s[7], 0, 1), s[8],
], i * 9));

// ---------------------------------------------------------------- ridge
const W = 2000;
const gray = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', photo, '-vf', `scale=${W}:-1:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
if (gray.status !== 0) throw new Error('ffmpeg failed: ' + gray.stderr);
const px = gray.stdout, H = px.length / W;
const DARK = 20; // the silhouette is ~8–10 out of 255; the sky just above it is far brighter
const heights = new Float64Array(W);
for (let x = 0; x < W; x++) {
  let y = H - 1;
  while (y > 0 && px[y * W + x] < DARK) y--;
  // Sub-pixel: where the brightness crosses DARK between row y (sky) and y + 1 (ridge).
  const above = px[y * W + x], below = y + 1 < H ? px[(y + 1) * W + x] : 0;
  const frac = above > below ? (above - DARK) / (above - below) : 0;
  heights[x] = (H - 1 - y - frac) / W; // fraction of the photo's width
}
const ridge = new Uint16Array(RIDGE_SAMPLES);
const RIDGE_MAX = 0.1; // of the photo's width; the real peak is ~0.05
for (let i = 0; i < RIDGE_SAMPLES; i++) {
  // Average the columns that fall in this sample.
  const a = Math.floor((i / RIDGE_SAMPLES) * W), b = Math.floor(((i + 1) / RIDGE_SAMPLES) * W);
  let s = 0;
  for (let x = a; x < b; x++) s += heights[x];
  ridge[i] = q(s / (b - a), 0, RIDGE_MAX);
}

// ---------------------------------------------------------------- write
const b64 = (a) => Buffer.from(a.buffer).toString('base64');
const out = `// Generated by scripts/sky-data.mjs. Don't edit: rerun it.
//
// Stars: Yale Bright Star Catalogue, 5th revised ed. (Hoffleit & Warren, 1991), ${stars.length} stars
// that rise at latitude ${LATITUDE}°, brightest first.
// Constellation lines (${names.length} constellations, ${segs.length} segments): d3-celestial, under this licence:
//
${license.split('\n').map((l) => ('// ' + l).trimEnd()).join('\n')}
//
// Ridge: traced from the reference photo, IMG_1171 (the Atlas at dusk).

const decode = (s) => {
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return new Uint16Array(bytes.buffer);
};
const U = 1 / 65535;

/** Per star: RA (0–360°), Dec (°), V magnitude, B-V, as uint16 → use STAR_RANGES. */
export const STARS = decode('${b64(starData)}');
/** [lo, hi] for each STARS field, in order. */
export const STAR_RANGES = [[0, 360], [-90, 90], [-2, 8], [-0.5, 2.5]];

/**
 * Per segment: RA, Dec of each end; RA, Dec of the constellation's centre; its rank (1 major,
 * 2, 3 faint, as is); the segment's place in the constellation's drawing order (0–1); and the
 * constellation's index in NAMES (as is).
 */
export const SEGMENTS = decode('${b64(segData)}');
/** [lo, hi] for each SEGMENTS field, in order (null = stored as is). */
export const SEGMENT_RANGES = [[0, 360], [-90, 90], [0, 360], [-90, 90], [0, 360], [-90, 90], null, [0, 1], null];

/** Constellation names (Latin, as on star charts), indexed by SEGMENTS' last field. */
export const NAMES = ${JSON.stringify(names)};

/** The skyline left to right, ${RIDGE_SAMPLES} samples, as a fraction of the photo's width (× RIDGE_MAX). */
export const RIDGE = decode('${b64(ridge)}');
export const RIDGE_MAX = ${RIDGE_MAX};

/** Where the observer stands (degrees north). Stars that never rise here are left out. */
export const LATITUDE = ${LATITUDE};

/** A uint16 field back to its value. */
export const unpack = (v, [lo, hi]) => lo + v * U * (hi - lo);
`;
writeFileSync(OUT, out);
console.log(`${stars.length} stars, ${names.length} constellations, ${segs.length} segments → ${OUT} (${(out.length / 1024).toFixed(0)} KB)`);
