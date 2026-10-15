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
import { MANIFEST_DEFAULTS } from './manifest.js';
import type { Group, Manifest, Presets, Sketch, SketchInstance } from './types';

export interface SketchModules {
  manifest: Manifest;
  params: Group[];
  /** Optional `export const presets` from params.js. */
  presets?: Presets;
  sketch: Sketch;
}

declare global {
  interface Window {
    /** Hooks for scripts/bench.mjs and scripts/capture.mjs. */
    __glimmer?: {
      readonly frames: number;
      step?(dt: number): void;
      set?(key: string, value: unknown): void;
      /** Morph to a preset (capture mode), over `seconds` (default: the manifest's). */
      preset?(name: string, seconds?: number): void;
    };
  }
}

export function run(slug: string, { manifest, params, presets, sketch }: SketchModules): void {
  const capture = new URLSearchParams(location.search).has('capture');
  const store = createModel(params, capture ? null : 'glimmers:' + slug + ':overrides', presets);
  const P = store.byKey;

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

  // Autoplay (manifest.autoplay): cycling through the presets until the pane opens.
  let autoplay: { names: string[]; i: number; wait: number } | null = null;
  const chrome = setupChrome(!capture, (open) => { if (open) autoplay = null; });
  const presetSeconds = manifest.presetSeconds ?? MANIFEST_DEFAULTS.presetSeconds;
  const autoHold = manifest.autoplay?.hold ?? MANIFEST_DEFAULTS.autoplayHold;
  // Whether the preset morph under way is the user's (saved when it lands) or autoplay's.
  let saveOnLanding = false;
  // The preset applied before the sketch existed (autoplay's first), announced to it once it does.
  let firstPreset = '';
  /** Morph to a preset over `seconds` (by default as long as the sketch says it needs); returns them. */
  function applyPreset(name: string, seconds?: number, save = true): number {
    if (!presets?.[name]) return 0;
    const s = seconds ?? instance?.presetSeconds?.(presets[name]) ?? presetSeconds;
    saveOnLanding = save;
    const own = !!instance?.morph;
    store.applyPreset(name, s, !own);
    if (own) instance!.morph!(s, name);
    else firstPreset = name;
    // What landed at once shows now; gliding colours catch up as they move.
    syncPageColour();
    panel.syncAll();
    panel.refreshStatus();
    if (save) store.scheduleSave();
    return s;
  }
  const panel = buildPanel({
    slug,
    store,
    presets,
    onPreset: (name) => applyPreset(name),
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
  // Captures and `?fixed` (bench.mjs --fixed) render at full resolution, no adaptive quality.
  loop.fixed = capture || new URLSearchParams(location.search).has('fixed');
  loop.onStats = (text) => { if (chrome.paneOpen) fpsEl.textContent = text; };
  // Preset morphs advance with the frame loop; the pane catches up when one lands.
  let paneWait = 0;
  loop.onTick = (dt) => {
    if (autoplay && (autoplay.wait -= dt) <= 0) {
      autoplay.i = (autoplay.i + 1) % autoplay.names.length;
      autoplay.wait = applyPreset(autoplay.names[autoplay.i], undefined, false) + autoHold;
    }
    const state = store.tick(dt);
    if (state === 'idle') return;
    syncPageColour();
    paneWait -= dt;
    if (state === 'done' || paneWait <= 0) {
      paneWait = 0.25;
      panel.syncAll();
      panel.refreshStatus();
    }
    // Autoplay's presets aren't the user's settings, so they aren't saved, even if the pane
    // opened (stopping autoplay) while one was morphing in.
    if (state === 'done' && saveOnLanding) store.scheduleSave();
  };

  // Play/pause: freezes scene time (anything on real time, like film grain, keeps running).
  const playBtn = document.getElementById('play') as HTMLButtonElement;
  function syncPlay() {
    document.body.dataset.paused = String(loop.paused);
    playBtn.setAttribute('aria-label', loop.paused ? 'Play' : 'Pause');
  }
  playBtn.addEventListener('click', () => { loop.paused = !loop.paused; syncPlay(); });
  if (manifest.startPaused && !capture) loop.paused = true;
  syncPlay();

  // The first preset lands before the sketch starts, so it opens on it rather than morphing in.
  const names = manifest.autoplay?.sequence ?? (presets ? Object.keys(presets) : []);
  if (!capture && manifest.autoplay && names.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // A random one first, then on through the sequence (or the menu order) from there.
    const first = Math.floor(Math.random() * names.length);
    autoplay = { names, i: first, wait: autoHold };
    applyPreset(names[first], 0, false);
  }

  try {
    instance = sketch({ canvas, P, model: store, degrade: (f) => loop.degrade(f) });
  } catch (err) {
    fail(err);
    return;
  }
  if (firstPreset) instance.morph?.(0, firstPreset);

  window.__glimmer = { get frames() { return loop.frames; } };
  if (capture) {
    window.__glimmer.step = (dt) => loop.step(dt);
    // capture.mjs animates params over a clip (manifest `capture.animate`).
    window.__glimmer.set = (key, value) => { if (P[key]) store.setValue(P[key], value); };
    window.__glimmer.preset = (name, seconds) => applyPreset(name, seconds);
  }
  else loop.start();
}
