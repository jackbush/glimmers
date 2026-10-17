# Geode

A raw quartz cluster (amethyst by default) turning slowly in a dark studio, ray-traced per pixel in raw WebGL2. The studio's backdrop glow takes the stone's hue turned by Hue shift (0 or 360 = the stone's own hue, 180 = the opposite), so changing the stone's colour recolours the room too. Phase 1 of three: the look. Next comes a soft random drift through the params, then the microphone (see `.claude/todo.md`).

## Files

| File | Role | Edit when |
|---|---|---|
| `params.js` | Every default. | Any control |
| `cluster.js` | The geometry: each crystal is 13 planes (6 prism, 6 tip, 1 base), and the rock is 1–2 convex lumps of 16 facets, all written into `cluster.data`, a uniform buffer the trace reads as `bodies[]`. Built from the seed and the Cluster and Matrix params; it allocates nothing, so it can rebuild every frame. | Crystal or rock shape, layout |
| `shader.js` | Every pass's GLSL and `perFrame()` (camera, turn, softboxes, backdrop hue, absorption). All design logic. | Any visual change |
| `sketch.js` | Engine: the bake, the uniform buffer, HDR and bloom targets, the passes. No design logic. | New pass or target |
| `check.mjs` | Params ↔ GLSL ↔ `perFrame()` and `cluster.js`. | Rarely |

## How it works

- **Passes:** `bake` (only when the seed changes) fills a 128³ tileable volume: milky cloud, bubble veils, slow mottling, sparkle. `backdrop` fills the HDR target with the studio. `trace` runs only inside the cluster's square on screen (`traceBox`, a scissor), because empty pixels cost almost as much as the full shader's occupancy. Then `bright` → `blurH` → `blurV` at ¼ resolution for bloom, and `composite` (exposure, ACES, vignette toward Edge colour, grain).
- **Trace:** a sphere cull, then exact convex-solid hits (the largest entry plane and the smallest exit plane). Entering a crystal: Schlick Fresnel reflection to the studio, then refraction. Inside, up to Bounces segments: each is marched for clouds, veils and absorption (Inclusion steps, jittered per pixel). Phantoms (the same planes shrunk about the crystal's middle), rutile needles (exact closest approach between the ray and each needle, antialiased by pixel footprint) and cracks (a ragged disc with a thin-film palette) are exact hits. At the exit face the ray reflects totally or refracts out. The part reflected back inside reads the studio along its reflected direction rather than being traced. Out of a crystal the ray can enter another (Pass-throughs); if it last left through a face, the studio is read once per Fire sample along each wavelength's direction.
- **Colour:** Stone colour is the light after one unit of stone (the tallest point is 1 long): σ = −ln(colour) × Colour depth, scaled up toward the tips by Tip colour, as in amethyst. Milky cloud gathers toward the roots (Milkier at base).
- **Studio:** `env()` is analytic and fixed to the camera, so the cluster turns through the light. It's the backdrop glow plus four rectangular softboxes: key, a fill mirroring the key, and two tall rims behind. A rough (frosted or chipped) face widens the softbox edges while keeping their power, instead of taking more samples.
- **Surface:** growth ridges on prism faces bend the normal along the axis and fade out once they're finer than ~4 px. Frosted faces get a little normal grain plus the blurred studio. Chips: edge proximity (distance to the nearest other face) × slow noise, so most of each edge stays sharp.
- **Colour space:** colour params are sRGB, converted with `lin()`. HDR targets store `x / (1 + x)`, so the RGBA8 fallback still holds highlights.

## Surprises

- The first chip model drew a white line along every edge, like a cartoon outline. Chips must be sparse: noise decides, edge proximity only allows them.
- A frosted face's grain made glitter at 0.3 normal jitter; 0.06 plus the analytic blur reads as etched.
- Ridge strength picked per band (hash) striped under refraction; it now wanders smoothly (a 3D-texture lookup).

## Performance budget

Pixel-bound: 4× the pixels runs ~3.7× slower. No single feature dominates; the crystal count matters most (3 crystals ≈ 50fps vs 9 ≈ 33fps at 2560×1440 @2), then pass-throughs, wear, phantoms and needles, each a few percent. Inclusion steps, bounces and fire samples barely move it.

## Benchmarks

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-17 | M3, Chrome headless, on battery (26%) | `bench.mjs geode --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706) | 32–36 |
| 2026-10-17 | same | `bench.mjs geode --fixed --size 1440x900 --dpr 2` (canvas 2060×1626) | 100 |
| 2026-10-17 | same | `bench.mjs geode --fixed --size 2560x1440` (canvas 2150×1353) | 115–128 |

## Optimisation todo

- [ ] At 2560×1440 @2, adaptive quality drops to 80% and stops there (~31fps): its "did the drop help?" check judged that it didn't. Find out why before relying on adaptive quality for 5K screens.
- [ ] Cheaper scene traversal: per-crystal screen bounds, or tighter bounding capsules instead of spheres.
- [ ] Try tracing at a fixed fraction of the canvas resolution with an edge-aware upscale.

## Look todo

- [ ] Big flat white softbox reflections on tip faces read as CG: try a softbox texture (a gradient or grid) or smaller boxes.
- [ ] The rock still reads as a plinth: try more, smaller lumps, small crystals over it, and sparser druse.
- [ ] Rainbow cracks look grainy behind frosted faces.
- [ ] Edge aliasing while turning (1 sample per pixel).
