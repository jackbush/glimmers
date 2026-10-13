// The param model: live values for a sketch's params.js, plus the overrides saved per browser.
//
// Overrides survive reloads, but are dropped automatically once the code's defaults change
// (e.g. after a pasted state has been baked into params.js): they're signed with a hash of
// every default.

import type { Group, Model, Param, ParamValue } from './types';

export interface ParamStore extends Model {
  groups: Group[];
  setValue(p: Param, v: unknown): void;
  isChanged(p: Param): boolean;
  changedCount(): number;
  resetAll(): void;
  /** Persist the current overrides (debounced). */
  scheduleSave(): void;
  /** Forget saved overrides, and cancel a pending save. */
  clearSaved(): void;
  /**
   * Start morphing to these values over `seconds` (0 = at once). With `glideNumbers` false,
   * numbers land at once and only colours glide (the sketch morphs its shape itself).
   */
  applyPreset(values: Record<string, ParamValue>, seconds: number, glideNumbers?: boolean): void;
  /** Advance a preset morph by dt seconds. Returns 'moving', 'done' (just landed) or 'idle'. */
  tick(dt: number): 'moving' | 'done' | 'idle';
}

function hexToRgb(h: string, out: number[]): void {
  const n = parseInt(h.slice(1), 16);
  out[0] = (n >> 16) & 255; out[1] = (n >> 8) & 255; out[2] = n & 255;
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function easeInOut(t: number): number { return t * t * (3 - 2 * t); }

function decimalsOf(step: number | undefined): number {
  const s = String(step ?? 1);
  return s.includes('e-') ? Number(s.split('e-')[1]) : (s.split('.')[1] || '').length;
}
function roundTo(v: number, d: number): number { return Number(Number(v).toFixed(d)); }

function writeDerived(p: Param): void {
  if (p.type !== 'color') return;
  const n = parseInt(String(p.value).slice(1), 16);
  p.rgb[0] = ((n >> 16) & 255) / 255;
  p.rgb[1] = ((n >> 8) & 255) / 255;
  p.rgb[2] = (n & 255) / 255;
}

function coerce(p: Param, v: unknown): ParamValue {
  if (p.type === 'bool') return !!v;
  if (p.type === 'color') return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : p.value;
  if (p.type === 'select') return typeof v === 'string' && p.options!.includes(v) ? v : p.value;
  const n = Number(v);
  return Number.isFinite(n) ? roundTo(n, p.decimals) : p.value;
}

function signature(params: Param[]): string {
  const s = JSON.stringify(params.map((p) => [p.key, p.default]));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * @param schema the sketch's params.js (groups → params). Defs are copied, not mutated.
 * @param storageKey localStorage key for saved overrides; null = don't load or save (capture mode).
 */
export function createModel(schema: Group[], storageKey: string | null): ParamStore {
  const params: Param[] = [];
  const byKey: Record<string, Param> = Object.create(null);
  const groups: Group[] = [];
  let version = 0;

  for (const g of schema) {
    const live: Param[] = [];
    for (const def of g.params) {
      if (byKey[def.key]) throw new Error('Duplicate param key: ' + def.key);
      const type = def.type || 'range';
      const p: Param = {
        ...def,
        type,
        group: g.group,
        default: def.value,
        decimals: type === 'range' ? decimalsOf(def.step) : 0,
        rgb: new Float32Array(3),
      };
      writeDerived(p);
      params.push(p);
      live.push(p);
      byKey[p.key] = p;
    }
    groups.push({ group: g.group, params: live });
  }

  const sig = signature(params);
  let saveTimer = 0;

  // Preset morph: numbers and colours glide from where they were to the preset's values.
  interface Glide { p: Param; from: number; to: number; rgbFrom?: number[]; rgbTo?: number[] }
  let glides: Glide[] = [];
  let glideT = 0, glideLen = 0;

  const store: ParamStore = {
    params,
    byKey,
    groups,
    get version() { return version; },
    setValue(p, v) {
      p.value = coerce(p, v);
      writeDerived(p);
      version++;
    },
    isChanged: (p) => p.value !== p.default,
    changedCount() {
      let n = 0;
      for (const p of params) if (p.value !== p.default) n++;
      return n;
    },
    resetAll() {
      for (const p of params) store.setValue(p, p.default);
    },
    scheduleSave() {
      if (!storageKey) return;
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try {
          const values: Record<string, ParamValue> = {};
          for (const p of params) if (p.value !== p.default) values[p.key] = p.value;
          localStorage.setItem(storageKey, JSON.stringify({ sig, values }));
        } catch { /* storage unavailable */ }
      }, 250);
    },
    applyPreset(values, seconds, glideNumbers = true) {
      glides = [];
      for (const key in values) {
        const p = byKey[key];
        if (!p) continue;
        const to = coerce(p, values[key]);
        if (seconds <= 0 || p.type === 'select' || p.type === 'bool' || (p.type !== 'color' && !glideNumbers)) {
          store.setValue(p, to);
          continue;
        }
        if (p.type === 'color') {
          const a = [0, 0, 0], b = [0, 0, 0];
          hexToRgb(String(p.value), a); hexToRgb(String(to), b);
          glides.push({ p, from: 0, to: 1, rgbFrom: a, rgbTo: b });
        } else glides.push({ p, from: Number(p.value), to: Number(to) });
      }
      glideT = 0;
      glideLen = Math.max(seconds, 1e-3);
    },
    tick(dt) {
      if (!glides.length) return 'idle';
      glideT = Math.min(glideLen, glideT + dt);
      const k = easeInOut(glideT / glideLen);
      for (const g of glides) {
        if (g.rgbFrom && g.rgbTo) {
          const a = g.rgbFrom, b = g.rgbTo;
          store.setValue(g.p, rgbToHex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k));
        } else store.setValue(g.p, g.from + (g.to - g.from) * k);
      }
      if (glideT < glideLen) return 'moving';
      glides = [];
      return 'done';
    },
    clearSaved() {
      clearTimeout(saveTimer);
      if (!storageKey) return;
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    },
  };

  if (storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && saved.sig === sig) {
        for (const k in saved.values) if (byKey[k]) store.setValue(byKey[k], saved.values[k]);
      }
    } catch { /* storage unavailable — run on defaults */ }
  }

  return store;
}
