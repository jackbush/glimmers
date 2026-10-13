# Leaf

One leaf (or one sprig) centred on the screen, drawn as a botanical study on warm paper. Finish → Style picks Outline (plain 0.1 mm fineliner), Shaded pen (+ hand hatching, line only) or Watercolour (+ a wash). Nothing moves on its own; changing a category morphs the shape. Raw WebGL2.

`shapes.js` builds the geometry (blade outline, lobes, margin, veins and veinlets, stalk, sprigs) at high resolution (`NMAX` 420 points a side, up to 40 segments a vein), since only one object is drawn. `buildShapes(P, B, variety)` builds the leaf variants and the sprig. (It was forked from an earlier packing sketch, Foliage, now deleted; the collision-circle code left over from that is unused.)

## Files

| File | Role | Edit when |
|---|---|---|
| `params.js` | Every default: shape groups, then Finish (style, pen, watercolour, colours), plus species presets. | Any control |
| `shapes.js` | Geometry (see above). | Leaf or stem shape |
| `shaders.js` | Background pass and leaf pass. | The look |
| `sketch.js` | Morph weights, rebuild-on-change, fitting the object to the screen, GL. | New select, new buffer |
| `TODO.md` | Trees the engine can't draw yet (conifers, ginkgo, palms, thorns, fruit), with their looks, palettes and the features they need. | Adding an engine feature |

## Species presets

`params.js` exports `presets`: each species is the current shape defaults (all groups but Finish, minus Scale and Morph time) plus its own overrides, so a species always lands on the same leaf. It also sets the colours (leaf, shade, stem and bud, and the paper), and leaves the rest of Finish (style, pen, wash) alone. Most are in summer green; Aspen, Beech, Cherry and Field maple are in autumn colour (gold to scarlet, copper, orange to crimson, butter-yellow). Each paper is a very pale pastel from roughly opposite the leaf's hue (lilacs, roses, periwinkle under greens; blues and celadon under the autumn ones), or opposite a strong stem or leaf colour (apricot under the blue-grey of Willow and Eucalyptus, celadon under Dogwood's red twig). There are 28, in alphabetical order. Node counts run 3–10 to suit the tree (big trees long sprigs, spur-leaved and opposite ones short), never 2, which looks unfinished. Hawthorn, Sweet gum, Tulip tree, Silk tree, Lilac and Hornbeam were cut (see TODO.md for Hawthorn and Tulip tree). Whitebeam's silver underside is its shade colour set paler than its wash. Morphs between very different types (simple to compound, opposite to alternate) are smooth but busier; the cover sticks to similar trees. Colours glide during the morph, page colour included. A preset morph takes 4 s (manifest `presetSeconds`); the cover (manifest `capture.presets`) holds each of Oak, Elm and Beech for 1 s and morphs between them (Oak, Elm and Beech are all simple, alternate and two-ranked, so they morph into each other cleanly). Everything morphs, including arrangement (see below).

## Smooth morphs and sway

