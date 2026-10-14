---
name: glimmers-elements
description: Add, edit, or remove visual elements and parameters in a glimmers sketch (Blackstar, Orb, Constellations, Cubeland, or any sketch under src/sketches/). Use when the user asks for a new effect, layer or control, wants an existing element to behave differently, wants something removed, or when a pasted state blob's message asks for structural changes.
---

# Changing a sketch's elements

**First, read `src/sketches/<slug>/NOTES.md`.** It holds that sketch's architecture, where each kind of work belongs, its performance budget and its benchmark history. The rules below apply to every sketch; the notes say how they apply to this one.

## How a sketch is put together

| File | Role |
|---|---|
| `src/sketches/<slug>/params.js` | **The only place defaults live.** Groups → params; the settings pane is generated from it. Starts with `playback()` from `src/kit/standard.js` (Speed, pixel-ratio cap; `quality: true` adds render scale and target fps, and turns adaptive quality on). |
| `src/sketches/<slug>/sketch.js` | `export default function create({ canvas, P, model, degrade })` → `{ resize(w, h, pxRatio), frame(t, dt, rt, rdt), morph? }`. All drawing lives here (plus any helper files in the folder). WebGL sketches compile and upload params with `src/kit/gl.js`. |
| `src/sketches/<slug>/manifest.js` | `name`, `year`, optional `pageColour` (a colour param key that drives the page background), optional `capture` settings for the cover. The schema is `src/kit/manifest-schema.js`; defaults are in `src/kit/manifest.js`. |
| `src/kit/` | Shared engine: param model and saved settings, pane, buttons and keys, frame loop, adaptive quality. **No design logic.** Change it only for behaviour every sketch should get. |

- `P.<key>.value` is the live value; colour params also have `P.<key>.rgb` (a Float32Array of 0–1 floats, updated in place). `model.version` increments on every edit, so cache anything derived from params and rebuild it only when the version moves.
- `frame(t, dt, rt, rdt)`: `t`/`dt` are scene time and its step, with Speed and the play/pause button applied (dt is 0 while paused). `rt`/`rdt` are real time and its step, which always run (film grain, twinkle, preset morphs). Motion must be driven by `dt` or `t`, never by frame count.
- The kit sizes the canvas in device pixels (`resize` gets `pxRatio` = canvas px per CSS px). Sizes the user thinks of in pixels should be CSS px × `pxRatio`.

## Adding a parameter

1. Add it to the right group in `params.js`, next to related params:
   ```js
   { key: 'haloFlare', label: 'Flare', value: 0.2, min: 0, max: 1, step: 0.01, desc: 'One-line tooltip.' },
   ```
   - `key` is camelCase, unique and descriptive. It's the key in copied state, so treat it as permanent. Don't reuse a standard key (`timeScale`, `renderScale`, `targetFps`, `maxDpr`).
   - `type` is `'range'` (the default), `'color'` (lowercase `'#rrggbb'`), `'bool'` or `'select'` (a dropdown: `options: ['Ovate', 'Cordate']`, and the value is one of those strings).
   - The default must sit inside `[min, max]`. Pick ranges that are useful but not destructive, and pick `step` to suit the precision that matters.
   - `label` stays short (≤ 18 characters, counting the "- " a dependent gets per level) so it fits the 124px label column. `desc` is required because it's the tooltip.
   - If it only matters for some values of another param, add `when: { key: 'style', is: ['Watercolour'] }` (or `not: [...]`; for a number, e.g. `not: [0]`). The pane then shows it only when it applies, straight under its parent with its label marked "- ", and it's left out of the change count and Copy changes while hidden. Put it right after its parent (or the parent's other dependents) in the same group; `check.mjs` enforces that. Only add one where the code confirms the param has no effect otherwise.
2. Read it in the sketch as `P.<key>.value`.
3. Run `node scripts/check.mjs <slug>`.

## Presets

A sketch can `export const presets = { Name: { key: value, … } }` from `params.js`. The pane shows them as a Preset dropdown; picking one morphs every key it names (numbers and colours glide over the manifest's `presetSeconds`, default 1.5 s, or as long as the sketch's own `presetSeconds(values)` says that morph needs; selects and bools switch). A sketch with its own `morph(seconds, name)` gets the preset's name too. Keys it doesn't name are left alone. `check.mjs` validates every key and value. For the cover, `manifest.capture.presets = { sequence: [...], hold }` holds on each preset and morphs to the next, looping. Leaf builds its species presets from the current shape defaults plus overrides; adding or renaming one follows the `leaf-species` skill.

## Adding a visual element

1. Create a new group in `params.js` if the element is distinct. Otherwise extend an existing group.
2. Expose **every** tunable number and colour as a param. The user wants every aspect of the design live-editable, so don't leave magic numbers that a designer would want to touch. Pure implementation constants (hash offsets, buffer sizes) can stay inline.
3. Include an amount/intensity param so that setting it to 0 makes the element disappear.
4. Follow the sketch's NOTES for where the work belongs (e.g. Blackstar's passes).

## Editing an element

- Prefer changing default values over changing the maths. If the behaviour can't be reached with the existing params, change the maths *and* add params for the new degrees of freedom.
- If you change what a param means (its scale or units), update its `desc`, `min`/`max` and default together, so that old pasted state blobs aren't silently misread. Mention the change to the user.

## Removing an element or param

1. Delete the code that uses it.
2. Delete the param(s) from `params.js`. If you're deleting a group's last param, delete the group too.
3. Run `node scripts/check.mjs <slug>`. It warns on params no code uses (and Blackstar's hook errors on shader uniforms with no param).
4. A **rename** counts as a removal plus an addition. Old state blobs will carry the old key, so tell the user (the `glimmers-state` skill looks for renames in git history).

## Performance and garbage-collection rules (non-negotiable)

- **`frame()` and everything it calls must allocate nothing.** No object/array literals, closures, string building (including colour strings like `` `rgba(${…})` ``), `for…of`, spread, `map`/`forEach` in the loop. Preallocate typed arrays; rebuild derived values only when `model.version` changes.
- Canvas 2D: batch strokes and fills into as few paths as possible; avoid `shadowBlur`, `filter`, `getImageData`, and `save`/`restore` in inner loops.
- three.js: never create geometries, materials or `Color`/`Vector3` objects per frame; prefer `InstancedMesh` for many similar objects. (The kit never tears a sketch down: leaving the page does.)
- Loops over pairs are O(n²): keep the param's max where the worst case still holds 60fps.
- No DOM writes from the loop (the kit throttles its own fps readout).
- After a visual change, run `node scripts/bench.mjs <slug> --fixed --size 2560x1440 --dpr 2` and compare with the sketch's NOTES. Add a row if the number moved.

## Verify

1. `node scripts/check.mjs <slug>` reports 0 errors.
2. Render it and look at it: `node scripts/bench.mjs <slug> --size 1280x800 --shot <scratchpad>/shot.png`, then read the PNG. A sketch error makes the script exit non-zero and print `error`. Set the new param to an extreme value (via the pane, or by temporarily changing the default) to confirm it does something.
3. Tell the user which new controls appeared and in which group. If the change shows in the cover, offer to recapture it.
