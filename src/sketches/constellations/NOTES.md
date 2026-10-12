# Constellations

Drifting stars joined by fading lines when they pass close. Canvas 2D.

Ported from the p5 sketch in `jackbush/constellations`, keeping its look: orbit radius = `wander` ÷ a random factor in [−0.5, 1.5] (so a few stars sweep the whole sky), a glow stroke plus a core stroke per line, a slow hue cycle, four star colours, and halos on stars of at least `glowSize`. Sizes and distances are in CSS px (the sketch draws under a `setTransform(px…)`).

- **Cost grows with the square of `count`:** every pair is distance-checked each frame. 120 stars = 7,140 pairs; the max of 400 = 79,800.
- Lines are batched into `BUCKETS` opacity levels: one path and one stroke per bucket per pass, instead of two strokes per pair. Each bucket holds at most `perBucket` pairs; beyond that, extra pairs are dropped (only reachable with hundreds of stars bunched together).
- Line colours are cached per integer hue, so the frame allocates nothing after the first cycle.
- Lines are drawn before stars (the original interleaved them, so later lines could cross earlier stars).
- Twinkle runs on real time, like the original's frame counter; drift and hue run on scene time.

## Benchmarks

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-12 | M3, Chrome headless | `bench.mjs constellations --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706) | 466 |
