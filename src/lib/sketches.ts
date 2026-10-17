// Build-time view of src/sketches/: every sketch folder, validated, with its cover resolved.
//
// Pages are built from the folders, not from index.js, so an unlisted sketch is still
// reachable by direct URL: that's how you preview one before publishing it, or share one that
// stands alone.

import { z } from 'astro/zod';
import home from '../sketches/index.js';
import { manifestSchema } from '../kit/manifest-schema.js';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const homeSchema = z
  .object({ name: z.string().trim().min(1), description: z.string().trim().min(1), listed: z.array(z.string()) })
  .strict();

export interface SketchEntry {
  slug: string;
  name: string;
  year: number;
  pageColour?: string;
  /** URLs of the cover video, its poster and the 1200×630 share image, if they've been captured. */
  cover: { video?: string; poster?: string; share?: string };
}

const MANIFESTS = import.meta.glob<{ default: unknown }>('/src/sketches/*/manifest.js', { eager: true });
const COVERS = import.meta.glob<string>('/src/sketches/*/{cover.mp4,cover.jpg,share.jpg}', { eager: true, query: '?url', import: 'default' });

function slugOf(path: string): string {
  return path.split('/')[3];
}

function issues(err: z.ZodError, file: string): string {
  return `${file} is invalid:\n` + err.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

let cache: Map<string, SketchEntry> | null = null;

export function getSketches(): Map<string, SketchEntry> {
  if (cache) return cache;
  const out = new Map<string, SketchEntry>();
  for (const [path, mod] of Object.entries(MANIFESTS)) {
    const slug = slugOf(path);
    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(`src/sketches/${slug}/: folder names are the URL — lowercase letters, numbers and single hyphens only.`);
    }
    const parsed = manifestSchema.safeParse(mod.default);
    if (!parsed.success) throw new Error(issues(parsed.error, `src/sketches/${slug}/manifest.js`));
    out.set(slug, {
      slug,
      ...parsed.data,
      cover: {
        video: COVERS[`/src/sketches/${slug}/cover.mp4`],
        poster: COVERS[`/src/sketches/${slug}/cover.jpg`],
        share: COVERS[`/src/sketches/${slug}/share.jpg`],
      },
    });
  }
  cache = out;
  return out;
}

function getHome() {
  const parsed = homeSchema.safeParse(home);
  if (!parsed.success) throw new Error(issues(parsed.error, 'src/sketches/index.js'));
  return parsed.data;
}

/** The site's name and description, from src/sketches/index.js. */
export function getSite(): { name: string; description: string } {
  const { name, description } = getHome();
  return { name, description };
}

/** The home page's sketches: src/sketches/index.js's `listed`, in order. */
export function getListed(): SketchEntry[] {
  const all = getSketches();
  return getHome().listed.map((slug) => {
    const s = all.get(slug);
    if (!s) throw new Error(`src/sketches/index.js lists "${slug}", but there's no src/sketches/${slug}/manifest.js.`);
    return s;
  });
}

/** Every other sketch, alphabetically by name: live at its URL, shown on the home page only with ?all. */
export function getUnlisted(): SketchEntry[] {
  const listed = new Set(getHome().listed);
  return [...getSketches().values()].filter((s) => !listed.has(s.slug)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Turns a site path into a URL under `base`: url('blackstar/') → '/glimmers/blackstar/'. */
export function url(path = ''): string {
  return import.meta.env.BASE_URL.replace(/\/?$/, '/') + path.replace(/^\//, '');
}
