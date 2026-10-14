// Leaf — the shape knobs: every select option as a row of numbers, and the params resolved
// (and, per leaf variant, jittered) into the plain values the geometry reads.

import { DEG, clamp, rnd2 } from './util.js';

// ---------------------------------------------------------------- option tables
// Each select option is a row of continuous numbers. sketch.js eases a weight per option,
// and the shape uses the weighted sum, so switching category morphs.

// Outline: [widest point (0 base … 1 tip), half-width per unit length, roundness exponent, cordate lobes]
const OUTLINE = {
  Linear: [0.5, 0.07, 0.35, 0],
  Lanceolate: [0.32, 0.15, 1.0, 0],
  Elliptic: [0.5, 0.27, 0.85, 0],
  Ovate: [0.36, 0.33, 0.85, 0],
  Obovate: [0.66, 0.3, 0.85, 0],
  Cordate: [0.3, 0.42, 0.8, 0.55],
  Orbicular: [0.5, 0.47, 0.6, 0.12],
  Deltoid: [0.1, 0.48, 0.9, 0],
  Needle: [0.5, 0.022, 0.25, 0],
};
// Base: [base exponent (1 = wedge, small = blunt), cordate lobes, asymmetry]
const BASE = {
  Cuneate: [1.25, 0, 0],
  Rounded: [0.55, 0, 0],
  Cordate: [0.5, 0.55, 0],
  Truncate: [0.35, 0, 0],
  Asymmetric: [0.6, 0.12, 1],
};
// Apex: [apex exponent, drawn-out tip, notch]
const APEX = {
  Acute: [1.0, 0, 0],
  Acuminate: [1.15, 1, 0],
  Obtuse: [0.62, 0, 0],
  Rounded: [0.4, 0, 0],
  Notched: [0.38, 0, 1],
};
// Lobing: [pinnate amount, palmate amount]
const LOBING = { Unlobed: [0, 0], 'Pinnately lobed': [1, 0], 'Palmately lobed': [0, 1] };

/** Turn a name-keyed table into rows in the param's option order (throws if one is missing). */
function rows(table, options, name) {
  return options.map((o) => {
    if (!table[o]) throw new Error('shapes.js: no ' + name + ' entry for "' + o + '"');
    return table[o];
  });
}

// ---------------------------------------------------------------- resolved shape knobs

export const G = {
  pw: 0.4, W: 0.3, expMul: 1, cord: 0, baseE: 1, asym: 0, apexE: 1, acum: 0, notch: 0,
  pin: 0, palm: 0, lobeDepth: 0, lobes: 5, lobeSharp: 0.5,
  mw: new Float32Array(7), teeth: 20, toothDepth: 0.02,
  vw: new Float32Array(4), veinCount: 8, veinAngle: 0.8, veinCurve: 0.3, veinWeight: 0.004, midribWeight: 0.008,
  cw: new Float32Array(5), leaflets: 7, lPairs: 3, lTerm: 1, leafletAngle: 1,
  bend: 0, sCurve: 0, petLen: 0.15, petFlat: 0, wing: 0, stipules: 0,
  veinlets: 0, outlineW: 0.005, wobble: 0.004, variety: 0.3,
};
// Per-variant jittered copy of the knobs that vary.
export const J = { W: 0, lobeDepth: 0, toothDepth: 0, bend: 0, sCurve: 0, veinCount: 8, leafletAngle: 1, petLen: 0, pw: 0.4, veinAngle: 0.8 };

// Option rows, resolved against the params' option lists on first use.
let tOutline = null, tBase = null, tApex = null, tLobing = null;

