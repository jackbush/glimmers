# Cubeland

Batches of colourful boxes fall and tumble past the camera. three.js.

Ported from `jackbush/cubeland`. The original added 200 meshes (each with its own geometry and material) per click on a "go" button; the port drops a batch on every click on the canvas, and every `autoDrop` seconds by itself, so the page is never empty.

- One `InstancedMesh` (a unit box scaled per instance, per-instance colour) holds up to `CAPACITY` cubes: one draw call however many are on screen. Cube state lives in typed arrays; a cube that falls below `FLOOR` frees its slot, and when every slot is taken the oldest is reused.
- Speeds are per second (the original's per-frame values × 60). Within a drop, cube n gets `fallScale × n` extra fall speed and `spinScale × n` extra spin, so a batch stretches into a stream. A few cubes get a near-zero random fall speed and linger, as in the original.
- `renderer.setPixelRatio(1)`: the kit already sizes the canvas in device pixels. Antialiasing is on (the original had it off).
- The cover isn't a ping-pong (falling cubes look wrong reversed): it's 8 s of the steady stream, starting 12 s in.

## Benchmarks

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-12 | M3, Chrome headless | `bench.mjs cubeland --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706) | 170 |
