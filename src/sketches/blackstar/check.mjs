// Blackstar's own checks, run by scripts/check.mjs: params.js ↔ the GLSL passes and perFrame().
// Every param without `uniform: false` must be used as u_<key> in a shader; every CPU-only
// param must be read somewhere (P.<key> in perFrame, or by the kit); every u_* and f_* the
// shaders use must exist.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STANDARD_KEYS } from '../../kit/standard.js';

const BUILTINS = new Set(['u_res', 'u_screen', 'u_time', 'u_realTime', 'u_angular', 'u_fields0', 'u_fields1']);

export default async function check({ dir, params, errors, warnings }) {
  const S = (await import(pathToFileURL(join(dir, 'shader.js')).href)).default;
  const frag = [S.common, S.angular, S.fields, S.composite].join('\n');
  const cpuSrc = readFileSync(join(dir, 'shader.js'), 'utf8'); // perFrame() and its CPU helpers
  const keys = new Set(params.map((p) => p.key));
  const frameNames = new Set(Object.keys(S.frameUniforms));

  for (const p of params) {
    if (p.uniform === false) {
      if (!STANDARD_KEYS.includes(p.key) && !new RegExp(`\\bP\\.${p.key}\\b`).test(cpuSrc)) {
        warnings.push(`${p.key}: CPU-only param not read by perFrame() (P.${p.key})`);
      }
      if (new RegExp(`\\bu_${p.key}\\b`).test(frag)) errors.push(`${p.key}: has uniform: false but the shader uses u_${p.key}`);
    } else if (!new RegExp(`\\bu_${p.key}\\b`).test(frag)) {
      warnings.push(`${p.key}: u_${p.key} is never used in the shader`);
    }
  }
  for (const m of new Set(frag.match(/\bu_[A-Za-z0-9]+\b/g) || [])) {
    if (!BUILTINS.has(m) && !keys.has(m.slice(2))) errors.push(`shader uses ${m} but no param "${m.slice(2)}" exists`);
  }
  for (const m of new Set(frag.match(/\bf_[A-Za-z0-9]+\b/g) || [])) {
    if (!frameNames.has(m)) errors.push(`shader uses ${m} but it is not in frameUniforms`);
  }
  for (const n of frameNames) {
    if (!new RegExp(`\\bf\\.${n}\\b`).test(cpuSrc)) errors.push(`frameUniforms.${n} is never written by perFrame()`);
  }
}
