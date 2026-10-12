// Boots a sketch page: params → saved overrides → pane → buttons → loop.
//
// `?capture` puts the page in capture mode for scripts/capture.mjs: code defaults only, no
// buttons or pane, no adaptive quality, and no animation loop. Frames are rendered on demand
// with `window.__glimmer.step(dt)`, at a fixed timestep, so captures are identical however
// slow the machine is.

import { createModel } from './params';
import { buildPanel } from './panel';
import { setupChrome } from './chrome';
import { createLoop } from './loop';
import type { Group, Manifest, Sketch, SketchInstance } from './types';

interface SketchModules {
  manifest: Manifest;
  params: Group[];
  sketch: Sketch;
}

declare global {
  interface Window {
    /** Hooks for scripts/bench.mjs and scripts/capture.mjs. */
    __glimmer?: { readonly frames: number; step?(dt: number): void; set?(key: string, value: unknown): void };
  }
}

export function run(slug: string, { manifest, params, sketch }: SketchModules): void {
  const capture = new URLSearchParams(location.search).has('capture');
  const store = createModel(params, capture ? null : 'glimmers:' + slug + ':overrides');
  const P = store.byKey;
  if (capture && P.adaptive) store.setValue(P.adaptive, false);

  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const errorBox = document.getElementById('error')!;
  const fpsEl = document.getElementById('fps')!;
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  function fail(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errorBox.textContent = msg;
    errorBox.hidden = false;
    console.error(err);
  }

  // Mobile browser bars and overscroll take the page background / theme-color, not canvas
  // pixels, so keep both on the sketch's chosen colour.
  const pageParam = manifest.pageColour ? P[manifest.pageColour] : null;
  function syncPageColour() {
    if (!pageParam) return;
    const c = String(pageParam.value);
    document.documentElement.style.backgroundColor = c;
    document.body.style.backgroundColor = c;
    if (themeMeta) themeMeta.content = c;
  }

  const chrome = setupChrome(!capture);
  const panel = buildPanel({
    slug,
    store,
    onEdited() {
      store.scheduleSave();
      syncPageColour();
      panel.refreshStatus();
    },
  });
  panel.refreshStatus();
  syncPageColour();

  let instance: SketchInstance | null = null;
  const loop = createLoop(canvas, P, () => instance);
  loop.onStats = (text) => { if (chrome.paneOpen) fpsEl.textContent = text; };

  // Play/pause: freezes scene time (anything on real time, like film grain, keeps running).
  const playBtn = document.getElementById('play') as HTMLButtonElement;
  function syncPlay() {
    document.body.dataset.paused = String(loop.paused);
    playBtn.setAttribute('aria-label', loop.paused ? 'Play' : 'Pause');
  }
  playBtn.addEventListener('click', () => { loop.paused = !loop.paused; syncPlay(); });
  syncPlay();

  try {
    instance = sketch({ canvas, P, model: store, degrade: (f) => loop.degrade(f) });
  } catch (err) {
    fail(err);
    return;
  }

  window.__glimmer = { get frames() { return loop.frames; } };
  if (capture) {
    window.__glimmer.step = (dt) => loop.step(dt);
    // capture.mjs animates params over a clip (manifest `capture.animate`).
    window.__glimmer.set = (key, value) => { if (P[key]) store.setValue(P[key], value); };
  }
  else loop.start();
}
