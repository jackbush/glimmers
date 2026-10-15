#!/usr/bin/env node
// Renders the site's share image and home-screen icons from Blackstar, and the favicon's PNG
// fallback from public/favicon.svg, into public/. Needs ffmpeg.
//
//   node scripts/site-images.mjs [--url …]   (--url: a preview server to use, as for capture.mjs)
//
// share.jpg            1200×630, the size link previews (Open Graph, iMessage, Slack) render at.
//                      Blackstar's orb is sized to the short side, so it fills the card's height.
// apple-touch-icon.png 180×180 for the iOS home screen; icon-192/512.png for Android and the
//                      web app manifest. A smaller, centred orb, so rounded corners don't clip it.
// favicon-32.png       the browser-tab icon for browsers without SVG favicons, rendered from
//                      favicon.svg (Phosphor's "code" icon on white), which is the source.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { cli, launch, sleep } from './lib/chrome.mjs';

const { opt } = cli(['--url']);
const urlArgs = opt('--url', null) ? ['--url', opt('--url', null)] : [];

const root = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'glimmers-site-'));
const run = (cmd, args, env = process.env) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env });
  if (r.status !== 0) throw new Error(cmd + ' failed');
};
// Build once here; each capture then skips its own build.
const capture = (out, size, extra = []) =>
  run('node', ['scripts/capture.mjs', 'blackstar', '--still', out, '--size', size, '--dpr', '2', '--start', '3', ...urlArgs, ...extra],
    { ...process.env, GLIMMERS_BUILT: '1' });
const resize = (src, out, w, h, quality = []) =>
  run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale=${w}:${h}:flags=lanczos`, ...quality, join(root, 'public', out)]);

try {
  run('npx', ['astro', 'build']);
  capture(join(tmp, 'share.png'), '1200x630');
  resize(join(tmp, 'share.png'), 'share.jpg', 1200, 630, ['-q:v', '3']);
  capture(join(tmp, 'icon.png'), '256x256', ['--set', 'orbRadius=0.62', '--set', 'orbDrift=0']);
  resize(join(tmp, 'icon.png'), 'apple-touch-icon.png', 180, 180);
  resize(join(tmp, 'icon.png'), 'icon-192.png', 192, 192);
  resize(join(tmp, 'icon.png'), 'icon-512.png', 512, 512);
  // The favicon's fallback: favicon.svg drawn at 512px, then scaled down.
  const chrome = await launch({ width: 512, height: 512 });
  try {
    await chrome.send('Page.navigate', { url: 'file://' + join(root, 'public', 'favicon.svg') });
    await sleep(500);
    const r = await chrome.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 512, height: 512, scale: 1 } });
    writeFileSync(join(tmp, 'favicon.png'), Buffer.from(r.result.data, 'base64'));
  } finally {
    chrome.close();
  }
  resize(join(tmp, 'favicon.png'), 'favicon-32.png', 32, 32);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('public/: share.jpg, apple-touch-icon.png, icon-192.png, icon-512.png, favicon-32.png');