- **Presets morph on one clock.** The sketch implements the kit's `morph(seconds)`, so a preset's numbers and selects land in P at once (the kit glides only the colours). `beginMorph` builds the final shape once to measure its box, then every eased number, every select weight and the framing move from where they are to where they end on one ease-in-out curve. Previously the kit glided the numbers, the sketch chased them on a second ease (Morph time), and the selects and framing chased on their own; things started abruptly, landed at different times, and the framing followed every wobble. A geometry change mid-morph (a slider) ends it, and the chase takes over from there.
- **Nothing passes through in-between layouts.** Moves must be monotonic: three things weren't, and made leaves shiver in big morphs (all three cover morphs, worst on Elm → Ash). (1) The leaflet count eased through every count, and odd and even counts lay out differently (terminal or not, pairs offset), so leaflets slid up and back and the terminal grew and shrank once per count: it now eases as pairs and terminal (`leafletPairs`, `leafletTerm` in PE) and `blendLayouts` blends the four layouts around them, with slots keyed by identity (bipinnate side leaflets from a fixed slot, `PINNA_SIDE`). (2) The stem's zigzag kinks snapped to the next point of a sample grid that slides as the stem's length eases, so every leaf's angle saw-toothed by up to the zigzag angle: kinks now sit exactly on the nodes, and each leaf takes the kink's bisector. (3) On lobed leaves each vein end snapped to the nearest lobe tip, jumping lobe to lobe as the vein count eased: it now hands over smoothly. A probe that simulates the morph through shapes.js and counts direction reversals of each leaf's on-screen centre went from 256 / 230 / 89 (Oak → Elm / Elm → Ash / Ash → Oak) to 0 / 2 / 3. Known: palmate venation still rounds the lobe count for its primary veins.
- **Two-phase morphs.** When the leaf type changes (simple ↔ compound, or between compound types), the old leaves shrink back into their nodes over the first 45% of the morph, the leaf's own shape (`LEAF_KEYS`: the Leaf, Lobes, Margin, Veins and Stalk groups) swaps at the midpoint while they're gone, and the new leaves grow out over the last 45%; the stem morphs throughout. Blending straight through turned the old leaves into odd half-compound ones. `leafGrow` scales every placement's presence.
- Shape numbers are eased copies (`PE` in sketch.js), so slider changes glide over Morph time. Counts go fractional while easing, and shapes.js grows the newest node, whorl leaf, leaflet pair (layouts blended either side of the count), vein or veinlet in as the fraction rises.
- Arrangement, Terminal and Bud type are eased weights like the other selects. The sprig is always built: "No stem" is a stem shrunk to nothing bearing only its terminal leaf (curve and zigzag scale with how much stem there is). Each placement carries a presence (`sprigPlace` slot 7); the renderer scales the leaf about where it attaches, so leaves grow out of and shrink into their nodes. Leaf shapes are keyed by node and position, not list index, so they don't swap as the arrangement changes. Alternate leaves take their side from node parity (pressed sprigs alternate), and Divergence only sets how near the stem they press, so nothing swings across the stem as it eases. Outline resolution steps only with the leaflet count rounded up to a power of two (and budgets for the maximum veins), because resampling the outline every frame while counts eased made the teeth shimmer.
- The bud is the end of the stem: drawn first, under every leaf. The tip runs past the last node by the bud's room, and leaves near the tip splay out so it shows.
- The framing eases toward the rebuilt bounds.
- Sway: the sprig rocks about its base and each leaf about its node, on two-sine rhythms with golden-angle phases, in scene time (pausing stops it). It redraws every frame while Sway > 0 (352 fps at 2560×1440 @2x on the M3); at 0 Leaf goes back to drawing only on change. Sway defaults to 0 (it added little), so the cover is still between morphs.

## How it's drawn

