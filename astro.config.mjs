// @ts-check
import { defineConfig } from 'astro/config';

import versionFile from './integrations/version-file.mjs';

// Published at https://jackbush.github.io/glimmers/
// `base` must match the repo name exactly, or every asset 404s.
export default defineConfig({
  integrations: [versionFile()],

  site: 'https://jackbush.github.io',
  base: '/glimmers',

  build: {
    // Emit `blackstar/index.html` rather than `blackstar.html` so paths work under `base`.
    format: 'directory',
  },
  vite: {
    build: {
      // Keeps media queries in the `max-width` form older Safari reads.
      cssTarget: ['chrome100', 'safari15', 'firefox100'],
      // Never inline video as a data: URI — it defeats range requests.
      assetsInlineLimit: (file) => (/\.(mp4|webm|mov)$/i.test(file) ? false : undefined),
    },
  },
});
