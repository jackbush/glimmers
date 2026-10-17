// Geode's own checks, run by scripts/check.mjs: params.js ↔ the GLSL passes, perFrame() and
// cluster.js (see scripts/lib/shader-check.mjs).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkShader } from '../../../scripts/lib/shader-check.mjs';

export default async function check(ctx) {
  const S = (await import(pathToFileURL(join(ctx.dir, 'shader.js')).href)).default;
  checkShader(ctx, {
    glsl: [S.common, S.bake, S.backdrop, S.trace, S.bright, S.blur, S.composite].join('\n'),
    cpuSrc: ['shader.js', 'cluster.js'].map((f) => readFileSync(join(ctx.dir, f), 'utf8')).join('\n'),
    frameNames: Object.keys(S.frameUniforms),
    builtins: ['u_res', 'u_screen', 'u_time', 'u_realTime', 'u_slice', 'u_dir', 'u_incl', 'u_hdr', 'u_src', 'u_bloomTex'],
  });
}
