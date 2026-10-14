// Cubeland — batches of colourful boxes fall and tumble past the camera (three.js).
//
// Every cube is one instance of a single InstancedMesh (one unit box, scaled per instance),
// so a screen full of cubes is one draw call. Cube state lives in typed arrays; a cube that
// falls out of view frees its slot for the next drop, and when every slot is taken the
// oldest cube is reused. A frame allocates nothing.
//
// Within a drop, cube n falls and spins faster by n × the ramp params, so each batch
// stretches out into a stream rather than falling as a block.

import * as THREE from 'three';
import { rng } from '../../kit/random.js';

const CAPACITY = 8000;
const FLOOR = -15; // cubes below this are gone
const COLOURS = [0xf8909c, 0xfba4b0, 0xfebdc8, 0xf8988b, 0xffaa86, 0xfeec85, 0xff9e70, 0x6fcfbf, 0xff967c, 0xfc8faa, 0xe685a4,
  0xad8ed6, 0xb1bed6, 0x9ec3d4, 0x7091ca, 0x7699db, 0x9adcf0, 0x84e4d8, 0xa1e9d7, 0xa3e28c, 0xe9eb7f];

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); // the kit sizes the canvas in device pixels already

  const scene = new THREE.Scene();
  const background = new THREE.Color();
  scene.background = background;
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.z = 5;
  const ambient = new THREE.AmbientLight(0xffffff, P.ambient.value);
  const sun = new THREE.DirectionalLight(0xffffff, P.sun.value);
  sun.position.set(5, 10, 7);
  scene.add(ambient, sun);

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), CAPACITY);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // instances move; the base box's bounds say nothing about them
  mesh.count = 0;
  scene.add(mesh);
  const palette = COLOURS.map((c) => new THREE.Color(c));
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  // Per-cube state.
  const pos = new Float32Array(CAPACITY * 3), rot = new Float32Array(CAPACITY * 3), size = new Float32Array(CAPACITY * 3);
  const spin = new Float32Array(CAPACITY * 3), fall = new Float32Array(CAPACITY), drift = new Float32Array(CAPACITY);
  const alive = new Uint8Array(CAPACITY);
  let aliveCount = 0;
  let next = 0; // ring cursor: where the next cube goes

  const dummy = new THREE.Object3D();
  let rand = rng(P.seed.value), seed = P.seed.value;

  function drop() {
    const n = Math.min(P.count.value, CAPACITY);
    const s = P.maxSize.value, spread = P.spawnSpread.value;
    for (let i = 0; i < n; i++) {
      // Prefer a free slot near the cursor; if there isn't one, reuse the oldest (the cursor's).
      let k = next;
      if (aliveCount < CAPACITY) while (alive[k]) k = (k + 1) % CAPACITY;
      next = (k + 1) % CAPACITY;
      if (!alive[k]) { alive[k] = 1; aliveCount++; }
      pos[k * 3] = spread * (rand() - 0.5);
      pos[k * 3 + 1] = P.spawnHeight.value + spread * (rand() - 0.5);
      pos[k * 3 + 2] = spread * (rand() - 0.5);
      rot[k * 3] = rot[k * 3 + 1] = rot[k * 3 + 2] = 0;
      size[k * 3] = s * rand();
      size[k * 3 + 1] = s * rand();
      size[k * 3 + 2] = s * rand();
      drift[k] = P.drift.value * (rand() - 0.5);
      fall[k] = P.fallBase.value * rand() + P.fallScale.value * i;
      spin[k * 3] = P.spinX.value * rand() + P.spinScale.value * i;
      spin[k * 3 + 1] = P.spinY.value * rand() + P.spinScale.value * i;
      spin[k * 3 + 2] = P.spinZ.value * rand() + P.spinScale.value * i;
      mesh.setColorAt(k, palette[Math.floor(rand() * palette.length)]);
      if (k >= mesh.count) mesh.count = k + 1;
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  canvas.addEventListener('click', drop);

  let sinceDrop = 0, started = false, bg = '';
  return {
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    frame(_t, dt) {
      if (P.seed.value !== seed) { seed = P.seed.value; rand = rng(seed); }
      const every = P.autoDrop.value;
      sinceDrop += dt;
      if (!started || (every > 0 && sinceDrop >= every)) { started = true; sinceDrop = 0; drop(); }

      for (let k = 0; k < mesh.count; k++) {
        if (!alive[k]) continue;
        const i = k * 3;
        rot[i] += spin[i] * dt;
        rot[i + 1] += spin[i + 1] * dt;
        rot[i + 2] += spin[i + 2] * dt;
        pos[i] += drift[k] * dt;
        pos[i + 1] -= fall[k] * dt;
        if (pos[i + 1] < FLOOR) {
          alive[k] = 0;
          aliveCount--;
          mesh.setMatrixAt(k, zero);
          continue;
        }
        dummy.position.set(pos[i], pos[i + 1], pos[i + 2]);
        dummy.rotation.set(rot[i], rot[i + 1], rot[i + 2]);
        dummy.scale.set(size[i], size[i + 1], size[i + 2]);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      while (mesh.count > 0 && !alive[mesh.count - 1]) mesh.count--;

      if (P.background.value !== bg) { bg = P.background.value; background.set(bg); } // parsing a colour string allocates
      ambient.intensity = P.ambient.value;
      sun.intensity = P.sun.value;
      renderer.render(scene, camera);
    },
  };
}