- **Fit.** After every rebuild the object's box is measured (leaf vertices, or for a sprig the stem's vertices plus each placed leaf's box corners). It's rotated tip up and scaled so its larger side is Scale × 90% of the screen's short side, centred.
- **Paper** pass: the paper colour with a little tooth.
- **Per leaflet** (stencil): the wash fill marks the stencil; veins are clipped to it; then the pen outline on top. Sprig leaves draw tip first, so leaves nearer the base cover those above.
- **Styles** (`u_style`, set from the Style select by sketch.js): each adds to the one before. Outline fills are bare paper (they still hide what's beneath). Shaded pen adds hatching: solid lines at one pen width, mirrored across the midrib like veins, broken into short strokes that are each kept or dropped so tone comes from how many lines appear (no greys); a cross-hatch family joins in the darkest places; lines too dense to draw are dropped, not blended. Watercolour adds the wash underneath the pen work.
- **Wash:** transparent pigment over paper: one half in the shade colour, bleeding unevenly across the midrib; blooms; granulation from the paper grain (one grain texture, Grain + Grain scale, shared with the paper); a dried rim. Its edge is set by Paper halo ± Halo jitter as a share of each spoke (midrib → margin). Fill vertices carry their spoke length and direction, so for a negative halo the margin vertices are pushed out and the wash overshoots the pen line.
- **Veins:** pass 1 (watercolour) pools pigment along their sides; pass 2 clears hatching and wash from them and draws the pen along both edges (one line down veins too thin for two).
- **Pen:** one fine sepia line width for everything (Finest line px), with occasional skips (Pen skip).

## Gotchas

- **Fill anchors.** The fill is quads from an anchor on the midrib to each outline point. Palmate lobes push the outline along rays from the palm point, so a deep sinus doubles back as seen from the midrib, and the quads filled the notch (Norway maple showed it worst). With palmate lobing the anchors move to the palm point, from which the outline never doubles back.
- **Leaf base vs stalk.** Every stalked simple blade's base flares to at least 1.8× the midrib's half-width (the winged-petiole flare, `wingJoin`), so a wedge base doesn't taper to nothing where it meets a wider stalk (Magnolia). Truncate's base exponent is 0.35 (was 0.2, which drew ruler-straight bottoms).

- **Vertex budget.** Each leaf variant gets an equal share of the buffer (one share kept for the sprig). Mid-morph between two compound types, both layouts' leaflets are out at once and a variant can need more than its share (a bipinnate preset, since cut, with anything was the worst). `buildShapes` rebuilds such a variant at half, then a quarter of the resolution, then cuts it at its share. Before, the buffer overflowed: the stem and the last leaves were cut off, and an empty leaf's box (±1e9) threw the framing out for minutes. Every preset at rest uses under half its share, so none is ever rebuilt. A leaf with no vertices adds nothing to the framing box.

- Shader sources are JS template strings: a backtick in a GLSL comment ends the string and breaks the build.
- A blade's lines go to separate staging buffers (veinlets, veins, midrib, outline) and are appended in draw order. Reordering vertices in place afterwards was the biggest cost in a rebuild.

## Performance budget

- **Drawn on demand.** The leaf is still, so `frame()` returns without drawing when nothing changed (no param edit, morph, rebuild or resize); WebGL keeps the last image on screen. Redrawing a full-screen capillary network every frame kept the GPU busy, and Chrome's own UI shares that GPU, so the whole tab and the mouse stuttered. Consequence: `bench.mjs` fps for this sketch measures the idle loop, not drawing. Measure drawing by driving changes (e.g. dragging a slider) instead.
- **Uploads use `bufferData`, never `bufferSubData`.** Writing into a buffer the GPU is still drawing from made the browser wait for the GPU (one upload stalled 3.8 s); `bufferData` gets fresh storage.
- Memory is flat across hundreds of rebuilds (JS heap 1–2 MB); nothing is held between them.

- The wash is a handful of texture lookups per pixel (the old light-table capillary network was two Voronoi lookups and cost far more). Stress test (drags and flips, 2×): worst frame 48 ms for a whorled sprig drag, ~2–3 ms for simple-leaf drags.
- Geometry rebuilds only on shape changes; at this resolution a rebuild is a few ms for a simple leaf, more for compound leaves and sprigs (Node, M3: Oak 4.7 ms, Elm 5.7 ms, Ash 6.9 ms). A preset morph builds once more at its start, to measure where it ends.

## Benchmarks

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-13 | M3, Chrome headless | `bench.mjs leaf --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706) | 116 |
| 2026-10-13 | M3, Chrome headless | `bench.mjs leaf --fixed --size 2560x1440 --dpr 2 --seconds 5` (pane open) | 58 (idle loop: Leaf draws only on change, so this is the frame-loop rate, not drawing cost) |
| 2026-10-13 | M3, Chrome headless | `bench.mjs leaf --fixed --size 2560x1440 --dpr 2 --seconds 5`, swaying (redraws every frame) | 352 |
| 2026-10-13 | M3, Chrome headless | `bench.mjs leaf --fixed --size 2560x1440 --dpr 2` after the preset rework (defaults unchanged; pane readout 288) | 49 (idle loop) |
| 2026-10-13 | M3, Chrome headless | `bench.mjs leaf --fixed --size 2560x1440 --dpr 2` after the one-clock preset morphs (Sway now 0) | 322 (idle loop) |
