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

