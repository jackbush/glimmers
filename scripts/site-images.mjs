#!/usr/bin/env node
// Renders the site's share image and icons from Blackstar, into public/. Needs ffmpeg.
//
//   node scripts/site-images.mjs
//
// share.jpg            1200×630, the size link previews (Open Graph, iMessage, Slack) render at.
//                      Blackstar's orb is sized to the short side, so it fills the card's height.
// apple-touch-icon.png 180×180 for the iOS home screen; icon-192/512.png for Android and the
//                      web app manifest. A smaller, centred orb, so rounded corners don't clip it.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'glimmers-site-'));
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(cmd + ' failed');
};
const capture = (out, size, extra = []) =>
  run('node', ['scripts/capture.mjs', 'blackstar', '--still', out, '--size', size, '--dpr', '2', '--start', '3', ...extra]);
const resize = (src, out, w, h, quality = []) =>
  run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale=${w}:${h}:flags=lanczos`, ...quality, join(root, 'public', out)]);

try {
  capture(join(tmp, 'share.png'), '1200x630');
  resize(join(tmp, 'share.png'), 'share.jpg', 1200, 630, ['-q:v', '3']);
  capture(join(tmp, 'icon.png'), '256x256', ['--set', 'orbRadius=0.62', '--set', 'orbDrift=0']);
  resize(join(tmp, 'icon.png'), 'apple-touch-icon.png', 180, 180);
  resize(join(tmp, 'icon.png'), 'icon-192.png', 192, 192);
  resize(join(tmp, 'icon.png'), 'icon-512.png', 512, 512);
  resize(join(tmp, 'icon.png'), 'favicon-32.png', 32, 32);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('public/: share.jpg, apple-touch-icon.png, icon-192.png, icon-512.png, favicon-32.png');
