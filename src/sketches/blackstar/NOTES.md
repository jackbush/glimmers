# Blackstar

An undulating black orb with a burning halo on a wobbling yellow gradient, with an analog film layer on top. Raw WebGL2, three render passes.

## Files

| File | Role | Edit when |
|---|---|---|
| `params.js` | Every default. `playback()` supplies Speed and the quality controls; `seed` rides along in that group. | Any new, changed or removed control |
| `shader.js` | Three GLSL passes plus `perFrame()` (CPU). All design logic lives here. | Any visual change |
| `sketch.js` | WebGL engine: passes, render targets, uniform upload, context loss. No design logic. | New pass/target, new param *type* |
| `check.mjs` | Checks that params, GLSL and `perFrame()` agree (run by `scripts/check.mjs`). | Rarely |
| `manifest.js` | Name, year, page colour (`orbColor`), capture settings (CRF 29: grain defeats compression). | — |

## Passes in `shader.js`

1. `angular` (1024×1): noise that depends only on the angle around the orb. The composite pass reads it as `A`, i.e. `vec4(ownN, hueN, free, free)` (the halo's own shape and its hue drift).
2. `fields` (¼ resolution, two RGBA outputs): smooth, low-frequency noise, sampled in the composite pass as `F0` (warp, mottle, leak, rays) and `F1` (swirl, free, free, free). Put any new *smooth* noise here, in a free channel.
3. `composite` (full resolution): cheap per-pixel work only, i.e. texture lookups, crisp edges, colour, hashes for grain and dust.

- **Orb outline:** a closed Catmull-Rom spline through `orbPoints` radii evenly spaced around a circle (point 0 at the top). Each point is a sine wave with its own phase and speed and a slowly jittering amplitude (`ringPoint()` on the CPU). `perFrame()` writes the offsets into `f_ring`: slots `[0, N)` are now and `[MAX_POINTS, MAX_POINTS+N)` are at `t − haloLag`, which the halo uses. In GLSL, `ringOffset(angle, 0 | MAX_POINTS)` returns the radius offset as a fraction of `f_orbR`.
- `perFrame(P, t, rt, w, h, px, f)` runs on the CPU once per frame. Anything identical for every pixel (centres, directions, halo reach) is computed here and written into a preallocated `f_*` uniform declared in `frameUniforms` (a count 1–4 gives float/vec2/vec3/vec4; `[n]` gives a float array). It must not allocate.

**How a param reaches the GPU:** a param `{ key: 'fooBar', ... }` is automatically declared in every pass as `uniform float u_fooBar;`, or `vec3` for colours. **Never hand-declare a param uniform.** A param that is only read by `perFrame()` (`P.fooBar`) must have `uniform: false`, as must the kit's standard params. Built-ins: `u_res` (the current pass's target size), `u_screen` (canvas size), `u_time` (scene time: scaled and pausable), `u_realTime` (wall clock, which drives the film layer).

**Composite order:** background → halo → orb → light leaks → highlight burn → vignette → exposure → dust → grain. Put new layers where they'd physically sit. Scene content goes before the film layers, and grain always comes last.

**Coordinates:** `q` is centred, aspect-correct, with screen height = 1 (so x spans ±aspect/2), and +y up. `fuv` is the matching 0–1 coordinate for sampling fields. `fc` is `gl_FragCoord` in canvas pixels; multiply pixel sizes by `f_px` (canvas px per CSS px) so they stay stable when adaptive quality changes resolution.

**Shared GLSL helpers (`common`):** `snoise(vec3)` returns -1..1 and `fbm3` is 3 octaves (both from `src/kit/noise.js`), `ringOffset` is the orb outline, and `encode`/`decode` pack values for the passes. `hash(vec3)` (0..1 per integer cell), `filmDust` and `filmGrain` come from the shared film layer, `src/kit/film.js`, which also supplies the Grain & damage params. On the CPU there are `noise1(x)` and `hash2(a, b)`.

## Adding a visual element

1. Work out where each part should be computed: values identical for every pixel go in `perFrame()`, smooth noise goes in the `fields` pass, angle-only shapes go in `angular`, and only crisp or per-pixel detail goes in `composite`. Write the composite part as a commented block (`// --- name: what it does`).
2. Include an amount/intensity param so that setting it to 0 makes the layer invisible.
3. Update the composite-order comment at the top of `shader.js` if you added a new stage.

## Performance budget

- **The composite pass is the hot path.** Avoid `snoise`/`fbm3` there. If you can't, put it behind a branch that only a small part of the screen takes. Sample textures with `textureLod(..., 0.0)` *outside* branches, and keep `fwidth` outside branches too.
- Budget: `composite` should stay at **0 noise calls** per pixel plus the existing ~7 hash chains (grain and dust). `fields` (¼ res) and `angular` (1024 px) can afford a few fbm calls each.
- Loops must have constant bounds. If you add a pass or render target, create it in `buildAll()`/`buildTargets()`, resize it only when its size changes, and null it in the `webglcontextlost` handler.
- Params are re-uploaded only when `model.version` changes.
- **Lesson:** the first build "worked" in a SwiftShader screenshot but stalled the user's browser (~2fps): one pass ran ~35 3D-noise calls per pixel. A screenshot only proves it renders. Run `node scripts/bench.mjs blackstar --fixed --size 2560x1440 --dpr 2` before saying a visual change is done.

## Benchmarks

The old standalone bench counted rAF ticks and isn't comparable with `scripts/bench.mjs`, which counts frames the kit rendered. Under one harness, the glimmers port and the old standalone build ran at the same rate (~620fps at 1440×813 with the pane closed, M3).

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-12 | M3, Chrome headless | `bench.mjs blackstar --fixed --size 1440x813` (pane open, canvas 1030×726) | ~460 |
| 2026-10-12 | M3, Chrome headless | `bench.mjs blackstar --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706) | 148 |

## Optimisation todo

- [ ] Find out which machine and browser showed ~2fps for the user, and benchmark there; all numbers so far come from an M3.
- [ ] `bench.mjs --swiftshader` timed out (>90s) once adaptive quality started at 100% instead of 75%. Find out why the first frames stall on very weak GPUs: consider a cheap first-frame timing probe, or start conservative and ramp up quickly.
- [ ] Composite pass: grain and dust still cost ~7 PCG hash chains per pixel. Try a small per-film-frame noise texture at grain resolution instead.
- [ ] Fields pass: try 1/6 or 1/8 resolution (`fieldsDivisor`) and check whether mottle and halo flame still look right at their maximum scales.
- [ ] Adaptive quality: check display-capped detection (30Hz / low-power mode) on a real device, and tune hysteresis so resolution doesn't pump.
