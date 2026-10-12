#!/usr/bin/env node
// Consistency check for every sketch: manifest, params schema, and whether each param is used.
// A sketch can add its own checks in src/sketches/<slug>/check.mjs (Blackstar checks its GLSL).
//
//   node scripts/check.mjs [slug…]
//
// Exits non-zero on errors; warnings (unused params, missing tooltips) don't fail it.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STANDARD_KEYS } from '../src/kit/standard.js';

const root = new URL('../src/sketches/', import.meta.url).pathname;
const only = process.argv.slice(2);
const slugs = readdirSync(root).filter((d) => existsSync(join(root, d, 'manifest.js')) && (!only.length || only.includes(d)));
const listed = (await import(pathToFileURL(join(root, 'index.js')).href)).default.sketches;
let totalErrors = 0;

for (const slug of slugs) {
  const dir = join(root, slug);
  const errors = [];
  const warnings = [];
  const load = async (f) => (await import(pathToFileURL(join(dir, f)).href)).default;

  const manifest = await load('manifest.js');
  const schema = existsSync(join(dir, 'params.js')) ? await load('params.js') : null;
  if (!existsSync(join(dir, 'sketch.js'))) errors.push('missing sketch.js');
  if (!schema) errors.push('missing params.js');
  if (!manifest?.name) errors.push('manifest.js: missing name');
  if (!Number.isInteger(manifest?.year)) errors.push('manifest.js: missing year (the year the sketch was first made)');

  const params = [];
  const keys = new Set();
  for (const group of schema || []) {
    if (!group.group || !Array.isArray(group.params)) { errors.push('malformed group: ' + JSON.stringify(group).slice(0, 80)); continue; }
    for (const p of group.params) {
      const where = `${group.group}/${p.key}`;
      const type = p.type || 'range';
      if (!/^[a-z][A-Za-z0-9]*$/.test(p.key || '')) errors.push(`${where}: key must be camelCase`);
      if (keys.has(p.key)) errors.push(`${where}: duplicate key`);
      keys.add(p.key);
      params.push(p);
      if (!p.label) errors.push(`${where}: missing label`);
      else if (p.label.length > 18) warnings.push(`${where}: label "${p.label}" is over 18 characters and will be cut off`);
      if (!p.desc) warnings.push(`${where}: missing desc (tooltip)`);
      if (type === 'range') {
        for (const f of ['min', 'max', 'step']) if (typeof p[f] !== 'number') errors.push(`${where}: missing ${f}`);
        if (typeof p.value !== 'number') errors.push(`${where}: value must be a number`);
        else if (p.value < p.min || p.value > p.max) errors.push(`${where}: default ${p.value} outside [${p.min}, ${p.max}]`);
      } else if (type === 'color') {
        if (!/^#[0-9a-f]{6}$/.test(p.value)) errors.push(`${where}: colour must be lowercase #rrggbb`);
      } else if (type === 'bool') {
        if (typeof p.value !== 'boolean') errors.push(`${where}: value must be boolean`);
      } else {
        errors.push(`${where}: unknown type "${type}"`);
      }
    }
  }
  for (const k of ['timeScale', 'maxDpr']) {
    if (schema && !keys.has(k)) errors.push(`no "${k}" param — start params.js with playback() from src/kit/standard.js`);
  }

  if (manifest?.pageColour) {
    const p = params.find((q) => q.key === manifest.pageColour);
    if (!p) errors.push(`manifest.js: pageColour "${manifest.pageColour}" isn't a param key`);
    else if (p.type !== 'color') errors.push(`manifest.js: pageColour "${manifest.pageColour}" isn't a colour param`);
  }

  // Unused params: a key that appears nowhere in the sketch's code (as P.key, or u_key in a
  // shader) is probably dead.
  const code = readdirSync(dir).filter((f) => /\.(m?js|ts)$/.test(f) && !['params.js', 'manifest.js', 'check.mjs'].includes(f))
    .map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  for (const p of params) {
    if (STANDARD_KEYS.includes(p.key)) continue;
    if (!new RegExp(`(?:\\bu_|\\b)${p.key}\\b`).test(code)) warnings.push(`${p.key}: not used anywhere in the sketch's code`);
  }

  if (existsSync(join(dir, 'check.mjs'))) {
    const hook = await load('check.mjs');
    await hook({ dir, params, manifest, errors, warnings });
  }

  if (!listed.includes(slug)) warnings.push('not listed in src/sketches/index.js (its page still builds)');
  const covers = ['cover.mp4', 'cover.jpg'].filter((f) => !existsSync(join(dir, f)));
  if (covers.length) warnings.push(`no ${covers.join(' or ')} — run: node scripts/capture.mjs ${slug}`);

  for (const w of warnings) console.log(`warn  ${slug}: ${w}`);
  for (const e of errors) console.log(`ERROR ${slug}: ${e}`);
  console.log(`${slug}: ${keys.size} params · ${errors.length} errors · ${warnings.length} warnings`);
  totalErrors += errors.length;
}

process.exit(totalErrors ? 1 : 0);
