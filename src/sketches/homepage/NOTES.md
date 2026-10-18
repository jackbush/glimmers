# Homepage

A prototype of jackbush.github.io's light/dark switch, under the real page's copy (`page.js`, from the site's `content.json`), to get the animation right before it moves into the site. All DOM and SVG, no WebGL: the kit's canvas stays hidden, and its frame loop drives the switch.

One colour, Theme colour, sets the whole theme: it's the Projects page and the Roles text, and its inverse is the Projects text and the Roles page. The backdrop (`backdrop.js`) is an SVG at the bottom of the page in the theme's page colour. A Projects/Roles switch (`switches.js`) starts at the click (the tab's centre from the keyboard), Start size across, and grows outwards, accelerating, until it has passed the whole screen. Switches sit in page coordinates, so they scroll with the page. Its outline is Blackstar's: a closed Catmull-Rom spline through a few radii round the click, each swinging in and out on its own sine wave (Shape group), sampled at 256 angles each frame. The backdrop fills that outline with the new page colour. The intro stays and changes colour as the switch passes it; the old list fades out, and the new list shows only inside the switch as it spreads, through an SVG polygon clip of the same 256 points, so the two edges match.

While a switch runs, the page bends near its edge (Warp group): an SVG displacement filter on `.hp` moves every pixel along the radius, Strength px at the edge, easing to nothing Width px away on either side along a tan curve (Curve), with the sign flipping across the edge. Positive is a lens on each side, so lines stretch towards the edge and kink as they cross it; negative draws each side from across the edge, doubling a strip of each. Page, text and edge bend together because the filter is on the whole page.

The browser's bars take one flat colour, so they follow the page along the top edge, changing Bars lead before a switch covers it (`topEdge` in `switches.js`, as on the site).

## Files

| File | Role |
|---|---|
| `params.js` | Every default. |
| `backdrop.js` | The page colours under the text (base + one polygon per switch), and the warp: its filter and its displacement map. |
| `theme.js` | The theme colour in use: the Theme colour param, or with Hue from window on, an OKLCH colour set by where the window sits on its screen: across is hue, down is lightness from white to Min lightness (polled every frame, since moving a window fires no event). The backdrop, page, card wash and bars all read it; nothing is saved. At lightness 0.85, chroma up to 0.074 fits sRGB at every hue and the inverse text passes AA; lighter passes too. |
| `switches.js` | Each switch's click, reach and outline (`radius`, 256 samples per switch, in page px), and when it has covered the screen. Runs on its own real-time clock, so a switch plays out while paused. |
| `page.js` | The page over the backdrop: markup, CSS, the toggle, the contrast flicker. Its colours come from params. |
| `ink.js` | The blend-layer colours that turn a page colour into its text colour (its inverse), and the contrast maths. |
| `content.json` | Fallback copy: a snapshot of the site's `content.json` (intro, projects, roles, covers as absolute URLs, made by the site's `src/pages/content.json.ts`). The page draws from it at once, then fetches the live one (`content-url.js`) and lays out again if it differs. `scripts/homepage-content.mjs` refreshes it after every commit and commits the change on its own (the post-commit hook in `.githooks`). |
| `sketch.js` | Wiring. No design logic. |

## Surprises

- **Text colour follows the switch.** Each page's text is its inverse (1 − page), main text, borders and lines at full strength, minor text at Minor text opacity. The page is laid out four times (`page.js`): one real, interactive copy with transparent text, and three aria-hidden, inert copies that only draw text in blend layers over the backdrop (multiply, difference, plus-lighter). Per channel they map the page colour under each glyph to its inverse at the text's opacity (`ink.js`), so text flips pixel by pixel as the switch passes. The toggle and the cards are drawn the same way: the frame, card boxes, the lines between roles and the other tab's label in the text colour, the current tab filled with it and its label a gap in the fill (the identity colour for each layer), so nothing ever uses the other page's colours. The backdrop sits inside `.hp`, which isolates, so the blends meet exactly the backdrop: nothing outside the page can break them, and the warp filter can go on `.hp` without changing them. The document scrolls, as on the site.
- **Card wash:** behind each card's text, the theme colour at Card opacity, blended over the backdrop in the real copy: `screen` on a bright theme (HSB brightness from 50%), `multiply` on a dark one. Blending the colour with itself keeps its hue and adds saturation, where a white or black wash greys it.
- **Contrast:** main and minor text below WCAG AA (4.5:1) on its page flickers, tabs included.
- The ink copies drop their images, videos and iframes; cover boxes keep their size without them.
- With reduced motion, a switch is instant, so nothing warps.
- **The warp's map comes from the page itself.** Browsers won't displace by a map that feImage draws from an element (Chrome ignores the displacement; the element could leak another origin's pixels), only by an image URL (which loads a frame or more late) or by the filtered element's own pixels. So the map is drawn in the backdrop, a screen's width plus a gap left of the screen, over neutral grey. The filter's region covers both; feOffset brings the map onto the screen, feDisplacementMap bends the page by it, and every step is cropped to the screen, so the map never shows. The original page goes under the bent one, for the slivers bent in from beyond the screen's sides. The map is two quads per wedge (128 wedges) round each switch's edge, inside and outside, each with a gradient across the band along the edge's normal. Their colour is the wedge's direction (red x, green y, ½ none), and their stops trace the curve; they're shared between switches through gradient `href`s. `crispEdges` keeps seams between quads from leaving lines of no warp.
- **SVG lengths moved from script start as plain numbers.** A filter region's or gradient's lengths default to percentages, and setting `baseVal.value` on a percentage keeps it a percentage of the (zero-size) SVG, so they're created as `0`.
- **Taps during a switch** land where things are, not where the warp draws them, a few px off inside the band for well under a second.

## Performance budget

At rest it's a static page: no filter, nothing moves. During a switch, per frame: 256 points per switch for its fill and the list clip, 256 quads and gradients per switch for the warp map, then one displacement filter over the screen. Chrome does the filter on the GPU; iPhone Safari is untested.

`bench.mjs` counts the kit's frames, which only tick as fast as the page repaints: at rest nothing changes, so it reads the display rate (~60). For the cost of a switch, step switches back to back (Demo switch 0.8 s) in capture mode from a rAF loop and count frames.

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-16 | M3 | `--fixed --size 2560x1440 --dpr 2` | 720 |
| 2026-10-16 | M3 | `--fixed --size 2560x1440 --dpr 2`, one theme colour | 810 |
| 2026-10-18 | M3 | DOM/SVG backdrop, `bench.mjs --fixed --size 2560x1440 --dpr 2` (at rest; see above) | 62 |
| 2026-10-18 | M3 | 2560×1440 @2, switches back to back, Warp off / on | 650–1130 / 245–295 |
| 2026-10-18 | M3, SwiftShader | 390×844 @3, switches back to back, Warp off / on | 1760–2550 / 540–670 |
