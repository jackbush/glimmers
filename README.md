<img src="docs/blackstar.gif" width="840" alt="Blackstar: a black orb with a burning halo">

## Run locally

```sh
npm install
npm run dev      # http://localhost:4321/glimmers/
npm run build    # writes dist/
npm run check    # type check + params check for every sketch
```

## Controls

- **Space** hides or shows the buttons. The setting is shared by every sketch and remembered.
- **Cog** (top right) opens the settings pane. **Escape** closes it. Every page opens with it closed, unless its URL ends `#settings`.
- Sketches with `autoplay` in their manifest (Sprig) cycle through their presets (from a random one, then in menu order) until you open the settings pane; they start again next visit.
- **Play/pause** (in settings) freezes the scene.
- **Back arrow** (top left) goes back to the index. Sketches the index doesn't list are standalone and don't have one.
- Edit any parameter, then **Copy changes** and paste the result to Claude to make it the new default. Double-click a label to reset one parameter, or use **[reset]** for all of them. A moved slider keeps a grey mark at its default; one pinned at an end offers **↔** to re-centre its range on the value (not for sliders ending at 1 or 100, or at a 0 floor). Untick the box by the changes count to see the defaults again for a before/after comparison.

## Add a sketch

Each sketch is a folder in `src/sketches/`. **The folder name is the URL.**

| File | Purpose |
|---|---|
| `manifest.js` | The name and year (the year isn't shown at present), the page colour, and the cover capture settings |
| `params.js` | Every default value. The settings pane is generated from it |
| `sketch.js` | `create({ canvas, P })` → `{ resize, frame }` |
| `NOTES.md` | How the sketch works, its performance budget, and its benchmark history |
| `cover.mp4`, `cover.jpg`, `share.jpg` | The index cover and the page's link-preview image, made by `scripts/capture.mjs` |

`src/sketches/index.js` controls which sketches the index lists (`listed`), and in what order. Every other sketch is unlisted: it still builds at its own URL, standalone, and shows below the list, alphabetically in two columns, only at `/glimmers/?all` (or `#all`).

Claude skills do the routine work: `new-glimmer` scaffolds a sketch, `glimmers-elements` adds or changes things, `glimmers-state` applies pasted settings, and `publish-glimmer` puts a sketch on the index after checking its cover and performance.

## Scripts

```sh
node scripts/check.mjs [slug…]     # params ↔ code consistency
node scripts/capture.mjs <slug>    # record the cover video (needs ffmpeg: brew install ffmpeg)
node scripts/bench.mjs [slug…] --fixed --size 2560x1440 --dpr 2   # real-GPU fps in headless Chrome
```

`capture` and `bench` build the site and start `astro preview` themselves.

`node scripts/site-images.mjs` re-renders the share image (`public/share.jpg`, 1200×630) and the icons from Blackstar.
