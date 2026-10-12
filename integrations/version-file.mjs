// Writes dist/version.json with the build id, so open tabs can notice a newer deploy
// (see src/kit/version.ts). The id comes from PUBLIC_BUILD, which the Pages workflow
// sets to the short commit hash; local builds aren't stamped and skip the check.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** @returns {import('astro').AstroIntegration} */
export default function versionFile() {
  return {
    name: 'version-file',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const version = process.env.PUBLIC_BUILD || 'dev';
        writeFileSync(fileURLToPath(new URL('version.json', dir)), JSON.stringify({ version }) + '\n');
      },
    },
  };
}
