// Build-time view of src/sketches/: every sketch folder, validated, with its cover resolved.
//
// Pages are built from the folders, not from index.js, so an unlisted sketch is still
// reachable by direct URL — that's how you preview one before publishing it.

import { z } from 'astro/zod';
import home from '../sketches/index.js';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const manifestSchema = z
  .object({
    name: z.string().trim().min(1),
    year: z.number().int().min(1990).max(2100),
    pageColour: z.string().optional(),
    capture: z
      .object({ seconds: z.number().positive(), start: z.number().min(0), fps: z.number().positive(), crf: z.number().int().min(0).max(51), pingpong: z.boolean(),
        animate: z.record(z.string(), z.tuple([z.number(), z.number()])) })
      .partial()
      .strict()
      .optional(),
  })
  .strict();

const homeSchema = z
  .object({ name: z.string().trim().min(1), description: z.string().trim().min(1), sketches: z.array(z.string()) })
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

/** The sketches listed in src/sketches/index.js, in order. */
export function getListed(): SketchEntry[] {
  const all = getSketches();
  return getHome().sketches.map((slug) => {
    const s = all.get(slug);
    if (!s) throw new Error(`src/sketches/index.js lists "${slug}", but there's no src/sketches/${slug}/manifest.js.`);
    return s;
  });
}

/** How a sketch is labelled everywhere: "Blackstar (2026)". */
export function label(s: { name: string; year: number }): string {
  return `${s.name} (${s.year})`;
}

/** Turns a site path into a URL under `base`: url('blackstar/') → '/glimmers/blackstar/'. */
export function url(path = ''): string {
  return import.meta.env.BASE_URL.replace(/\/?$/, '/') + path.replace(/^\//, '');
}