export function resolveKnobs(P, B, variety) {
  if (!tOutline) {
    tOutline = rows(OUTLINE, P.outline.options, 'outline');
    tBase = rows(BASE, P.base.options, 'base');
    tApex = rows(APEX, P.apex.options, 'apex');
    tLobing = rows(LOBING, P.lobing.options, 'lobing');
  }
  let pw = 0, W = 0, em = 0, cord = 0;
  for (let i = 0; i < tOutline.length; i++) {
    const w = B.outline[i], r = tOutline[i];
    pw += w * r[0]; W += w * r[1]; em += w * r[2]; cord += w * r[3];
  }
  let be = 0, asym = 0, ae = 0, acum = 0, notch = 0;
  for (let i = 0; i < tBase.length; i++) { const w = B.base[i], r = tBase[i]; be += w * r[0]; cord += w * r[1]; asym += w * r[2]; }
  for (let i = 0; i < tApex.length; i++) { const w = B.apex[i], r = tApex[i]; ae += w * r[0]; acum += w * r[1]; notch += w * r[2]; }
  let pin = 0, palm = 0;
  for (let i = 0; i < tLobing.length; i++) { pin += B.lobing[i] * tLobing[i][0]; palm += B.lobing[i] * tLobing[i][1]; }
  G.pw = pw; G.W = W * P.width.value; G.expMul = em; G.cord = Math.min(cord, 0.9);
  G.baseE = be; G.asym = asym; G.apexE = ae; G.acum = acum; G.notch = notch;
  G.pin = pin; G.palm = palm; G.lobeDepth = P.lobeDepth.value; G.lobes = P.lobes.value; G.lobeSharp = P.lobeSharpness.value;
  for (let i = 0; i < 7; i++) G.mw[i] = B.margin[i];
  G.teeth = P.teeth.value; G.toothDepth = P.toothDepth.value;
  for (let i = 0; i < 4; i++) G.vw[i] = B.venation[i];
  G.veinCount = P.veinCount.value; G.veinAngle = P.veinAngle.value * DEG; G.veinCurve = P.veinCurve.value;
  G.veinWeight = P.veinWeight.value; G.midribWeight = P.midribWeight.value;
  for (let i = 0; i < 5; i++) G.cw[i] = B.compound[i];
  // Leaflets as pairs and a terminal (0–1), eased separately by sketch.js: easing the raw count
  // passed through every count on the way, and odd and even counts lay out differently, so
  // leaflets slid up and back and the terminal grew and shrank once per count.
  const nL = P.leaflets.value;
  G.lPairs = P.leafletPairs ? P.leafletPairs.value : Math.floor(nL / 2);
  G.lTerm = P.leafletTerm ? P.leafletTerm.value : nL % 2;
  G.leaflets = 2 * G.lPairs + G.lTerm; G.leafletAngle = P.leafletAngle.value * DEG;
  G.bend = P.bend.value; G.sCurve = P.sCurve.value;
  G.petLen = P.petioleLength.value; G.petFlat = P.petioleFlat.value; G.wing = P.petioleWing.value; G.stipules = P.stipules.value;
  G.veinlets = P.veinlets.value;
  G.outlineW = P.outlineWeight.value; G.wobble = P.wobble.value; G.variety = variety;
}

export function jitter(vs) {
  const v = G.variety;
  J.W = G.W * (1 + v * 0.3 * rnd2(vs, 1));
  J.pw = clamp(G.pw + v * 0.06 * rnd2(vs, 2), 0.04, 0.96);
  J.lobeDepth = clamp(G.lobeDepth * (1 + v * 0.35 * rnd2(vs, 3)), 0, 1);
  J.toothDepth = G.toothDepth * (1 + v * 0.4 * rnd2(vs, 4));
  J.bend = G.bend + v * 0.7 * rnd2(vs, 5);
  J.sCurve = G.sCurve + v * 0.6 * rnd2(vs, 6);
  // Fractional: the last vein fades in as the count rises, so counts morph smoothly.
  J.veinCount = Math.max(2, G.veinCount + v * 2.2 * rnd2(vs, 7));
  J.leafletAngle = G.leafletAngle + v * 0.25 * rnd2(vs, 8);
  J.petLen = G.petLen * (1 + v * 0.3 * rnd2(vs, 9));
  J.veinAngle = clamp(G.veinAngle + v * 0.15 * rnd2(vs, 10), 0.2, 1.5);
}
