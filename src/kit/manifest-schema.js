// What a sketch's manifest.js may contain. The build (src/lib/sketches.ts) and
// scripts/check.mjs both validate against it, and the `Manifest` type is inferred from it.
// Defaults for the optional fields are in manifest.js.

import { z } from 'astro/zod';

export const manifestSchema = z
  .object({
    /** Shown as "Name (Year)" in the index caption and the tab title. */
    name: z.string().trim().min(1),
    /** The year the sketch was first made. */
    year: z.number().int().min(1990).max(2100),
    /** Key of a colour param that drives the page background and theme-color. */
    pageColour: z.string().optional(),
    /**
     * Seconds a preset takes to morph in, unless the sketch works it out per morph
     * (`presetSeconds()`); capture's preset sequences always use this.
     */
    presetSeconds: z.number().min(0).optional(),
    /**
     * Cycle through the presets when the page opens: a random one at once, then on in order
     * (`sequence`, or the menu's), each held for `hold` seconds, then morphing to the next (as
     * long as the morph needs), round and round. Opening the settings pane stops it (a morph
     * under way finishes); it starts again next visit. Off for capture mode and for
     * prefers-reduced-motion. Nothing it applies is saved.
     */
    autoplay: z.object({ hold: z.number().min(0).optional(), sequence: z.array(z.string()).min(1).optional() }).strict().optional(),
    /** Open with scene time paused (the play button shows Play). Ignored by captures. */
    startPaused: z.boolean().optional(),
    /** Defaults for scripts/capture.mjs, so re-captures match. */
    capture: z
      .object({
        seconds: z.number().positive(),
        start: z.number().min(0),
        fps: z.number().positive(),
        crf: z.number().int().min(0).max(51),
        pingpong: z.boolean(),
        /** Params to sweep during the clip: from → to and back, eased, over the whole clip. */
        animate: z.record(z.string(), z.tuple([z.number(), z.number()])),
        /**
         * Morph through presets instead: hold each for `hold` seconds, then morph to the next
         * over presetSeconds; the last morphs back to the first, so it loops.
         */
        presets: z.object({ sequence: z.array(z.string()).min(1), hold: z.number().min(0).optional() }).strict(),
        /**
         * A preset for the link preview (share.jpg) instead of the clip's first frame. The home
         * page's still (cover.jpg) is always the clip's first frame, so the video fades in
         * over it seamlessly.
         */
        share: z.string(),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();
