# Glimmers — build

Spec: ~/.claude/plans/ethereal-finding-sunset.md

## 1. Kit + Blackstar
- [x] Astro scaffold (`base: /glimmers/`, directory format), version-file integration, deploy workflow
- [x] Kit: params/saved settings, pane (right), cog + back, Space/Escape, loop + adaptive quality, new-build check, capture mode
- [x] Blackstar ported (shader.js unchanged apart from the module wrapper; params.js uses `playback()`)
- [x] Parity: same frame rate as the old standalone build under one harness; renders the same

## 2. Index + covers
- [x] Index: single column ≤840px, 16:10 video covers, name captions, only on-screen covers play, reduced motion → posters
- [x] `scripts/capture.mjs` (fixed timestep via `?capture`, ping-pong or straight, per-sketch settings in manifest)
- [x] Covers for all four (0.3–2MB)

## 3. Ports
- [x] The Blob → Canvas 2D (N points, dt-based; irregularity param approximates the original's uneven spacing)
- [x] Constellations → Canvas 2D (batched lines, cached colours, typed arrays)
- [x] Cubeland → three.js InstancedMesh, click to drop + auto drop
- [x] Compared with the live originals

## 4. Scripts + skills
- [x] `check.mjs` (+ Blackstar's GLSL hook), `bench.mjs` (multi-sketch, counts rendered frames)
- [x] Skills: glimmers-state, glimmers-elements, new-glimmer, publish-glimmer
- [x] CLAUDE.md, README, NOTES.md per sketch, lessons

## 5. Outward-facing (each needs the owner's go-ahead)
- [ ] First commit
- [ ] `gh repo create jackbush/glimmers --public`, push, Pages source = GitHub Actions, check first deploy
- [ ] Old repos: replace Pages with a redirect (blackstar → /glimmers/blackstar/, the-blob → /glimmers/orb/, constellations, cubeland), README pointer
- [ ] Archive the four old repos

## Review
- `npm run check`: 0 errors (astro check + params check). `bench.mjs --fixed --size 2560x1440 --dpr 2` (M3): Blackstar 148, Cubeland 170, Constellations 466, The Blob 562.
- UI checks (headless, scripted): defaults on/closed; cog opens; Escape closes; Space hides and carries across sketches; edits persist per sketch; Copy blob has `sketch`; Reset clears; back link correct; all four render without errors.
- Not verified yet: real Safari/iOS, a real deploy (version.json jump), publish-glimmer run end to end as a skill.

---

# Foliage (new sketch, 2026-10-13)

A generative leaf designer. One shared species, many copies packed across the viewport like a Morris wallpaper. Slug `foliage`, year 2026, hidden from the index until it's published.

## Decisions
- One shared parameter set. Each leaf gets a seed jitter, and a **Variety** slider spreads the continuous params. The choices (simple/compound, outline, margin…) are shared by all leaves.
- Each choice is built from continuous numbers underneath, so switching **morphs** over ~0.5s.
- No "size band" param: **Scale** and **Size variance** cover it.
- Packing covers the viewport, and leaves may cross off-screen. Leaves never touch. They jiggle to tessellate, and they glide when params change.
- **Wind** param: sway and drift, while the packing always holds.
- Arrangement: **No stem** (default) / Alternate / Opposite / Whorled. With a stem, the sprig is one rigid-ish body, and two sprigs never touch.
- Look: woodblock print. Imperfections, varied stroke widths, turnovers show the underside, glossy = highlight stroke, hairy = edge stipple. Classy, not chintz.
- No click interaction.
- Renderer: WebGL2 (signed off)

## Plan
- [x] Scaffold with `new-glimmer` (manifest, params, sketch, NOTES)
- [x] Geometry (CPU, rebuilt only when params change): outline function (outline × base × apex × lobing × margin × L:W) → polyline → triangulate; compound layouts (pinnate/bipinnate/palmate/trifoliate + leaflet count) reuse the leaflet outline; veins (pinnate/palmate/parallel/arcuate); petiole (length, flattened, winged, stipules)
- [x] Imperfections: wobble along the outline, an uneven outline of variable width (tapered brush strips), vein width taper, ink misregistration offset
- [x] Stem section: arrangement, divergence (distichous 180° ↔ spiral 137.5°, shown as foreshortening), decussate, whorl count, nodes, internode length + taper, insertion angle + tip change, size gradient, stem width + taper, curvature, droop, zigzag, terminal (leaf/bud/bare), stem colour
- [x] Packing: each leaf/sprig is a body approximated by a few circles along its axis; soft repulsion + slight rotation torque; target spacing gap; fills the viewport plus a margin; count derived from scale; smoothing on param changes
- [x] Wind: low-frequency noise field → per-body angle and offset, amplitude = wind
- [x] Render: geometry pass into an MSAA target (per-leaf transforms from a float texture, one draw), then a composite pass (paper ground, ink mottle, soft contact shadow/AO from the leaf mask at ¼ res, grain)
- [x] Palette: Morris greens/indigo ground, sage/olive/willow fills, madder/ochre accent, paler underside
- [x] `check.mjs`, `bench --shot`, `bench --fixed --size 2560x1440 --dpr 2`; NOTES.md with perf budget + benchmark

## Foliage review
- Kit: new `select` param type (dropdown): types, params coerce, panel, check.mjs, pane CSS, glimmers-elements docs.
- `node scripts/check.mjs`: 0 errors across all sketches; `astro check` 0 errors.
- Bench (M3, `--fixed --size 2560x1440 --dpr 2`): 149–166 fps. JS ~1 ms/frame at defaults; slider drags 6 ms (simple) to ~20–35 ms (bipinnate 11, worst case).
- Visually checked: default, pinnate, bipinnate, palmate compound, palmate lobed, oak, holly, cordate, alternate/opposite/whorled sprigs, mid-morph, rescale, full wind.
- Not done: cover capture and index listing (publish-glimmer), real Safari/iOS.
