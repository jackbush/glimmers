---
name: new-glimmer
description: Start a new sketch in glimmers — scaffold its folder (manifest, params, sketch, notes) and leave it unlisted (live at its URL, on the index only with ?all) until it's published. Use when the user wants to make a new glimmer, sketch, toy or animation in this repo, or to bring in an existing sketch from elsewhere.
---

# Starting a new glimmer

Output: a working, empty sketch at `src/sketches/<slug>/`, reachable at `/glimmers/<slug>/`. It's unlisted: shown on the index only with `?all`, and standalone (no back arrow). `publish-glimmer` moves it to the front page later.

## 1. Pick the slug and name

- **The folder name is the URL.** Lowercase letters, numbers and single hyphens (`orb`, `rain-2`). Anything else fails the build. Renaming later breaks links, so get it right now.
- `name` is what people see, shown in the index caption and the tab title. Ask the user if they haven't given one; don't invent a clever title.
- `year` is the year the sketch was first made (this year for a new one; ask when bringing in an old sketch). It isn't shown at present, but every manifest keeps it.

## 2. Pick the renderer

- **Canvas 2D** for shapes, lines and particles in the low thousands. The default.
- **Raw WebGL2** for per-pixel work (fields, noise, film effects). Copy Blackstar's structure (`sketch.js` engine + `shader.js`, full-screen passes), or Atlas Nights' for points and lines drawn as geometry, and pass `quality: true` to `playback()` so it gets adaptive quality. Film grain and dust come from `src/kit/film.js` (GLSL plus the Grain & damage params); a `check.mjs` that calls `scripts/lib/shader-check.mjs` keeps params and GLSL in step.
- **three.js** (already a dependency) for 3D. See Cubeland: `InstancedMesh`, `renderer.setPixelRatio(1)`, `renderer.setSize(w, h, false)` in `resize`.

## 3. Write the files

`manifest.js`:
```js
/** @type {import('../../kit/types').Manifest} */
export default {
  name: 'Rain',
  year: 2026,
  pageColour: 'background', // a colour param; the page and browser bars take its value
};
```

`params.js`: start with `playback()`, then the sketch's own groups. Every tunable number and colour becomes a param (see `glimmers-elements` for the rules):
```js
import { playback } from '../../kit/standard.js';

export default [
  playback({}, {
    extra: [
      { key: 'seed', label: 'Seed', value: 1, min: 0, max: 100, step: 1, desc: 'A different random take.' },
    ],
  }),
  {
    group: 'Scene',
    params: [
      { key: 'background', label: 'Background', type: 'color', value: '#000000', desc: 'Page and canvas background.' },
    ],
  },
];
```

`sketch.js` (Canvas 2D stub):
```js
// <Name> — <one line on what it is and how it works>.

import { rng } from '../../kit/random.js';

/** @type {import('../../kit/types').Sketch} */
export default function create({ canvas, P }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
  let w = 1, h = 1, px = 1;

  return {
    resize(width, height, pxRatio) { w = width; h = height; px = pxRatio; },
    frame(t, dt, rt, rdt) {
      ctx.fillStyle = P.background.value;
      ctx.fillRect(0, 0, w, h);
      // draw here: no allocation per frame (see glimmers-elements)
    },
  };
}
```

`NOTES.md`: a heading, one paragraph on what the sketch is and how it works, anything surprising, and an empty benchmarks table:
```markdown
| Date | Machine | Command | fps |
|---|---|---|---|
```

## 4. Check and show it

1. `node scripts/check.mjs <slug>`: 0 errors. (A "no cover" warning is expected until it's published.)
2. `node scripts/bench.mjs <slug> --size 1280x800 --shot <scratchpad>/shot.png` and read the PNG.
3. Tell the user its local URL (`npm run dev`, then `http://localhost:4321/glimmers/<slug>/`) and that it's unlisted (on the index only with `?all`) until they publish it.
