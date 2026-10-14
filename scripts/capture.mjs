#!/usr/bin/env node
// Captures a sketch's cover: a muted, looping cover.mp4, a cover.jpg poster, and share.jpg
// (the 1200×630 link-preview image), written into src/sketches/<slug>/. Needs ffmpeg
// (`brew install ffmpeg`).
//
//   node scripts/capture.mjs <slug> [--seconds 6] [--start 0] [--fps 30] [--size 840x525] [--dpr 2] [--crf 26] [--no-pingpong] [--url …]
//   node scripts/capture.mjs <slug> --still out.png [--start 0] [--size 1200x630] [--dpr 2] [--set key=value …]
//
// The page runs in capture mode (?capture): code defaults, no buttons or pane, no adaptive
// quality, and frames rendered one at a time at a fixed timestep, so the result doesn't depend
// on how fast the machine is. By default the clip plays forwards then backwards, so it loops
// without a jump.
//
// --seconds, --start, --fps, --crf, ping-pong and param sweeps (`animate`) default to the
// sketch's `capture` settings in its manifest.js, so a re-capture comes out the same; pass
// them to experiment.
// --size is the CSS size of the frame (the index shows covers at 16:10, up to 840px wide);
// --dpr 2 renders it at retina resolution. --start skips into the animation first.
// --still writes a single PNG frame (at --start) instead of a cover: share images, icons.
// --set overrides a param for this capture (repeatable), e.g. --set orbRadius=0.7.
// A manifest `capture.presets` ({ sequence, hold }) morphs through the sketch's presets instead:
// each held for `hold` s, then morphed to the next over `presetSeconds`, looping (no ping-pong).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, ensureServer, launch, sleep } from './lib/chrome.mjs';
import { MANIFEST_DEFAULTS } from '../src/kit/manifest.js';

const { args, opt, has } = cli(['--seconds', '--start', '--fps', '--size', '--dpr', '--crf', '--url', '--still', '--set']);
const still = opt('--still', null);
// --set key=value, repeatable. Numbers and true/false are converted; anything else stays a string.
const argv = process.argv.slice(2);
const overrides = argv.flatMap((a, i) => (a === '--set' ? [argv[i + 1]] : [])).map((kv) => {
  const [k, v] = kv.split('=');
  return [k, v === 'true' ? true : v === 'false' ? false : Number.isFinite(Number(v)) ? Number(v) : v];
});
const slug = args[0];
const root = new URL('..', import.meta.url).pathname;
const dir = join(root, 'src/sketches', slug || '');
if (!slug || !existsSync(join(dir, 'manifest.js'))) {
  console.error('usage: node scripts/capture.mjs <slug> [options] — no sketch at ' + dir);
  process.exit(1);
}
if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('ffmpeg not found: brew install ffmpeg');
  process.exit(1);
}

// Defaults, then the sketch's own `capture` settings in manifest.js, then the command line.
const { default: manifest } = await import(join(dir, 'manifest.js'));
const { presetHold, ...captureDefaults } = MANIFEST_DEFAULTS.capture;
const preset = { ...captureDefaults, animate: {}, ...(manifest.capture || {}) };
// A preset sequence (manifest capture.presets): hold each, morph to the next, loop.
const seq = preset.presets?.sequence || [];
const hold = preset.presets?.hold ?? presetHold;
const morph = manifest.presetSeconds ?? MANIFEST_DEFAULTS.presetSeconds;
const period = hold + morph;
if (seq.length) preset.pingpong = false;
const seconds = Number(opt('--seconds', seq.length ? seq.length * period : preset.seconds));
const start = Number(opt('--start', preset.start));
const fps = Number(opt('--fps', preset.fps));
const [W, H] = opt('--size', '840x525').split('x').map(Number);
const dpr = Number(opt('--dpr', '2'));
const crf = String(opt('--crf', preset.crf));
const frames = Math.round(seconds * fps);

const work = join(root, '.capture', slug + (still ? '-still' : '')); // stills run inside a cover capture
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'raw'), { recursive: true });
mkdirSync(join(work, 'seq'));

