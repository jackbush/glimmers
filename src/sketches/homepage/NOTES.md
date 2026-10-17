# Homepage

A prototype of jackbush.github.io's light/dark switch, under a copy of the real page (`page.js`, `content.js`), to get the animation right before it moves into the site. Raw WebGL2, one full-resolution pass.

One colour, Theme colour, sets the whole theme: it's the Projects page and the Roles text, and its inverse is the Projects text and the Roles page. The backdrop is the theme's page colour. A Projects/Roles switch (`switches.js`) starts at the click (the tab's centre from the keyboard), Start size across, and grows outwards, accelerating, until it has passed the whole screen. Its outline is Blackstar's: a closed Catmull-Rom spline through a few radii round the click, each swinging in and out on its own sine wave (Shape group). The intro stays and changes colour as the switch passes it; the old list fades out, and the new list shows only inside the switch as it spreads. That's an SVG polygon clip of 256 points on the list, set each frame from the same spline (`radiusAt` in `switches.js`; the shader's `ringOffset` is the same spline in GLSL), so its edge is the canvas's edge.

The browser's bars take one flat colour, so they follow the page along the top edge, changing Bars lead before a switch covers it (`topEdge` in `switches.js`, as on the site).

## Files

| File | Role |
|---|---|
| `params.js` | Every default. |
| `shader.js` | The GLSL, and `perFrame()`. |
| `switches.js` | Each switch's click, reach and outline → `f_switch`, `f_ring`. Runs on its own real-time clock, so a switch plays out while paused. |
| `page.js` | The page over the canvas: markup, CSS, the toggle, the contrast flicker. Its colours come from params. |
| `ink.js` | The blend-layer colours that turn a page colour into its text colour (its inverse), and the contrast maths. |
| `content.js` | The site's projects and roles, copied from `jackbush.github.io/src/data/`. The intro copy is in `page.js`. |
| `covers/` | Downscaled copies of the site's covers; the glimmers' own come from their folders. |
| `sketch.js` | WebGL engine and wiring. No design logic. |

## Surprises

- **Text colour follows the switch.** Each page's text is its inverse (1 − page), main text, borders and lines at full strength, minor text at Minor opacity. The page is laid out four times (`page.js`): one real, interactive copy with transparent text, and three aria-hidden, inert copies that only draw text in blend layers over the canvas (multiply, difference, plus-lighter). Per channel they map the page colour under each glyph to its inverse at the text's opacity (`ink.js`), so text flips pixel by pixel as the switch passes. The toggle and the cards are drawn the same way: the frame, card boxes, the lines between roles and the other tab's label in the text colour, the current tab filled with it and its label a gap in the fill (the identity colour for each layer), so nothing ever uses the other page's colours. Nothing between the ink copies and the canvas may isolate them, or the blends only meet each other and the text goes dark in Roles: `.hp` must stay no stacking context, and the document scrolls (as on the site), not `.hp`, since Safari isolates a scroller's content.
- **Contrast:** main and minor text below WCAG AA (4.5:1) on its page flickers, tabs included.
- The ink copies drop their images, videos and iframes; cover boxes keep their size without them.
- With reduced motion, a switch is instant.

## Performance budget

Per pixel: a loop over up to 2 switches, each a spline lookup. Cheap.

| Date | Machine | Command | fps |
|---|---|---|---|
| 2026-10-16 | M3 | `--fixed --size 2560x1440 --dpr 2` | 720 |
| 2026-10-16 | M3 | `--fixed --size 2560x1440 --dpr 2`, one theme colour | 810 |
