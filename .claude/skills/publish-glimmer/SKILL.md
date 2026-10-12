---
name: publish-glimmer
description: Put a finished glimmer on the home page — register it in the index, make sure its cover is captured and current, check its params, scan its code for performance problems, and benchmark it on the real GPU. Use when asked to publish a glimmer or sketch, or when a sketch in src/sketches/<slug>/ is ready to go live.
---

# Publishing a glimmer

Input: a sketch folder that works (usually from `new-glimmer`). Output: the sketch on the home page with a current cover, plus a report of everything found.

This skill **reports and asks; it never rewrites the sketch on its own.** It edits only `src/sketches/index.js`, the cover files, and the benchmark table in the sketch's `NOTES.md`. Performance findings are warnings for the owner to decide on.

## 1. Register it on the home page

Look for the slug in `sketches` in `src/sketches/index.js`:

- **Commented out** (`// 'rain',`, how `new-glimmer` leaves it): uncomment it.
- **Absent:** ask where it should go (first in the list is first on the page); default to the top.
- **Already there, uncommented:** nothing to do. Say so; don't add a second line.

## 2. Check the manifest

- `name` and `year` are set. The name reads as a name: it's shown as "Name (Year)" in the caption and tab title.
- If `pageColour` is set, it names a colour param (`scripts/check.mjs` errors otherwise).

## 3. Check the params

```bash
node scripts/check.mjs <slug>
```

Expect `0 errors`. Report each warning: unused params, missing tooltips, labels over 18 characters.

## 4. The cover

The cover is `cover.mp4` + `cover.jpg` in the sketch folder, made by `scripts/capture.mjs`, which reads the sketch's `capture` settings from `manifest.js`.

- **Missing**, or **older than the last commit touching the sketch's code or defaults** (`git log -1 --format=%ct -- src/sketches/<slug>/{sketch.js,params.js,shader.js,*.js}` vs `git log -1 --format=%ct -- src/sketches/<slug>/cover.mp4`, or file mtimes for uncommitted work): run `node scripts/capture.mjs <slug>`.
- Look at it: extract the first and middle frames (`ffmpeg -i cover.mp4 -vf "select='eq(n,0)+eq(n,90)',scale=840:-2,tile=1x2" -frames:v 1 <scratchpad>/cover.png`) and read the PNG. An empty or black frame usually means the sketch needs a `capture.start` so something has happened before recording.
- **Size:** report it. Over **3MB**, warn, and suggest a higher `capture.crf` (grain and noise are the usual cause; Blackstar uses 29) or fewer `seconds`. Don't change the manifest without asking.
- **Motion:** if the sketch's interest comes from params the viewer would change (Mindflow's brain data), sweep them with `capture.animate: { key: [from, to] }`, which goes from → to → from over the clip, eased. Use `pingpong: false` with it, since the sweep already loops.
- **Loop:** ping-pong (forwards then backwards) is the default. If the motion looks wrong reversed (falling, flowing one way), suggest `pingpong: false` with a `start` in the steady state, as Cubeland does.

## 5. Static performance scan

Read `sketch.js`, every helper it imports from its folder, and (for WebGL) the shaders. Look at `frame()`, `resize()` and everything they call. Report each finding with `file:line`:

- **Allocation in the loop:** `new`, `[]`/`{}` literals, closures/arrow functions, spread, `map`/`filter`/`forEach`/`for…of`, string building, especially colour strings (`` `rgba(${…})` ``, `'#' + …`), and `Color.set('<string>')`/`setStyle` in three.js. Allocation that only happens when a param changes (guarded by `model.version` or a cached value) is fine; say so.
- **Canvas 2D:** per-frame `getImageData`/`putImageData`, `shadowBlur`, `ctx.filter`, `save`/`restore` or `fillStyle` changes inside per-element inner loops, one path/stroke per element where batching would work.
- **Complexity:** nested loops over the same set (O(n²)): give n at the param's default and at its **max**, and the pair count at the max.
- **Frame-rate dependence:** motion that steps per frame instead of using `dt`/`t`.
- **three.js:** geometries, materials or textures created per frame or never disposed; many meshes where an `InstancedMesh` would do; `setPixelRatio(devicePixelRatio)` (the kit already sizes the canvas).
- **WebGL shaders:** a rough count of noise calls (`snoise`, `fbm*`) and hash chains per pixel in each pass, against the budget in the sketch's `NOTES.md`; textures sampled inside branches; loops without constant bounds.
- **DOM writes** from the loop.

## 6. Benchmark on the real GPU

```bash
node scripts/bench.mjs <slug> --fixed --size 2560x1440 --dpr 2
node scripts/bench.mjs <slug> --size 2560x1440 --dpr 2     # with adaptive quality, if the sketch has it
```

- `error` in the output means the sketch failed to start: stop and report it.
- **Below 60fps** with `--fixed` at that size: warn, and point at the likeliest cause from step 5.
- Compare with the last row in the sketch's `NOTES.md` benchmark table. Add a row (date, machine, command, fps). Call out a drop of more than ~15%.
- Numbers come from headless Chrome on this machine, and the frame scheduling is noisy run to run: treat differences under ~10% as noise.

## 7. Build and look

```bash
npm run build && npm run check
```

Expect 0 errors from both. Then `npm run preview` and confirm the sketch shows at `http://localhost:4321/glimmers/` in its `index.js` position, its cover plays, and its page opens from it.

## Hand it back

- Whether the sketch went into the index, was already there, or is waiting on where it should go.
- Cover: recaptured or current, its size, and any warning.
- Check warnings from step 3.
- Performance findings from step 5, most serious first, as warnings, not fixes.
- The fps numbers and how they compare with the last run.
- That it goes live on the next push to `main`, if nothing above blocks it.
