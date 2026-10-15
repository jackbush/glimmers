// The param model: live values for a sketch's params.js, plus the overrides saved per browser.
//
// Overrides survive reloads, but are dropped automatically once the code's defaults change
// (e.g. after a pasted state has been baked into params.js): they're signed with a hash of
// every default. Slider ranges re-centred in the pane are saved with them.
//
// Bypass shows each param's base (default or preset value) in place of the edits, for
// before/after comparison; the edits are held, and still count and copy as changes.

import type { Group, Model, Param, ParamValue, Presets } from './types';

export interface ParamStore extends Model {
  groups: Group<Param>[];
  /** Set a value. A preset morph still under way stops moving this param. */
  setValue(p: Param, v: unknown): void;
  /** Differs from its base: the default, or the last applied preset's value. */
  isChanged(p: Param): boolean;
  /** The user's value: the live value, or the held edit while bypassed. */
  edited(p: Param): ParamValue;
  /** True while the bases are showing in place of the edits. */
  readonly bypassed: boolean;
  /** Show the bases (true) or put the edits back (false). */
  setBypass(on: boolean): void;
  /** A range param's slider range, for this browser (saved with the overrides). */
  setRange(p: Param, min: number, max: number): void;
  /** The preset last applied ('' if none since the defaults). */
  readonly preset: string;
  /** False while the param's `when` (or an ancestor's) doesn't hold. */
  isShown(p: Param): boolean;
  /** Changed params that are shown. */
  changedCount(): number;
  /** Every param back to its default (and every base and range), ending any preset morph and any bypass. */
  resetAll(): void;
  /** Persist the current overrides (debounced). */
  scheduleSave(): void;
  /** Forget saved overrides, and cancel a pending save. */
  clearSaved(): void;
  /**
   * Start morphing to preset `name` over `seconds` (0 = at once). With `glideNumbers` false,
   * numbers land at once and only colours glide (the sketch morphs its shape itself). The
   * params it sets take its values as their bases, so they count as unchanged; the rest keep
   * their values and bases (a user's edit stays an edit).
   */
  applyPreset(name: string, seconds: number, glideNumbers?: boolean): void;
  /** Advance a preset morph by dt seconds. Returns 'moving', 'done' (just landed) or 'idle'. */
  tick(dt: number): 'moving' | 'done' | 'idle';
}

