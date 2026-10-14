// Atlas Nights' own checks, run by scripts/check.mjs: params.js ↔ the GLSL and perFrame()
// (see scripts/lib/shader-check.mjs).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkShader } from '../../../scripts/lib/shader-check.mjs';

export default async function check(ctx) {
  const S = (await import(pathToFileURL(join(ctx.dir, 'shader.js')).href)).default;
  checkShader(ctx, {
    glsl: [S.common, S.linesVert, S.linesFrag, S.starsVert, S.starsFrag, S.meteorVert, S.meteorFrag, S.composite].join('\n'),
    cpuSrc: ['shader.js', 'label.js'].map((f) => readFileSync(join(ctx.dir, f), 'utf8')).join('\n'), // perFrame(), hover(), the label
    frameNames: Object.keys(S.frameUniforms),
    builtins: ['u_res', 'u_screen', 'u_time', 'u_realTime', 'u_light', 'u_ridge'],
  });
}
