# Orb

Translucent layers of an undulating closed curve sharing a centre. Canvas 2D.

Ported from the p5 sketch in `jackbush/the-blob` (it was called The Blob there). Each layer has `points` control points around a circle; each point swings between ±`spread` of its own resting radius, fastest through the middle and easing at the ends, and turns back near each limit. Smaller points swing faster (rate ÷ size factor), which keeps the layers drifting in and out of step. The outline is a closed Catmull-Rom curve drawn as Béziers.

- The original had five points at uneven angles: it called p5's `cos(18)`/`cos(54)` in radians, not degrees. The port spaces points evenly and adds the `irregularity` param, so the shape is close but not identical.
- Point state lives in typed arrays sized for `MAX_LAYERS × MAX_POINTS` and is regenerated only when `seed`, `points`, `sizeJitter` or `irregularity` change. The fill colour string is rebuilt only when a param changes.
- Cost is trivial: `layers × points` Bézier segments and `layers` fills per frame.

## Benchmarks

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-12 | M3, Chrome headless | `bench.mjs orb --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706) | 562 |
