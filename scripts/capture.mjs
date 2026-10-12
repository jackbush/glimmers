#!/usr/bin/env node
// Captures a sketch's cover: a muted, looping cover.mp4 plus a cover.jpg poster, written into
// src/sketches/<slug>/. Needs ffmpeg (`brew install ffmpeg`).
//
//   node scripts/capture.mjs <slug> [--seconds 6] [--start 0] [--fps 30] [--size 840x525] [--dpr 2] [--crf 26] [--no-pingpong] [--url …]
//
// The page runs in capture mode (?capture): code defaults, no buttons or pane, no adaptive
// quality, and frames rendered one at a time at a fixed timestep, so the result doesn't depend
// on how fast the machine is. By default the clip plays forwards then backwards, so it loops
// without a jump.
//
// --seconds, --start, --fps, --crf, ping-pong and param sweeps (`animate`) default to the sketch's `capture` settings in its
// manifest.js, so a re-capture comes out the same; pass them to experiment.
// --size is the CSS size of the frame (the index shows covers at 16:10, up to 840px wide);
// --dpr 2 renders it at retina resolution. --start skips into the animation first.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, ensureServer, launch, sleep } from './lib/chrome.mjs';

const { args, opt, has } = cli(['--seconds', '--start', '--fps', '--size', '--dpr', '--crf', '--url']);
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
const preset = { seconds: 6, start: 0, fps: 30, crf: 26, pingpong: true, animate: {}, ...(manifest.capture || {}) };
const seconds = Number(opt('--seconds', preset.seconds));
const start = Number(opt('--start', preset.start));
const fps = Number(opt('--fps', preset.fps));
const [W, H] = opt('--size', '840x525').split('x').map(Number);
const dpr = Number(opt('--dpr', '2'));
const crf = String(opt('--crf', preset.crf));
const frames = Math.round(seconds * fps);

const work = join(root, '.capture', slug);
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

  // Skip ahead at the capture timestep, so physics-style sketches see the same dt as in the clip.
  const skip = Math.round(start * fps);
  if (skip) await chrome.evaluate(`for (let i = 0; i < ${skip}; i++) window.__glimmer.step(${1 / fps})`);

  for (let i = 0; i < frames; i++) {
    if (sweep.length) await setAt(i / frames);
    await chrome.evaluate(`window.__glimmer.step(${1 / fps})`);
    const r = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(work, 'raw', String(i).padStart(5, '0') + '.png'), Buffer.from(r.result.data, 'base64'));
    if (i % fps === 0) process.stdout.write(`\rframe ${i + 1}/${frames}`);
  }
  process.stdout.write(`\rframe ${frames}/${frames}\n`);
} finally {
  chrome.close();
  server.stop();
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
rmSync(work, { recursive: true, force: true });

const mb = (f) => (statSync(f).size / 1e6).toFixed(2) + 'MB';
console.log(`cover.mp4 ${mb(video)} (${(order.length / fps).toFixed(1)}s loop, ${W * dpr}×${H * dpr}) · cover.jpg ${mb(poster)}`);
if (statSync(video).size > 3e6) console.warn('warning: cover.mp4 is over 3MB — try a higher --crf, a shorter --seconds, or check for grain/noise that defeats compression');
