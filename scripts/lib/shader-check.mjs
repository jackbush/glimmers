// Params ↔ GLSL ↔ CPU checks for the WebGL sketches, called from a sketch's own check.mjs.
// Every param without `uniform: false` must be used as u_<key> in a shader; every CPU-only
// param must be read somewhere (P.<key> in the CPU source, or by the kit); every u_* and f_*
// the shaders use must exist, and every f_* must be written (f.<name>) by the CPU source. No
// param's uniform may share a name with one the engine sets itself.

import { STANDARD_KEYS } from '../../src/kit/standard.js';

/**
 * @param {{ params: any[], errors: string[], warnings: string[] }} ctx from scripts/check.mjs
 * @param {{ glsl: string, cpuSrc: string, frameNames: string[], builtins: string[] }} sketch
 *   all GLSL joined; the source of the CPU code that reads params and writes frame values; the
 *   frame uniforms' names; uniforms the engine sets itself (u_res, samplers…)
 */
export function checkShader({ params, errors, warnings }, { glsl, cpuSrc, frameNames, builtins }) {
  const keys = new Set(params.map((p) => p.key));
  const builtin = new Set(builtins);
  for (const p of params) {
    if (builtin.has('u_' + p.key)) errors.push(`${p.key}: u_${p.key} is also one of the engine's own uniforms`);
  }
  for (const p of params) {
    if (p.uniform === false) {
      if (!STANDARD_KEYS.includes(p.key) && !new RegExp(`\\bP\\.${p.key}\\b`).test(cpuSrc)) {
        warnings.push(`${p.key}: CPU-only param never read (P.${p.key})`);
      }
      if (new RegExp(`\\bu_${p.key}\\b`).test(glsl)) errors.push(`${p.key}: has uniform: false but the shader uses u_${p.key}`);
    } else if (!new RegExp(`\\bu_${p.key}\\b`).test(glsl)) {
      warnings.push(`${p.key}: u_${p.key} is never used in the shader`);
    }
  }
  for (const m of new Set(glsl.match(/\bu_[A-Za-z0-9]+\b/g) || [])) {
    if (!builtin.has(m) && !keys.has(m.slice(2))) errors.push(`shader uses ${m} but no param "${m.slice(2)}" exists`);
  }
  for (const m of new Set(glsl.match(/\bf_[A-Za-z0-9]+\b/g) || [])) {
    if (!frameNames.includes(m)) errors.push(`shader uses ${m} but it is not in frameUniforms`);
  }
  for (const n of frameNames) {
    if (!new RegExp(`\\bf\\.${n}\\b`).test(cpuSrc)) errors.push(`frameUniforms.${n} is never written`);
  }
}
