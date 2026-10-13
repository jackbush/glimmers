# Foliage

A generative leaf designer. Every leaf on the page comes from one shared set of botanical params (leaf type, outline, base, apex, lobing, margin, venation, stalk, surface, stem), copied as `variants` jittered takes and packed edge to edge like a William Morris wallpaper. Raw WebGL2.

## Files

| File | Role | Edit when |
|---|---|---|
| `params.js` | Every default. Selects are the botanical categories. | Any new, changed or removed control |
| `shapes.js` | CPU geometry: leaf variants, sprig variants, collision circles. Option tables at the top. | Any change to leaf or stem shape |
| `physics.js` | Packing and wind: bodies made of circles, relaxed on a wrapping world. | How leaves move or pack |
| `shaders.js` | The four passes (leaves, blur ×2, composite). | Any change to the look |
| `sketch.js` | Engine: morph weights, rebuild-on-change, body count, instances, GL passes. | New pass/target, new select, new buffer |

## How it works

- **Morphs.** Each select option is a row of continuous numbers (`OUTLINE`, `BASE`, `APEX`, `LOBING` in shapes.js; margins, venations and leaf types are weights directly). `sketch.js` eases one weight per option over Morph time, and the geometry uses the weighted sum, so switching category morphs. Compound layouts share slots (0 = terminal leaflet, then pairs from the tip) so leaflets move rather than swap. `arrangement` and `terminal` don't morph: changing arrangement fades the old set of bodies out while the new one grows in.
- **Geometry** is rebuilt only when a shape param changes (a signature over `GEOM_KEYS`) or a morph is running, into preallocated buffers (`MAX_VERTS`). A blade is a half-width profile `sin(πt)^e` (widest point via `t = u^γ`, base/apex exponents), then a cordate sinus cut from a point on the midrib, pinnate lobes (width modulation) or palmate lobes (radius modulation around a palm point), then the margin as an offset along the normal in arc length, then wobble. Fills are quads from a midrib anchor out to the outline, which tolerates "impossible" self-intersecting shapes. Strokes are centre lines plus normals and half-widths, extruded in the vertex shader so they keep a minimum px width.
- **Turnovers.** The tip of a turned leaflet is copied, mirrored across a fold line, and drawn as a flap in the underside colour. Each vertex carries its signed distance past the fold, so the front discards what's folded away and the flap keeps only that part (exact, because the distance is linear).
- **Packing.** Each variant gets up to `MAX_CIRC` collision circles. Simple leaves: circles *inscribed* in the blade, picked greedily by how much uncovered outline each one covers (a covering hull holds neighbours off at the narrow ends and caps density at ~0.35). Mostly-compound leaves: a covering hull (cells along the main axis). Petioles get a chain of small circles. Sprigs carry their leaves' biggest circles plus stem circles. Physics is overdamped position relaxation with a speed cap (Glide), a torque from off-centre contacts (Twist), on a torus a margin larger than the screen, so leaves can drift off one edge and back on the other unseen.
- **How many leaves.** Fill × world area ÷ (leaf length² × mean size² × footprint). Footprint is a leaf's ink area (or most of its hull if compound, 1.5× hull for sprigs), inflated by the gap around its mean circle radius. If the page still can't relax (sustained overlap > 25% of the gap), `crowd` thins it; it's ignored for 2.5 s after any change, while leaves are still gliding apart.
- **Wind.** A drift along Direction plus curl-noise gusts (divergence-free, so leaves swirl without bunching up and leaving holes), and a per-leaf angle sway. Wind runs on scene time; settling runs on real time, so leaves still glide into place while paused.

## Passes

1. `leaves` (full res, premultiplied RGBA8): one instanced draw per variant (WebGL2 has no base instance, so each variant's run is bound at its own offset). Stems first, then leaves. Fills shade per pixel: half shade, edge shade, hatching (fades out before it aliases), gloss, underside. Strokes: analytic AA, swelling via the noise texture, broken line.
2. `blur` ×2 (¼ res): the leaves' coverage, blurred, for the shadow.
3. `composite`: paper (mottle, fibre, tooth) → shadow → leaves with uneven ink → vignette → static grain.

## Gotchas

- Fill quads are 6 vertices (anchor, outline, …). Anything that samples vertices with a stride must use one coprime with 6, or it only ever sees midrib anchors (that made the first collision circles midrib-thin).
- All-at-once spawning of branchy sprigs interlocks into jams that relaxation can't undo. The first settle grows everything in from nothing together instead.

## Performance budget

- JS per frame at defaults: ~1 ms (M3). A slider drag rebuilds geometry each frame: ~6 ms for simple leaves, ~20 ms for bipinnate with 11 pinnae (the worst case, ~280k vertices).
- Physics cost scales with bodies × circles: tiny leaves (< 80 px) use fewer circles.
- GPU: one composite pass with a few texture taps and no noise calls; the leaves pass is geometry-bound.

## Benchmarks

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-13 | M3, Chrome headless | `bench.mjs foliage --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706) | 149–166 (two runs) |
