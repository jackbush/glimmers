/**
 * The site's own metadata, and which sketches appear on the home page.
 *
 * `sketches` sets the order: first in the list is first on the page. Comment a line out to
 * hide a sketch — its page still builds at its own URL, it just isn't linked from the index.
 */
export default {
  /** The site's name: the home page title, the home-screen name, and " | Glimmers" on sketch pages. */
  name: 'Glimmers',

  /** Meta and share description, for every page. */
  description: 'Little looks into other worlds.',

  sketches: [
    'blackstar',
    'sprig',
    'orb',
    'constellations',
    'cubeland',
    // 'mindflow',
  ],
};
