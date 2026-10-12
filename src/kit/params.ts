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
}

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
