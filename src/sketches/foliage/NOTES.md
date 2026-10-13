# Foliage

A generative leaf designer. Every leaf on the page comes from one shared set of botanical params (leaf type, outline, base, apex, lobing, margin, venation, stalk, surface, stem), copied as `variants` jittered takes and packed edge to edge like a William Morris wallpaper. Raw WebGL2.

## Files

| File | Role | Edit when |
|---|---|---|
| `params.js` | Every default. Selects are the botanical categories. | Any new, changed or removed control |
| `shapes.js` | CPU geometry: leaf variants, sprig variants, collision circles. Option tables at the top. | Any change to leaf or stem shape |
| `physics.js` | Packing: key, outward growth, relaxation, overlap deletion, sway. | How leaves move or pack |
| `shaders.js` | The single leaf pass. | Any change to the look |
| `sketch.js` | Engine: morph weights, rebuild-on-change, key/regrow life cycle, instances, GL. | New select, new buffer |

## How it works

- **Morphs.** Each select option is a row of continuous numbers (`OUTLINE`, `BASE`, `APEX`, `LOBING` in shapes.js; margins, venations and leaf types are weights directly). `sketch.js` eases one weight per option over Morph time, and the geometry uses the weighted sum, so switching category morphs. Compound layouts share slots (0 = terminal leaflet, then pairs from the tip) so leaflets move rather than swap. `arrangement` and `terminal` don't morph: changing arrangement fades the old set of bodies out while the new one grows in.
- **Geometry** is rebuilt only when a shape param changes (a signature over `GEOM_KEYS`) or a morph is running, into preallocated buffers (`MAX_VERTS`). A blade is a half-width profile `sin(πt)^e` (widest point via `t = u^γ`, base/apex exponents), then a cordate sinus cut from a point on the midrib, pinnate lobes (width modulation) or palmate lobes (radius modulation around a palm point), then the margin as an offset along the normal in arc length, then wobble. Fills are quads from a midrib anchor out to the outline, which tolerates "impossible" self-intersecting shapes. Strokes are centre lines plus normals and half-widths, extruded in the vertex shader so they keep a minimum px width.
- **Underside up.** A share of bodies (Underside up) lie the other side up: drawn mirrored (physics uses the same flip for collisions) in the underside inks, veins printed dark.
- **Packing.** Each variant gets up to `MAX_CIRC` collision circles. Simple leaves: circles *inscribed* in the blade, picked greedily by how much uncovered outline each one covers (a covering hull holds neighbours off at the narrow ends). Mostly-compound leaves: a covering hull (cells along the main axis). Petioles get a chain of small circles. Sprigs carry their leaves' biggest circles plus stem circles. Collisions always use a body's full size at full breath, so breathing never causes contact.
- **Key and growth.** One key body is pinned at the centre (it never moves and is never deleted for overlapping). New bodies are placed only where they fit, at the most central fitting spot among candidates beside random live bodies, at the Cascade rate, so the page grows outward. The page counts as full after 12 straight frames where nothing fits. Gather pulls everything gently toward the key; relaxation (overdamped, speed-capped by Glide, with Twist torque) holds the gap against it, which keeps the pattern compact and opens room at the edges.
- **Overlap → delete.** Two bodies whose circles actually intersect would jitter against each other, so the one farther from the key is deleted on the spot: it freezes and fades over 0.5 s.
- **Regrow.** Once full, recent deletions (> 20% of the page) or refills (> 30%), each decaying over ~1.5 s, mean quick changes have made the page chaotic or holey: everything but the key is cleared and the page grows again. Key only does the same and holds it; changing between stem and no stem regrows from a new key.
- **Breathing.** Each body's drawn scale is `1 + depth · sin(2π · rate · t + phase)`, with the phase falling behind with distance from the key (a slow ripple) plus a little jitter.
- **Wind** only sways each leaf about its own centre (no drift: drift would fight the pinned key). Off by default.

## Pass

One pass, straight to the canvas (cleared to the ground colour): one instanced draw per variant (WebGL2 has no base instance, so each variant's run is bound at its own offset), stems first, then leaves, premultiplied, each instance with its own fade.

Everything is printed as a woodcut or etching would allow: flat inks, no gradients. Fills are one flat ink (surface/underside × normal/autumn). Tone comes only from hatching: solid ink lines, evenly spaced in leaf units (chevrons off the midrib, like the veins). A shade amount S (high near the margin, and further in and along the midrib on each leaf's own −y half) sets each line's *width*, so lines swell toward the edge and taper to points; where S is high a second set doubles the *density*, and a steeper cross-hatch set joins in the darkest parts. Widths are capped so lines never close up into a solid tone, and lines too fine for the current size are left out rather than smeared. Every edge (fill, line, hatch) is torn by fine screen-space noise (Ragged edge), and lines break where the block printed light. Veinlets add etched cross-veins between secondaries (geometry).

## Gotchas

- Fill quads are 6 vertices (anchor, outline, …). Anything that samples vertices with a stride must use one coprime with 6, or it only ever sees midrib anchors (that made the first collision circles midrib-thin). Same for the circle-fit candidates (4 per spoke: the stride is kept odd), and sampling strides must round *up*, or the sample fills before the second side of the leaf (both bugs left lobed leaves half-covered, so they overlapped).
- Veins aimed into lobes can cross the sinus between them; secondaries stop where they leave the blade and veinlets that would cross outside are skipped.
- Holly-like spiny margins need more circles than `MAX_CIRC` (one per spine), so spine tips are only ~85% covered and can touch neighbours.
- All-at-once spawning of branchy sprigs interlocks into jams that relaxation can't undo. The first settle grows everything in from nothing together instead.

## Performance budget

- JS per frame at defaults: ~1 ms (M3). A slider drag rebuilds geometry each frame: ~6 ms for simple leaves, ~20 ms for bipinnate with 11 pinnae (the worst case, ~280k vertices).
- Physics cost scales with bodies × circles: tiny leaves (< 80 px) use fewer circles.
- GPU: a single geometry-bound pass, two noise-texture taps per fill pixel for the ink.

## Benchmarks

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-13 | M3, Chrome headless | `bench.mjs foliage --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706), v1: 4 passes with shadow + paper | 149–166 (two runs) |
| 2026-10-13 | M3, Chrome headless | same, `--seconds 6`, v2: single pass, key + growth | 430 (readout ~530 once grown; 194 in a 4 s window that caught the initial growth) |
| 2026-10-13 | M3, Chrome headless | same, `--seconds 6`, v3: woodcut shading (flat inks, line hatching, veinlets) | 482 |
