// WebGL2 plumbing shared by the shader sketches: compiling and linking, a fullscreen
// triangle, and params as uniforms. A param without `uniform: false` (selects excepted) is
// `uniform float u_<key>` in GLSL, or `vec3` for a colour.

/** Vertex shader for a pass that covers the target: one triangle from the vertex id, no buffers. */
export const FULLSCREEN_VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Compile both stages and link them. Throws with the info log on failure, unless the
 * context is lost (the sketch rebuilds when it's restored).
 * @param {WebGL2RenderingContext} gl
 * @param {string} vert
 * @param {string} frag
 * @param {string} name used in error messages
 */
export function program(gl, vert, frag, name) {
  const compile = (/** @type {number} */ type, /** @type {string} */ src, /** @type {string} */ stage) => {
    const sh = /** @type {WebGLShader} */ (gl.createShader(type));
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader "' + name + '" (' + stage + ') failed to compile:\n' + log);
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, vert, 'vertex');
  const fs = compile(gl.FRAGMENT_SHADER, frag, 'fragment');
  const prog = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error('Program "' + name + '" failed to link:\n' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

/**
 * The params a shader sees as uniforms.
 * @param {import('./types').Param[]} params
 */
export function shaderParams(params) {
  return params.filter((p) => p.uniform !== false && p.type !== 'select');
}

/**
 * GLSL declarations for those params, one per line.
 * @param {import('./types').Param[]} params from shaderParams()
 */
export function paramDecls(params) {
  return params.map((p) => 'uniform ' + (p.type === 'color' ? 'vec3' : 'float') + ' u_' + p.key + ';\n').join('');
}

/**
 * Upload every param's value (the program must be in use). Allocation-free.
 * @param {WebGL2RenderingContext} gl
 * @param {(WebGLUniformLocation | null)[]} locs one per param, in order
 * @param {import('./types').Param[]} params from shaderParams()
 */
export function uploadParams(gl, locs, params) {
  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    if (p.type === 'color') gl.uniform3fv(locs[i], p.rgb);
    else gl.uniform1f(locs[i], p.type === 'bool' ? (p.value ? 1 : 0) : /** @type {number} */ (p.value));
  }
}
