#!/usr/bin/env node
// Refresh the homepage sketch's fallback copy: fetch the site's live content.json and write it to
// src/sketches/homepage/content.json if it changed. The post-commit hook (.githooks) runs it
// and commits the change; offline or slow (5 s), it leaves the snapshot alone.
//
//   node scripts/homepage-content.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { CONTENT_URL } from '../src/sketches/homepage/content-url.js';

const file = new URL('../src/sketches/homepage/content.json', import.meta.url);
try {
  const res = await fetch(CONTENT_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const next = JSON.stringify(await res.json(), null, 2) + '\n';
  if (next !== readFileSync(file, 'utf8')) {
    writeFileSync(file, next);
    console.log('homepage: content snapshot updated from ' + CONTENT_URL + '');
  }
} catch (e) {
  console.log('homepage: content snapshot not refreshed (' + (e instanceof Error ? e.message : e) + ')');
}
