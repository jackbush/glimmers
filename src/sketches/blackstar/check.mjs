// Blackstar's own checks, run by scripts/check.mjs: params.js ↔ the GLSL passes and perFrame()
// (see scripts/lib/shader-check.mjs).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkShader } from '../../../scripts/lib/shader-check.mjs';

export default async function check(ctx) {
  const S = (await import(pathToFileURL(join(ctx.dir, 'shader.js')).href)).default;
  checkShader(ctx, {
    glsl: [S.common, S.angular, S.fields, S.composite].join('\n'),
    cpuSrc: readFileSync(join(ctx.dir, 'shader.js'), 'utf8'), // perFrame() and its CPU helpers
    frameNames: Object.keys(S.frameUniforms),
    builtins: ['u_res', 'u_screen', 'u_time', 'u_realTime', 'u_angular', 'u_fields0', 'u_fields1'],
  });
}
