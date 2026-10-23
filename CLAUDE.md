# Glimmers

A home for small browser sketches ("glimmers"): an index page of looping covers, plus one full-screen page per sketch with a shared settings pane. Astro (static), served at `https://jackbush.github.io/glimmers/`. See `README.md` to run it.

- `src/sketches/<slug>/`: one folder per sketch. **The folder name is the URL.** `params.js` holds every default, `sketch.js` draws, `manifest.js` has the name, page colour and capture settings, and `NOTES.md` holds the sketch's architecture, perf budget and benchmark history. **Read a sketch's `NOTES.md` before changing it.**
- `src/sketches/index.js`: `listed` is which sketches the index shows, in order. Every other sketch is unlisted: live at its URL, standalone (no back button, unless opened from jackbush.github.io with `?from=home`), and on the index only with `?all` (or `#all`), alphabetically in two columns below the list.
- `src/kit/`: the shared engine. It covers the param model and saved settings (`params.ts`), the settings pane (`panel.ts`) and its OKHSL colour picker (`colour-picker.ts`, maths in `okhsl.ts`), the buttons and keys (`chrome.ts`), the frame loop and adaptive quality (`loop.ts`), new-build detection (`version.ts`), standard params (`standard.js`), seeded random and hashes (`random.js`), WebGL plumbing (`gl.js`), the film grain and dust and the simplex noise shared by the WebGL sketches (`film.js`, `noise.js`), the manifest schema and defaults (`manifest-schema.js`, `manifest.js`), and boot (`run.ts`). No design logic goes here.
- `src/layouts/SketchLayout.astro`: the canvas, the back button (to jackbush.github.io instead when the URL has `?from=home`, as the site's project links add) and cog, and the pane's markup and CSS. `src/pages/`: the index and the `[slug]` route.
- Scripts:
  - `scripts/check.mjs`: params ↔ code consistency. Run it after every change.
  - `scripts/bench.mjs`: real-GPU fps in headless Chrome.
  - `scripts/capture.mjs`: cover videos. Needs ffmpeg.
  - `scripts/homepage-content.mjs`: refreshes the homepage sketch's fallback copy from the site's live `content.json`. The post-commit hook runs it and commits any change on its own (`.githooks`; enable in a fresh clone with `git config core.hooksPath .githooks`).
  - `scripts/sky-data.mjs`: rebuilds Atlas Nights' star, constellation and ridge data (its hand-made Tuareg set is `scripts/sky-tuareg.mjs`). Needs network and ffmpeg.
  - Both bench and capture rebuild the site and start `astro preview` themselves (or reuse one already serving this dist/; they refuse `astro dev`).
- Site metadata: name and description live in `src/sketches/index.js`; `BaseLayout.astro` builds every page's title, share tags and icons from them. Titles are `Glimmers` on the index and `<Name> | Glimmers` on sketch pages (a manifest's `year` is kept but not shown); the home-screen name is `Glimmers` or the sketch's name. Each sketch page's link preview is its own `share.jpg` (made by `capture.mjs` with the cover); the index uses `public/share.jpg`. `scripts/site-images.mjs` renders that and the home-screen icons from Blackstar, and the favicon's PNG fallback from `public/favicon.svg` (Phosphor's "code" icon on white).
- Skills: `new-glimmer` (scaffold), `glimmers-elements` (add/edit/remove elements and params), `glimmers-state` (apply pasted state blobs), `publish-glimmer` (index + cover + perf scan + benchmark), `sprig-species` (Sprig's tree presets: horticultural naming, colours, checking by eye).
- Deploy: `.github/workflows/deploy.yml` builds on push to `main` with `PUBLIC_BUILD` set to the short commit hash. That hash is stamped into each page and `version.json`, and open tabs jump to a newer build.

## Rules

- Every tunable number or colour is a param in `params.js`, never a magic number in the code.
- `frame()` allocates nothing. See `glimmers-elements` for the rules.
- After a visual change: run `node scripts/check.mjs`, look at a screenshot from `bench.mjs --shot`, and benchmark at `--fixed --size 2560x1440 --dpr 2`. A screenshot proves it renders, not that it's fast.
