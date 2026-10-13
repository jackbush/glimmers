#!/usr/bin/env node
// Frame-rate benchmark on the real GPU via headless Chrome (vsync off).
//
//   node scripts/bench.mjs [slug…] [--size 2560x1440] [--dpr 2] [--fixed] [--swiftshader] [--shot out.png] [--url …]
//
// No slugs = every sketch folder. Uses a running server at --url (default the astro preview
// address) or starts `astro preview` itself. Builds first, so it always tests the current code.
//
// --fixed       turn adaptive quality off, so the number is raw throughput at full resolution
// --swiftshader CPU renderer: a stand-in for a very weak GPU (use with adaptive on)
// --shot        save a screenshot (with several slugs, the slug is added to the name)
// --panel       keep the pane open in the screenshot

import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { cli, ensureServer, launch, sleep } from './lib/chrome.mjs';

const { args, opt, has } = cli(['--size', '--dpr', '--shot', '--url', '--seconds']);
const [W, H] = opt('--size', '1440x900').split('x').map(Number);
const dpr = Number(opt('--dpr', '1'));
const shot = opt('--shot', null);
const seconds = Number(opt('--seconds', '4'));
const root = new URL('../src/sketches/', import.meta.url).pathname;
const slugs = args.length ? args : readdirSync(root).filter((d) => existsSync(root + d + '/manifest.js'));

const server = await ensureServer(opt('--url', undefined));
const chrome = await launch({ width: W, height: H, dpr, swiftshader: has('--swiftshader') });
const killer = setTimeout(() => { console.error('timed out'); chrome.close(); server.stop(); process.exit(1); }, 120000 * slugs.length);
let failed = false;

for (const slug of slugs) {
  await chrome.send('Page.navigate', { url: server.base + slug + '/' + (has('--fixed') ? '?fixed' : '') });
  await sleep(1500);
  // Pane open → the fps readout updates. Pane state is site-wide, so only click when closed.
  await chrome.evaluate(`(() => { const c = document.getElementById('cog'); if (c.getAttribute('aria-expanded') !== 'true') c.click(); })()`);
  await sleep(has('--swiftshader') ? 10000 : 2500); // let adaptive quality settle

  // Counts frames the kit actually rendered (window.__glimmer.frames) over wall-clock time.
  const result = await chrome.evaluate(`new Promise((res) => {
    const g = window.__glimmer, f0 = g ? g.frames : 0, s = performance.now();
    setTimeout(() => {
      const c = document.getElementById('stage');
      const gl = document.createElement('canvas').getContext('webgl2'), d = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const err = document.getElementById('error');
      res({ fps: g ? +((g.frames - f0) / ((performance.now() - s) / 1000)).toFixed(1) : 0, canvas: c.width + 'x' + c.height,
            readout: document.getElementById('fps').textContent, gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?',
            error: err.hidden ? null : err.textContent });
    }, ${seconds * 1000});
  })`);
  console.log(JSON.stringify({ slug, ...result }));
  if (result?.error) failed = true;

  if (shot) {
    if (!has('--panel')) await chrome.evaluate(`document.getElementById('cog').click()`);
    await sleep(400);
    const r = await chrome.send('Page.captureScreenshot', { format: 'png' });
    const file = slugs.length > 1 ? shot.replace(/(\.png)?$/, '-' + slug + '.png') : shot;
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  }
}

clearTimeout(killer);
chrome.close();
server.stop();
process.exit(failed ? 1 : 0);
