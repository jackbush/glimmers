---
name: publish-glimmer
description: Put a finished glimmer on the home page — move it from the `more` section to the front page, make sure its cover is captured and current, check its params, scan its code for performance problems, and benchmark it on the real GPU. Use when asked to publish a glimmer or sketch, or when a sketch in src/sketches/<slug>/ is ready to go live.
---

# Publishing a glimmer

Input: a sketch folder that works (usually from `new-glimmer`). Output: the sketch on the home page with a current cover, plus a report of everything found.

This skill **reports and asks; it never rewrites the sketch on its own.** It edits only `src/sketches/index.js`, the cover files, and the benchmark table in the sketch's `NOTES.md`, plus whatever the owner chooses in step 3's zero-params question. Performance findings are warnings for the owner to decide on.

## 1. Move it to the front page

The front page is `sketches` in `src/sketches/index.js`; `more` is for sketches that are live but only shown with `?all`. New sketches start at the top of `more` (`new-glimmer` puts them there), so publishing moves the slug from `more` to `sketches`:

- **In `more`** (the usual case): take it out of `more` and add it to `sketches`. Ask where (first in the list is first on the page); default to the top.
- **Commented out** in either list, or **absent**: ask where it should go, as above.
- **Already in `sketches`**, uncommented: nothing to do. Say so; don't add a second line.

## 2. Check the manifest

- `name` and `year` are set. The name reads as a name: it's the caption and the tab title (the year isn't shown at present).
- If `pageColour` is set, it names a colour param (`scripts/check.mjs` errors otherwise).

## 3. Check the params

```bash
node scripts/check.mjs <slug>
```

Expect `0 errors`. Report each warning: unused params, missing tooltips, labels over 18 characters.

**Params set to zero.** List every range param in `params.js` whose default is 0 (and, for a bool that switches a feature on, `false`), with its group and label, plus the params hidden under it (`when: { key, not: [0] }` dependents), since a zero there usually means a whole feature ships switched off. Ignore params where 0 is an ordinary setting rather than "off" (an angle, an offset, a position like Start). Then ask the owner, for each (or all at once):

- **Cut it:** remove the feature for simplicity, following the `glimmers-elements` skill's *Removing an element or param* (code, params, dependents, then `check.mjs`); or
- **Keep it, noted:** add a line to the sketch's `NOTES.md` saying it's off by default and kept on purpose (e.g. "Vignette: 0 by default; kept for covers that need a darker frame").

Don't do either without an answer.

## 4. The cover

The cover is `cover.mp4` + `cover.jpg` in the sketch folder, plus `share.jpg` (the page's 1200×630 link-preview image), all made by `scripts/capture.mjs`, which reads the sketch's `capture` settings from `manifest.js`.

- **Missing**, or **older than the last commit touching the sketch's code or defaults** (`git log -1 --format=%ct -- src/sketches/<slug>/{sketch.js,params.js,shader.js,*.js}` vs `git log -1 --format=%ct -- src/sketches/<slug>/cover.mp4`, or file mtimes for uncommitted work): run `node scripts/capture.mjs <slug>`.
- Look at `share.jpg` too: it's what a shared link shows.
- Look at the cover: extract the first and middle frames (`ffmpeg -i cover.mp4 -vf "select='eq(n,0)+eq(n,90)',scale=840:-2,tile=1x2" -frames:v 1 <scratchpad>/cover.png`) and read the PNG. An empty or black frame usually means the sketch needs a `capture.start` so something has happened before recording.
- **Size:** report it. Over **3MB**, warn, and suggest a higher `capture.crf` (grain and noise are the usual cause; Blackstar uses 29) or fewer `seconds`. Don't change the manifest without asking.
- **Motion:** if the sketch's interest comes from params the viewer would change (Mindflow's brain data), sweep them with `capture.animate: { key: [from, to] }`, which goes from → to → from over the clip, eased. Use `pingpong: false` with it, since the sweep already loops.
- **Cover-only settings:** `capture.set: { key: value }` holds params for the clip and its stills without touching the defaults (e.g. a faster loop); `capture.pointer: [x, y]` parks a mouse on the frame (shares of width and height) for sketches with hover effects. Atlas Nights uses both.
- **Loop:** ping-pong (forwards then backwards) is the default. If the motion looks wrong reversed (falling, flowing one way), suggest `pingpong: false` with a `start` in the steady state, as Cubeland does.

## 5. Static performance scan

Read `sketch.js`, every helper it imports from its folder, and (for WebGL) the shaders. Look at `frame()`, `resize()` and everything they call. Report each finding with `file:line`:

- **Allocation in the loop:** `new`, `[]`/`{}` literals, closures/arrow functions, spread, `map`/`filter`/`forEach`/`for…of`, string building, especially colour strings (`` `rgba(${…})` ``, `'#' + …`), and `Color.set('<string>')`/`setStyle` in three.js. Allocation that only happens when a param changes (guarded by `model.version` or a cached value) is fine; say so.
- **Canvas 2D:** per-frame `getImageData`/`putImageData`, `shadowBlur`, `ctx.filter`, `save`/`restore` or `fillStyle` changes inside per-element inner loops, one path/stroke per element where batching would work.
- **Complexity:** nested loops over the same set (O(n²)): give n at the param's default and at its **max**, and the pair count at the max.
- **Frame-rate dependence:** motion that steps per frame instead of using `dt`/`t`.
- **three.js:** geometries, materials or textures created per frame (or replaced without disposing the old ones); many meshes where an `InstancedMesh` would do; `setPixelRatio(devicePixelRatio)` (the kit already sizes the canvas).
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

First re-read `src/sketches/index.js`. If the slug isn't in `sketches` (uncommented), or is still in `more`, **warn at the top of the report**: the sketch isn't on the front page, so it isn't published yet.

- Whether the sketch moved to `sketches` (and where), was already there, or is waiting on where it should go.
- Cover: recaptured or current, its size, and any warning.
- Check warnings from step 3, and the params at zero with what the owner chose for each.
- Performance findings from step 5, most serious first, as warnings, not fixes.
- The fps numbers and how they compare with the last run.
- That it goes live on the next push to `main`, if nothing above blocks it.