function hexToRgb(h: string, out: { [i: number]: number }, scale = 1): void {
  const n = parseInt(h.slice(1), 16);
  out[0] = ((n >> 16) & 255) * scale; out[1] = ((n >> 8) & 255) * scale; out[2] = (n & 255) * scale;
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
  if (p.type === 'color') hexToRgb(String(p.value), p.rgb, 1 / 255);
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
 * @param presets the sketch's presets, if any.
 */
export function createModel(schema: Group[], storageKey: string | null, presets?: Presets): ParamStore {
  const params: Param[] = [];
  const byKey: Record<string, Param> = Object.create(null);
  const groups: Group<Param>[] = [];
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
        base: def.value,
        decimals: type === 'range' ? decimalsOf(def.step) : 0,
        rgb: new Float32Array(3),
        parent: null,
        depth: 0,
        codeMin: def.min,
        codeMax: def.max,
      };
      if (def.when) {
        const parent = live.find((q) => q.key === def.when!.key);
        if (!parent) throw new Error(`${def.key}: "when" names ${def.when.key}, which isn't earlier in its group`);
        p.parent = parent;
        p.depth = parent.depth + 1;
      }
      writeDerived(p);
      params.push(p);
      live.push(p);
      byKey[p.key] = p;
    }
    groups.push({ group: g.group, params: live });
  }

  const sig = signature(params);
  let saveTimer = 0;
  let preset = '';
  // Bypass: the edits held aside while the bases show.
  let held: Map<Param, ParamValue> | null = null;
  const edited = (p: Param): ParamValue => (held && held.has(p) ? held.get(p)! : p.value);

  // Preset morph: numbers and colours glide from where they were to the preset's values.
  interface Glide { p: Param; from: number; to: number; rgbFrom?: number[]; rgbTo?: number[] }
  let glides: Glide[] = [];
  let glideT = 0, glideLen = 0;

  function assign(p: Param, v: unknown) {
    p.value = coerce(p, v);
    writeDerived(p);
    version++;
  }

  const store: ParamStore = {
    params,
    byKey,
    groups,
    get version() { return version; },
    setValue(p, v) {
      store.setBypass(false); // an edit is made on top of the edits, never lost under a bypass
      if (glides.length) glides = glides.filter((g) => g.p !== p);
      assign(p, v);
    },
    get preset() { return preset; },
    isChanged: (p) => edited(p) !== p.base,
    edited,
    get bypassed() { return !!held; },
    setBypass(on) {
      if (on === !!held) return;
      if (on) {
        glides = [];
        held = new Map();
        for (const p of params) if (p.value !== p.base) { held.set(p, p.value); assign(p, p.base); }
      } else {
        const back = held!;
        held = null;
        for (const [p, v] of back) assign(p, v);
      }
    },
    setRange(p, min, max) {
      p.min = min;
      p.max = max;
      version++;
    },
    isShown(p) {
      for (let q: Param | null = p; q && q.when; q = q.parent) {
        const v = edited(q.parent!), w = q.when; // the user's value, also while bypassed
        if (w.is && !w.is.includes(v)) return false;
        if (w.not && w.not.includes(v)) return false;
      }
      return true;
    },
    changedCount() {
      let n = 0;
      for (const p of params) if (edited(p) !== p.base && store.isShown(p)) n++;
      return n;
    },
    resetAll() {
      glides = [];
      preset = '';
      held = null;
      for (const p of params) {
        p.base = p.default;
        p.min = p.codeMin;
        p.max = p.codeMax;
        assign(p, p.default);
      }
    },
    scheduleSave() {
      if (!storageKey) return;
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try {
          const values: Record<string, ParamValue> = {};
          const bases: Record<string, ParamValue> = {};
          const ranges: Record<string, [number, number]> = {};
          for (const p of params) {
            if (edited(p) !== p.default) values[p.key] = edited(p);
            if (p.base !== p.default) bases[p.key] = p.base;
            if (p.min !== p.codeMin || p.max !== p.codeMax) ranges[p.key] = [p.min!, p.max!];
          }
          localStorage.setItem(storageKey, JSON.stringify({ sig, values, bases, ranges, preset }));
        } catch { /* storage unavailable */ }
      }, 250);
    },
    applyPreset(name, seconds, glideNumbers = true) {
      const values = presets?.[name];
      if (!values) return;
      store.setBypass(false);
      // Its params are clean at its values; the rest keep their bases (so what an earlier preset
      // set and this one doesn't still counts as unchanged, and a user's edit as changed).
      preset = name;
      for (const k in values) if (byKey[k]) byKey[k].base = coerce(byKey[k], values[k]);
      glides = [];
      for (const key in values) {
        const p = byKey[key];
        if (!p) continue;
        const to = coerce(p, values[key]);
        if (seconds <= 0 || p.type === 'select' || p.type === 'bool' || (p.type !== 'color' && !glideNumbers)) {
          assign(p, to);
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
          assign(g.p, rgbToHex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k));
        } else assign(g.p, g.from + (g.to - g.from) * k);
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
        for (const k in saved.values) if (byKey[k]) assign(byKey[k], saved.values[k]);
        for (const k in saved.bases || {}) if (byKey[k]) byKey[k].base = coerce(byKey[k], saved.bases[k]);
        for (const k in saved.ranges || {}) {
          const r = saved.ranges[k];
          if (byKey[k] && Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] < r[1]) [byKey[k].min, byKey[k].max] = r;
        }
        if (typeof saved.preset === 'string' && presets?.[saved.preset]) preset = saved.preset;
      }
    } catch { /* storage unavailable — run on defaults */ }
  }

  return store;
}
