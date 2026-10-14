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
import { manifestSchema } from '../src/kit/manifest-schema.js';

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
  const presets = existsSync(join(dir, 'params.js')) ? (await import(pathToFileURL(join(dir, 'params.js')).href)).presets : null;
  const schema = existsSync(join(dir, 'params.js')) ? await load('params.js') : null;
  if (!existsSync(join(dir, 'sketch.js'))) errors.push('missing sketch.js');
  if (!schema) errors.push('missing params.js');
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) for (const i of parsed.error.issues) errors.push(`manifest.js: ${i.path.join('.') || '(root)'}: ${i.message}`);

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
      else {
        // The pane marks each level of `when` with "- ", which takes from the same width.
        let depth = 0;
        for (let q = p; q && q.when; q = group.params.find((r) => r.key === q.when.key)) depth++;
        const shown = '- '.repeat(depth) + p.label;
        if (shown.length > 18) warnings.push(`${where}: label "${shown}" is over 18 characters and will be cut off`);
      }
      if (!p.desc) warnings.push(`${where}: missing desc (tooltip)`);
      if (type === 'range') {
        for (const f of ['min', 'max', 'step']) if (typeof p[f] !== 'number') errors.push(`${where}: missing ${f}`);
        if (typeof p.value !== 'number') errors.push(`${where}: value must be a number`);
        else if (p.value < p.min || p.value > p.max) errors.push(`${where}: default ${p.value} outside [${p.min}, ${p.max}]`);
      } else if (type === 'color') {
        if (!/^#[0-9a-f]{6}$/.test(p.value)) errors.push(`${where}: colour must be lowercase #rrggbb`);
      } else if (type === 'select') {
        if (!Array.isArray(p.options) || p.options.length < 2) errors.push(`${where}: select needs an options array of 2+ strings`);
        else if (!p.options.includes(p.value)) errors.push(`${where}: default "${p.value}" isn't one of its options`);
      } else if (type === 'bool') {
        if (typeof p.value !== 'boolean') errors.push(`${where}: value must be boolean`);
      } else {
        errors.push(`${where}: unknown type "${type}"`);
      }
    }
  }
  // Dependencies (`when`): the parent comes earlier in the same group, with only its own
  // dependents in between, so the pane can show them straight under it.
  for (const group of schema || []) {
    const seen = [];
    for (const p of group.params || []) {
      const w = p.when;
      if (w) {
        const where = `${group.group}/${p.key}`;
        const parent = seen.find((q) => q.key === w.key);
        const vals = w.is || w.not;
        if (!parent) errors.push(`${where}: when.key "${w.key}" isn't earlier in the same group`);
        else if (!!w.is === !!w.not || !Array.isArray(vals) || !vals.length) errors.push(`${where}: when needs exactly one of is: [...] or not: [...]`);
        else {
          const ptype = parent.type || 'range';
          for (const v of vals) {
            const ok = ptype === 'select' ? parent.options.includes(v) : ptype === 'bool' ? typeof v === 'boolean'
              : ptype === 'color' ? /^#[0-9a-f]{6}$/.test(v) : typeof v === 'number' && v >= parent.min && v <= parent.max;
            if (!ok) errors.push(`${where}: when value ${JSON.stringify(v)} isn't a possible ${w.key}`);
          }
          // The param just before must be the parent or one of its dependents.
          let prev = seen[seen.length - 1];
          while (prev && prev !== parent) prev = prev.when && seen.find((q) => q.key === prev.when.key);
          if (prev !== parent) errors.push(`${where}: must come straight after ${w.key} (or another param that depends on it)`);
        }
      }
      seen.push(p);
    }
  }

  for (const k of ['timeScale', 'maxDpr']) {
    if (schema && !keys.has(k)) errors.push(`no "${k}" param — start params.js with playback() from src/kit/standard.js`);
  }

  // Presets: every key must be a param, every value valid for it.
  for (const [name, values] of Object.entries(presets || {})) {
    for (const [k, v] of Object.entries(values)) {
      const p = params.find((q) => q.key === k);
      if (!p) { errors.push(`preset "${name}": no param "${k}"`); continue; }
      const type = p.type || 'range';
      if (type === 'select' && !p.options.includes(v)) errors.push(`preset "${name}": ${k} "${v}" isn't one of its options`);
      else if (type === 'range' && (typeof v !== 'number' || v < p.min || v > p.max)) errors.push(`preset "${name}": ${k} ${v} isn't a number in [${p.min}, ${p.max}]`);
      else if (type === 'color' && !/^#[0-9a-f]{6}$/.test(v)) errors.push(`preset "${name}": ${k} must be lowercase #rrggbb`);
      else if (type === 'bool' && typeof v !== 'boolean') errors.push(`preset "${name}": ${k} must be boolean`);
    }
  }
  for (const n of manifest?.capture?.presets?.sequence || []) {
    if (!presets?.[n]) errors.push(`manifest.js: capture preset "${n}" isn't in params.js presets`);
  }
  if (manifest?.capture?.share && !presets?.[manifest.capture.share]) errors.push(`manifest.js: share preset "${manifest.capture.share}" isn't in params.js presets`);
  for (const n of manifest?.autoplay?.sequence || []) {
    if (!presets?.[n]) errors.push(`manifest.js: autoplay preset "${n}" isn't in params.js presets`);
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
  const covers = ['cover.mp4', 'cover.jpg', 'share.jpg'].filter((f) => !existsSync(join(dir, f)));
  if (covers.length) warnings.push(`no ${covers.join(' or ')} — run: node scripts/capture.mjs ${slug}`);

  for (const w of warnings) console.log(`warn  ${slug}: ${w}`);
  for (const e of errors) console.log(`ERROR ${slug}: ${e}`);
  console.log(`${slug}: ${keys.size} params · ${errors.length} errors · ${warnings.length} warnings`);
  totalErrors += errors.length;
}

process.exit(totalErrors ? 1 : 0);
