// Defaults for the optional manifest fields, shared by the page (run.ts) and the cover
// capture (scripts/capture.mjs), so a captured preset sequence keeps the page's timing.
// The schema itself is in manifest-schema.js (build time only: it pulls in zod).

export const MANIFEST_DEFAULTS = {
  /** Seconds a preset takes to morph in. */
  presetSeconds: 1.5,
  /** Seconds autoplay holds each preset. */
  autoplayHold: 1,
  capture: { seconds: 6, start: 0, fps: 30, crf: 26, pingpong: true, presetHold: 1.5 },
};
