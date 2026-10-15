# Atlas Nights

A December night from the Moroccan Atlas, facing south, looped in about a minute: a short burst of twilight, the stars come out brightest first, real constellations trace themselves in as they rise and fade as they set, with the odd shooting star, under film grain. New glimmer at `src/sketches/atlas-nights/`, year 2026. The 2016 Constellations stays as it is.

**References** (in `~/repos/albums/src/albums/2025-sunbirds/`):
- `media/IMG_1171.jpg`: the horizon and the twilight colours. "How nuts it was" is the bar: the colours should be as rich as this photo, not a polite gradient.
- `b-roll/IMG_5863.jpg`: a night sky full of stars, for star density and brightness by eye.

## Sampled from IMG_1171 (a 40×40 downsample; y is 0 at the top)

| y | left (sun side) | centre | right (away from sun) |
|---|---|---|---|
| 0.0–0.3 | `#080a0b` | `#070c0e` | `#090b0e` |
| 0.51 | `#0a0e1b` | `#0f1220` | `#090d18` |
| 0.66 | `#181c3b` | `#302a48` | `#0a152d` |
| 0.71 | `#292a4b` | `#4f405b` (mauve) | `#0c1b3a` |
| 0.81 | `#6e616f` | `#948284` | `#2b405f` |
| 0.86 | `#95817a` | `#b5a093` | `#50626e` |
| 0.91 | `#b99976` | `#d0b99c` (cream) | `#6d6f66` |
| 0.96 | `#904814` → `#c58847` | `#daac72` | ridge |
| 0.99 | `#3f180a` (burnt orange) | ridge | ridge |

- **Zenith** is neutral near-black, not blue. The colour lives in the bottom ~35%.
- **Glow:** a warm column centred left of centre, mauve arching over it, a cool blue-teal flank on the far side.
- **Ridge:** flat and almost nothing on the left, rising from about x = 0.4 to roughly 7% of the height on the right, with one small peak near x = 0.78.

## Decisions (agreed)

- New sketch `atlas-nights`, name "Atlas Nights", hidden until `publish-glimmer`.
- Real sky: an observer at 31.6°N facing south (azimuth 180°). Stars from the Yale Bright Star Catalogue (public domain) down to magnitude ~6. Constellation lines from d3-celestial (BSD-3: keep its notice next to the data).
- Phones show a narrower portrait slice of the same view.
- Out of scope: Moon, planets, real dates and precession. The Milky Way is a stretch goal once the core is done.

## Decided by me (say if you disagree)

- **The sky does one full turn per loop.** The local sidereal time advances 24h each cycle. That loops seamlessly with no jumps or state. It also means one night shows far more sky than a real one (autumn constellations in the west at dusk, Orion through the middle, Leo and Scorpius by dawn): not real, but more to watch. The dusk sky is set to a real December evening. A param controls where in the sky the loop starts.
- **Everything is a pure function of time.** Twilight, which stars are visible, how far each constellation has traced in and its fade all come from scene time, with no stored "revealed at" state. Speed, pause, seeking and cover capture then all behave, and nothing can get stuck half-drawn.
- **Twilight:** the sun's depression angle follows a curve over the cycle. It sits deep below the horizon for most of the loop and peaks just below it (it never rises), so the "day" is a short blue-hour break. The evening glow is in the south-west (screen right) and the morning glow in the south-east (screen left), so dusk and dawn appear on opposite sides.
- **The ridge** is traced from the photo, not generated: its silhouette is sampled into a height profile and committed as data. The left side is flat, so it extends naturally on wide screens.

## Plan

### 0. Shared film layer (refactor, no visual change to Blackstar)
- [x] Capture a Blackstar baseline: `bench.mjs blackstar --fixed --shot` at fixed times. Run it twice to prove the output is deterministic.
- [x] Move Blackstar's grain and dust GLSL (and its hash) into `src/kit/` as a shared GLSL chunk, plus the standard film params if they move cleanly. Blackstar imports them back.
- [x] Re-shoot and diff against the baseline: the pixels must be identical. Run `scripts/check.mjs`.

### 1. Data
- [x] `scripts/sky-data.mjs`: download the BSC and d3-celestial lines, keep the stars seen from 31.6°N, and write a compact `src/sketches/atlas-nights/sky.js`: per star RA, Dec, magnitude and B-V packed in typed arrays; per constellation its line segments in drawing order, plus a centre.
- [x] `ridge` profile traced from IMG_1171 into the same data file (or `ridge.js`), with the script that traced it.
- [x] Check the sizes. Target: under ~60KB gzipped for everything.

