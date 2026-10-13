# Leaf

One leaf (or one sprig) centred on the screen, drawn as if backlit on a light table against a dark background. Nothing moves on its own; changing a category morphs the shape. Raw WebGL2.

Forked from Foliage: `shapes.js` is a copy of Foliage's geometry (blade outline, lobes, margin, veins and veinlets, stalk, sprigs), raised to far higher resolution (`NMAX` 420 points a side, up to 40 segments a vein) since only one object is drawn. Its `buildShapes(P, B, arrangement, variety)` builds one leaf variant, or six plus one sprig in stem mode (Leaf variety jitters them). The collision circles it still computes are unused here. Fixes to the geometry in either sketch should be copied to the other.

## Files

| File | Role | Edit when |
|---|---|---|
| `params.js` | Every default. Shape groups as Foliage's (Margin split from Lobes); Light table and Colour are this sketch's own. | Any control |
| `shapes.js` | Geometry (forked from Foliage, see above). | Leaf or stem shape |
| `shaders.js` | Background pass and leaf pass. | The look |
| `sketch.js` | Morph weights, rebuild-on-change, fitting the object to the screen, GL. | New select, new buffer |

## How it's drawn

- **Fit.** After every rebuild the object's box is measured (leaf vertices, or for a sprig the stem's vertices plus each placed leaf's box corners). It's rotated tip up and scaled so its larger side is Scale × 90% of the screen's short side, centred.
- **Background** pass: the background colour with its own broad mottle, in screen space.
- **Blade:** lit tissue colour, mottled; broken into capillary cells (a Voronoi network in leaf coordinates, cell borders = capillaries) plus a finer, fainter network inside each cell; each cell slightly brighter or darker (Cell variation); darkening toward the rim. Networks fade out (rather than shimmer) when cells get smaller than a few pixels.
- **Veins:** a glowing core (Vein glow sets its share of the width) inside darker edges. **Outline** and **stem**: solid, the stem edged in the outline colour.
- **Mottle per layer:** each layer (background, blade, capillary, vein, outline, stem) reads its own offset into the noise texture, in leaf coordinates, so the mottles are independent and stick to the leaf.

## Performance budget

- **Drawn on demand.** The leaf is still, so `frame()` returns without drawing when nothing changed (no param edit, morph, rebuild or resize); WebGL keeps the last image on screen. Redrawing a full-screen capillary network every frame kept the GPU busy, and Chrome's own UI shares that GPU, so the whole tab and the mouse stuttered. Consequence: `bench.mjs` fps for this sketch measures the idle loop, not drawing. Measure drawing by driving changes (e.g. dragging a slider) instead.
- **Uploads use `bufferData`, never `bufferSubData`.** Writing into a buffer the GPU is still drawing from made the browser wait for the GPU (one upload stalled 3.8 s); `bufferData` gets fresh storage.
- Memory is flat across hundreds of rebuilds (JS heap 1–2 MB); nothing is held between them.

- The blade runs two Voronoi lookups per pixel (9 + 25 cell hashes each). It only covers the leaf, but at Scale 2 that's most of the screen: check the benchmark if you add a third.
- Geometry rebuilds only on shape changes; at this resolution a rebuild is a few ms for a simple leaf, more for compound leaves and sprigs.

## Benchmarks

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-13 | M3, Chrome headless | `bench.mjs leaf --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706) | 116 |