const server = await ensureServer(opt('--url', undefined));
const chrome = await launch({ width: W, height: H, dpr });
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dpr, mobile: false });
  await chrome.send('Page.navigate', { url: server.base + slug + '/?capture' });
  for (let i = 0; i < 100; i++) {
    if (await chrome.evaluate(`!!(window.__glimmer && window.__glimmer.step)`)) break;
    if (i === 99) throw new Error('page never reached capture mode — check the console for errors');
    await sleep(100);
  }
  const error = await chrome.evaluate(`(() => { const e = document.getElementById('error'); return e.hidden ? null : e.textContent; })()`);
  if (error) throw new Error(error);

  // `animate` sweeps params from → to → from over the clip (eased), starting from `from`.
  const sweep = Object.entries(preset.animate);
  const setAt = (p) => chrome.evaluate(sweep.map(([key, [a, b]]) =>
    `window.__glimmer.set(${JSON.stringify(key)}, ${a + (b - a) * (1 - Math.cos(2 * Math.PI * p)) / 2})`).join(';') || '0');
  await setAt(0);
  if (seq.length) {
    // Land on the first preset, and give the sketch's own morphs (selects) time to settle,
    // so the clip starts (and loops back) on it.
    await chrome.evaluate(`window.__glimmer.preset(${JSON.stringify(seq[0])}, 0); for (let i = 0; i < ${Math.round(3 * fps)}; i++) window.__glimmer.step(${1 / fps})`);
  }
  for (const [k, v] of overrides) await chrome.evaluate(`window.__glimmer.set(${JSON.stringify(k)}, ${JSON.stringify(v)})`);

  // Skip ahead at the capture timestep, so physics-style sketches see the same dt as in the clip.
  const skip = Math.round(start * fps);
  if (skip) await chrome.evaluate(`for (let i = 0; i < ${skip}; i++) window.__glimmer.step(${1 / fps})`);

  if (still) {
    await chrome.evaluate(`window.__glimmer.step(${1 / fps})`);
    const r = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(still, Buffer.from(r.result.data, 'base64'));
  }

  for (let i = 0; !still && i < frames; i++) {
    if (sweep.length) await setAt(i / frames);
    if (seq.length) {
      const k = Math.floor(i / fps / period);
      if (Math.round((k * period + hold) * fps) === i) {
        await chrome.evaluate(`window.__glimmer.preset(${JSON.stringify(seq[(k + 1) % seq.length])}, ${morph})`);
      }
    }
    await chrome.evaluate(`window.__glimmer.step(${1 / fps})`);
    const r = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(work, 'raw', String(i).padStart(5, '0') + '.png'), Buffer.from(r.result.data, 'base64'));
    if (i % fps === 0) process.stdout.write(`\rframe ${i + 1}/${frames}`);
  }
  if (!still) process.stdout.write(`\rframe ${frames}/${frames}\n`);
} finally {
  chrome.close();
  server.stop();
}
if (still) {
  rmSync(work, { recursive: true, force: true });
  console.log(`${still} (${W * dpr}×${H * dpr})`);
  process.exit(0);
}

// Forwards, then backwards without repeating either end frame.
const order = [...Array(frames).keys()];
if (preset.pingpong && !has('--no-pingpong')) order.push(...order.slice(1, -1).reverse());
order.forEach((f, i) => symlinkSync(join(work, 'raw', String(f).padStart(5, '0') + '.png'), join(work, 'seq', String(i).padStart(5, '0') + '.png')));

const video = join(dir, 'cover.mp4');
const poster = join(dir, 'cover.jpg');
const run = (argv) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...argv], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
};
run(['-framerate', String(fps), '-i', join(work, 'seq', '%05d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', video]);
run(['-i', join(work, 'raw', '00000.png'), '-q:v', '3', poster]);

// The link-preview image: the same moment as the poster, rendered natively at the size share
// cards use (1200×630, at 2× then scaled down), so nothing is cropped or stretched.
const shareSrc = join(root, '.capture', slug + '-share.png');
const share = join(dir, 'share.jpg');
const self = spawnSync('node', [new URL(import.meta.url).pathname, slug, '--still', shareSrc, '--size', '1200x630', '--dpr', '2',
  '--start', String(start), ...overrides.flatMap(([k, v]) => ['--set', `${k}=${v}`])],
  { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, GLIMMERS_BUILT: '1' } }); // built already
if (self.status !== 0) throw new Error('share image capture failed');
run(['-i', shareSrc, '-vf', 'scale=1200:630:flags=lanczos', '-q:v', '3', share]);
rmSync(shareSrc, { force: true });
rmSync(work, { recursive: true, force: true });

const mb = (f) => (statSync(f).size / 1e6).toFixed(2) + 'MB';
console.log(`cover.mp4 ${mb(video)} (${(order.length / fps).toFixed(1)}s loop, ${W * dpr}×${H * dpr}) · cover.jpg ${mb(poster)} · share.jpg ${mb(share)}`);
if (statSync(video).size > 3e6) console.warn('warning: cover.mp4 is over 3MB — try a higher --crf, a shorter --seconds, or check for grain/noise that defeats compression');