### 2. Scaffold (`new-glimmer`)
- [x] `manifest.js`, `params.js` (`playback({ quality: true })` plus seed), `NOTES.md`, and a WebGL2 `sketch.js` engine in Blackstar's shape. All design logic goes in `shader.js`.

### 3. Rendering (done; as built, see NOTES.md)
Passes, in order:
1. **Sky** (full screen): a twilight ramp by altitude (colour-stop params seeded from the table above), plus a glow centred on the sun's azimuth (warm near the sun, cool blue around it), both scaled by the sun's depression. The night sky is neutral near-black.
2. **Stars** (instanced points, additive): each star is placed by alt/az in the vertex shader from RA/Dec and the per-frame sidereal time. Stereographic projection centred on south, with the field of view on the shorter screen axis as a param. Brightness comes from magnitude against a limiting magnitude that rises as the sky darkens, so the brightest appear first. Colour comes from B-V. Near the horizon stars are dimmed, reddened and twinkle harder. Bright stars get a soft halo inside their own sprite (no blur pass).
3. **Constellation lines** (instanced quads): each segment's reveal is a function of the constellation's hour angle (rising → traces in star by star, in line order) and of how dark the sky is. Lines fade out as the constellation sinks into the west. Thin core plus a dim glow, as in the old sketch.
4. **Shooting stars:** seeded Poisson timing at about one per loop, a short tapered streak that brightens then fades. Mid-December is the Geminids, so they radiate from Gemini when it's up.
5. **Composite:** stars over the sky → ridge silhouette (a 1D height texture, an anti-aliased edge, slightly lit by the twilight) → vignette → grain last (from the shared film layer). Grain is fine and even, strongest in the darks, as in the photo. No dust by default.

Params: night length (default ~75s, tune by eye), twilight share and peak, ramp colours, glow colours and width, field of view and view altitude, star brightness, size and limiting magnitude, twinkle, line widths and opacities, reveal speed, shooting-star rate, ridge height and colour, grain. Each layer gets an amount param, and 0 makes it invisible.

### 4. Verify
- [x] `node scripts/check.mjs`.
- [x] Screenshots at fixed times: dusk, early stars, deep night (Orion), dawn, and the twilight peak. Compare the twilight shot side by side with IMG_1171. Check that Orion, the Plough and the Pleiades are where they should be (against Stellarium or similar).
- [x] Check a portrait phone size (390×844 @3).
- [x] Benchmark `--fixed --size 2560x1440 --dpr 2`, record it in NOTES, then `pgrep -fl glimmers-chrome`.
- [x] Interruptions: Speed changes, pause, seed and param edits mid-reveal, and resize. Nothing should jump or stick.

### 5. Later
- [ ] Remove `startPaused: true` from `atlas-nights/manifest.js` (temporary, for tuning the twilight) before publishing.
- [ ] Milky Way band along the galactic plane, in the sky pass at ¼ resolution.
- [ ] `publish-glimmer`: index, cover capture (start in early twilight, as the first stars come out), perf scan.

## Review (2026-10-14)

- **Built:** `src/sketches/atlas-nights/`, hidden from the index. Checks and `astro check` pass.
- **Shared code:** the film layer moved to `src/kit/film.js`, frame uniforms and the header to `kit/gl.js`, `hash1`/`hash2` to `kit/random.js`, and the params↔GLSL check to `scripts/lib/shader-check.mjs`. Blackstar's stills are pixel-identical before and after (sha1 of two fixed-time stills, deterministic over two baseline runs).
- **Changed from the plan:**
  - The projection is pinhole (gnomonic), not stereographic: stereographic bent the horizon into a bowl. The pinhole keeps the horizon and constellation lines straight, like the photo.
  - Star cores have a minimum width (sub-pixel stars vanished).
  - Lines show over a narrower hour-angle window (−4 → −2 to trace in, 0 → 2.5 to fade).
  - `sky.js` is 74KB gzipped, over the 60KB target. I kept every star rather than packing them tighter.
- **Benchmark:** 167fps at 4300×2706 on an M3 (Blackstar 114 in the same runs).
- **Verified by eye:**
  - Twilight peak against IMG_1171, plus dusk, night, dawn and a portrait phone.
  - Orion, Taurus, the Pleiades, Sirius, Leo and Hydra sit in the right places relative to each other.
  - Shooting stars: 10 in 8 loops at the default rate.
- **Not done:** an exact position check against Stellarium; interruptions only reasoned about (everything is a function of time, nothing stored), not exercised in a browser.
- **Found on the way:** `ensureServer().stop()` in `scripts/lib/chrome.mjs` doesn't stop the `astro preview` it starts, and `capture.mjs` doesn't stop it at all when the page fails to boot. Servers stayed on the port until I killed them. Not fixed here.
