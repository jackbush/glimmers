#!/usr/bin/env node
// Builds Atlas Nights' sky data: src/sketches/atlas-nights/sky.js. Needs network and ffmpeg.
//
//   node scripts/sky-data.mjs --photo path/to/IMG_1171.jpg
//
// - Stars: the Yale Bright Star Catalogue, 5th ed. (every star to about magnitude 6.5), J2000
//   positions, V magnitude and B-V colour index. Stars that never rise at the sketch's latitude
//   are left out.
// - Constellation lines, in several sky cultures: d3-celestial's western 88 (BSD-3), three
//   Arabic ones from Stellarium (CC BY-ND 4.0; notices copied into sky.js), and the Tuareg
//   names and stars Duveyrier recorded in 1864 (sky-tuareg.mjs). Each line is a
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
import TUAREG from './sky-tuareg.mjs';

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
// Several sky cultures, each a list of constellations (a name, its native name if any, and
// polylines of RA/Dec points in drawing order).
//
// - western: d3-celestial's 88 (BSD-3), the IAU's modern constellations.
// - greek: the same lines for the 48 Ptolemy catalogued in the Almagest (Argo as its modern
//   parts, Carina, Puppis and Vela).
// - The Arabic sky cultures from Stellarium (by Khalid al-Ajaji, CC BY-ND 4.0): stars given
//   by Hipparcos number, placed from d3-celestial's star list or, for stars fainter than it
//   goes, the Hipparcos catalogue on VizieR. These are kept whole and unaltered (the licence
//   allows no derivatives): every constellation, every line, only converted to coordinates.
// - tuareg: Duveyrier's 1864 names and stars, our lines (sky-tuareg.mjs); stars named by Bayer
//   letter or proper name, resolved through d3-celestial's star names.
const D3 = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/';
const SC = 'https://raw.githubusercontent.com/Stellarium/stellarium-skycultures/master/';
const STELLARIUM = ['arabic_lunar_stations', 'arabic_al-sufi', 'arabic_ancient'];
const license = (await get(D3 + 'LICENSE')).toString('utf8').trim();

// Ptolemy's 48, as IAU abbreviations.
const PTOLEMY = ('And Aql Aqr Ara Ari Aur Boo CMa CMi Cnc Cap Car Cas Cen Cep Cet CrA CrB Crt Crv Cyg Del Dra Equ Eri '
  + 'Gem Her Hya Leo Lep Lib Lup Lyr Oph Ori Peg Per PsA Psc Pup Sge Sco Ser Sgr Tau Tri UMa UMi Vel Vir').split(' ');

/** @type {{ id: string, constellations: { name: string, native: string, polys: number[][][] }[] }[]} */
const cultures = [];
{
  const lines = JSON.parse((await get(D3 + 'data/constellations.lines.json')).toString('utf8'));
  const nameOf = Object.fromEntries(JSON.parse((await get(D3 + 'data/constellations.json')).toString('utf8')).features.map((f) => [f.id, f.properties.name]));
  const constellation = (f) => ({ id: f.id, name: nameOf[f.id], native: '', polys: f.geometry.coordinates.map((poly) => poly.map(([lon, lat]) => [(lon + 360) % 360, lat])) });
  const greek = lines.features.filter((f) => PTOLEMY.includes(f.id));
  // Serpens comes in two parts (head and tail), so count names, not features.
  const found = new Set(greek.map((f) => f.id)).size;
  if (found !== PTOLEMY.length) throw new Error('Expected ' + PTOLEMY.length + ' of Ptolemy\'s in d3-celestial, found ' + found);
  cultures.push({ id: 'greek', constellations: greek.map(constellation) });
  cultures.push({ id: 'western', constellations: lines.features.map(constellation) });
}
{
  const hip = new Map(JSON.parse((await get(D3 + 'data/stars.6.json')).toString('utf8')).features.map((f) => [f.id, [(f.geometry.coordinates[0] + 360) % 360, f.geometry.coordinates[1]]]));
  const raw = [];
  for (const id of STELLARIUM) raw.push([id, JSON.parse((await get(SC + id + '/index.json')).toString('utf8'))]);
  // Tuareg: "α Ori" or "Alcyone" → Hipparcos number.
  const starNames = JSON.parse((await get(D3 + 'data/starnames.json')).toString('utf8'));
  const hipOf = new Map();
  for (const [h, n] of Object.entries(starNames)) {
    if (n.bayer) {
      hipOf.set(n.bayer + ' ' + n.c, Number(h)); // "ζ2 Sco": a double's component, as written
      const plain = n.bayer.replace(/[0-9]+$/, '') + ' ' + n.c; // "β Sco": its first listed component
      if (!hipOf.has(plain)) hipOf.set(plain, Number(h));
    }
    if (n.name) hipOf.set(n.name, Number(h));
  }
  const tuareg = TUAREG.constellations.map((c) => ({
    ...c,
    hips: c.lines.map((l) => l.map((star) => {
      if (!hipOf.has(star)) throw new Error('sky-tuareg.mjs: no star called ' + star);
      return hipOf.get(star);
    })),
  }));
  const missing = [...new Set([...raw.flatMap(([, d]) => d.constellations.flatMap((c) => c.lines.flat())), ...tuareg.flatMap((c) => c.hips.flat())].filter((h) => !hip.has(h)))];
  if (missing.length) {
    const tsv = (await get('https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=I/239/hip_main&-out=HIP,_RA.icrs,_DE.icrs&-out.max=9999&HIP=' + missing.join(','))).toString('utf8');
    for (const row of tsv.split('\n')) {
      const [h, ra, dec] = row.trim().split(/\t/).map(Number);
      if (Number.isFinite(h) && Number.isFinite(ra) && Number.isFinite(dec)) hip.set(h, [ra, dec]);
    }
    const still = missing.filter((h) => !hip.has(h));
    if (still.length) throw new Error('No position for Hipparcos ' + still.join(', ') + ' (the licence forbids dropping their lines)');
  }
  for (const [id, d] of raw) {
    cultures.push({
      id,
      constellations: d.constellations.map((c) => ({ name: c.common_name.english, native: c.common_name.native || '', polys: c.lines.map((l) => l.map((h) => hip.get(h))) })),
    });
  }
  cultures.push({
    id: TUAREG.id,
    constellations: tuareg.map((c) => ({ name: c.name, native: c.native, polys: c.hips.map((l) => l.map((h) => hip.get(h))) })),
  });
}

