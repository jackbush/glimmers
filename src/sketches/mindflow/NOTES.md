# Mindflow

Two circles in a Venn diagram, driven by two "brain data" sliders. WebGL2.

From `jackbush/mindflow` (2015), a MEAN-stack app that streamed eSense **attention** and **meditation** (0–100) from a NeuroSky headset over socket.io into p5 sketches. This is its `circleVisualisation`, which combined the two single-value games (`overlapGame`: attention → overlap; `outlineGame`: meditation → outline). The headset is gone, so both values are sliders in the **Brain data** group, at the top of the pane.

- **Attention:** each circle sits `(1 − attention/100) × separation × diameter` from the centre. The original used `200 − 2 × attention` px with a diameter of 0.8 × window height. `separation` 0.28 is that at a ~900px-tall window.
- **Meditation:** each circle is drawn three times per tick: once true, and twice stretched by random amounts up to `(1 − meditation/100) × jitter × diameter`. The original used `50 − meditation/2` px; `jitter` 0.07 is that at ~900px tall.
- **Trails:** nothing is cleared. Each tick fades the picture toward the background by `fade` (the original's `background(255, 255, 255, 10)`), then paints the six ellipses (fill, then stroke, each in order, like p5).
- **Fixed ticks:** the original drew once per frame at p5's 60fps. Here ticks run at `tickRate` on scene time, so trail density doesn't change with the screen's refresh rate, and Pause freezes the picture. At most 8 ticks run per frame.
- Dropped from the original: the 25px downward offset (room for the app's header) and the fallback when there was no headset (attention jittering randomly between 0 and 7.5).

## Why WebGL, not Canvas 2D

The p5 original, and the first Canvas 2D port, faded an 8-bit canvas. A low-alpha fade stalls once the remaining difference rounds to zero: at fade 0.04, every pixel sticks ~12 levels short of the background. That left light grey ghosts wherever the jittering strokes had been, and over-saturated the fill over time (each tick's fill kept adding, but the fade couldn't take the last levels away).

Now the picture accumulates in a half-float texture (ping-pong between two), and the fade has a minimum step (`u_minStep`, ~0.4 of a level per tick). Half-float alone still stalled ~3 levels short, because its rounding can truncate. A test that jitters wildly, then calms for 8 s, reads exactly 255 in the band the strokes covered. On GPUs without renderable half-float, it falls back to 8-bit with a one-level minimum step.

Ellipses are drawn in the shader with an approximate signed distance (the implicit function over its gradient length). It's exact for circles and close for these near-circles. Fill coverage is `clamp(0.5 − d)`, and stroke coverage is `clamp(width/2 + 0.5 − |d|)`.

**Resizing** (the pane sliding open) copies the old texture into the new size, keeping its scale relative to the height and its centre, so the trails survive instead of being wiped.

## Cover

`capture.animate` sweeps attention 50 → 100 and meditation 60 → 100, then back, over the 10 s clip (eased), so the circles coalesce into one calm circle and open out again. It isn't a ping-pong: the sweep ends where it starts, so the loop is seamless.

## Benchmarks

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-12 | M3, Chrome headless | `bench.mjs mindflow --fixed --size 2560x1440 --dpr 2` (pane open, canvas 4300×2706), WebGL version | 509 |
