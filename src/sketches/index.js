/**
 * The site's own metadata, and which sketches the home page lists.
 *
 * `listed` is the home page, in order: first in the list is first on the page. Every other
 * sketch folder is unlisted: its page still builds at its own URL, standalone (no back arrow,
 * since it's shared directly, unless opened from jackbush.github.io), and the home page shows
 * it only with ?all (or #all), below the list, alphabetically. New sketches start unlisted; publishing adds them here.
 */
export default {
  /** The site's name: the home page title, the home-screen name, and " | Glimmers" on sketch pages. */
  name: 'Glimmers',

  /** Meta and share description, for every page. */
  description: 'Little looks into other worlds.',

  listed: [
    'sprig',
    'geode',
    'atlas-nights',
    'blackstar',
  ],
};