// Per segment: RA/Dec of both ends, the constellation's centre, the segment's place in its
// drawing order (0–1), the constellation's index in `names` and its
// culture's index in `cultures`.
const segs = [];
const names = [];
cultures.forEach((culture, ci) => {
  for (const c of culture.constellations) {
    const pts = c.polys.flat();
    // Centre: the mean direction of the constellation's points.
    let x = 0, y = 0, z = 0;
    for (const [lon, lat] of pts) {
      const a = (lon * Math.PI) / 180, d = (lat * Math.PI) / 180;
      x += Math.cos(d) * Math.cos(a); y += Math.cos(d) * Math.sin(a); z += Math.sin(d);
    }
    const cra = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    const cdec = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    const n = c.polys.reduce((s, p) => s + p.length - 1, 0);
    let k = 0;
    for (const poly of c.polys) {
      // A single star: a zero-length segment, which draws nothing but can be hovered.
      if (poly.length === 1) segs.push([poly[0][0], poly[0][1], poly[0][0], poly[0][1], cra, cdec, 0, names.length, ci]);
      for (let i = 0; i + 1 < poly.length; i++, k++) {
        segs.push([poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1], cra, cdec, n > 1 ? k / (n - 1) : 0, names.length, ci]);
      }
    }
    names.push(c.native ? [c.name, c.native] : [c.name]);
  }
});
const SEG_FIELDS = 9;
const segData = new Uint16Array(segs.length * SEG_FIELDS);
segs.forEach((s, i) => segData.set([
  q(s[0], 0, 360), q(s[1], -90, 90), q(s[2], 0, 360), q(s[3], -90, 90),
  q(s[4], 0, 360), q(s[5], -90, 90), q(s[6], 0, 1), s[7], s[8],
], i * SEG_FIELDS));

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
// Constellation lines (${names.length} constellations, ${segs.length} segments, in ${cultures.length} sky cultures):
// - western: d3-celestial, under this licence:
//
${license.split('\n').map((l) => ('//   ' + l).trimEnd()).join('\n')}
//
// - ${STELLARIUM.join(', ')}: from Stellarium's sky cultures
//   (https://github.com/Stellarium/stellarium-skycultures), by Khalid al-Ajaji, licensed CC BY-ND 4.0
//   (https://creativecommons.org/licenses/by-nd/4.0/). Included whole and unaltered: only
//   converted from Hipparcos numbers to coordinates (d3-celestial's star list, else Hipparcos via VizieR).
// - tuareg: names, meanings and stars from Henri Duveyrier, Les Touareg du Nord (Paris, 1864),
//   pp. 423–426 (public domain); the lines joining each figure's stars are drawn for this sketch.
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
 * Per segment: RA, Dec of each end; RA, Dec of the constellation's centre; the segment's place in
 * the constellation's drawing order (0–1); the constellation's index in NAMES; and its culture's
 * index in CULTURES. A single named star is a segment from it to itself.
 */
export const SEGMENTS = decode('${b64(segData)}');
/** [lo, hi] for each SEGMENTS field, in order (null = stored as is). */
export const SEGMENT_RANGES = [[0, 360], [-90, 90], [0, 360], [-90, 90], [0, 360], [-90, 90], [0, 1], null, null];

/** Each constellation's name, then its native name if the culture gives one. */
export const NAMES = ${JSON.stringify(names)};

/** The sky cultures' ids, in SEGMENTS' culture order (see cultures.js for what they're called). */
export const CULTURES = ${JSON.stringify(cultures.map((c) => c.id))};

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
