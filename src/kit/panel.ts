// The settings pane: one row per param, generated from params.js, plus the changes line
// (with its show-changes checkbox), Reset and Copy changes. Copy produces a state blob the
// glimmers-state skill bakes into params.js.
//
// Sliders mark their home (the base value) once moved off it, and offer to re-centre their
// range on the value when it's pinned at an end.

import type { ParamStore } from './params';
import type { Param, Presets } from './types';
import { createColourPicker } from './colour-picker';
import { jumpTo, newerBuild } from './version';

export const STATE_TAG = 'state@1';

interface PanelOptions {
  slug: string;
  store: ParamStore;
  /** Called after every edit made in the pane. */
  onEdited(): void;
  /** The sketch's presets, if it has any: shown as a dropdown at the top of the pane. */
  presets?: Presets;
  /** Called when one is picked. */
  onPreset?(name: string): void;
}

export interface Panel {
  syncAll(): void;
  /** Refresh which rows are shown, the changes line and Reset's visibility. */
  refreshStatus(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Keep phone keyboards to their smallest form: no autocomplete/suggestion row, no auto-capitals. */
function noSuggestions(input: HTMLInputElement): void {
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.enterKeyHint = 'done';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
}

export function buildPanel({ slug, store, onEdited, presets, onPreset }: PanelOptions): Panel {
  const controls = document.getElementById('controls')!;
  const copyBtn = document.getElementById('copy') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset') as HTMLButtonElement;
  const statusEl = document.getElementById('status')!;
  const showBox = document.getElementById('show-changes') as HTMLInputElement;
  const rows: { p: Param; wrap: HTMLElement; sync(): void }[] = [];
  const picker = createColourPicker();

  function buildRow(p: Param): HTMLElement {
    const wrap = el('div', 'row row-' + p.type);
    // Dependent params sit under their parent, marked "- " per level.
    const label = el('label', 'lbl', '- '.repeat(p.depth) + p.label);
    const id = 'p-' + p.key;
    label.htmlFor = id;
    label.title = (p.desc ? p.desc + '\n' : '') + 'key: ' + p.key + ' · default: ' + p.default;
    // Labels stay linked to their control for accessibility, but a click on one must not activate it
    // (that opened the colour picker / toggled checkboxes); double-click is reserved for reset.
    label.addEventListener('click', (e) => e.preventDefault());
    label.addEventListener('dblclick', () => { store.setValue(p, p.base); sync(); onEdited(); });
    wrap.appendChild(label);
    const mark = () => wrap.classList.toggle('changed', store.isChanged(p));

    let sync: () => void;
    if (p.type === 'bool') {
      const box = el('input');
      box.type = 'checkbox';
      box.id = id;
      box.addEventListener('change', () => { store.setValue(p, box.checked); sync(); onEdited(); });
      wrap.appendChild(box);
      sync = () => { box.checked = !!p.value; mark(); };
    } else if (p.type === 'select') {
      const menu = el('select');
      menu.id = id;
      for (const o of p.options!) menu.appendChild(el('option', null, o)).value = o;
      menu.addEventListener('change', () => { store.setValue(p, menu.value); sync(); onEdited(); });
      wrap.appendChild(menu);
      sync = () => { menu.value = String(p.value); mark(); };
    } else if (p.type === 'color') {
      // A swatch that opens the kit's colour picker (colour-picker.ts), plus the hex to type in.
      const pick = el('button', 'swatch');
      pick.type = 'button';
      pick.id = id;
      pick.setAttribute('aria-haspopup', 'dialog');
      pick.setAttribute('aria-expanded', 'false');
      const hex = el('input', 'num');
      hex.type = 'text';
      hex.maxLength = 7;
      noSuggestions(hex);
      pick.addEventListener('click', () => {
        if (picker.anchor === pick) { picker.close(); return; }
        picker.open(pick, String(p.value), (v) => {
          store.setValue(p, v);
          pick.style.background = hex.value = String(p.value);
          mark();
          onEdited();
        });
      });
      hex.addEventListener('change', () => { store.setValue(p, hex.value.trim().replace(/^#?/, '#')); sync(); onEdited(); });
      wrap.append(pick, hex);
      sync = () => {
        pick.style.background = hex.value = String(p.value);
        if (picker.anchor === pick) picker.follow(String(p.value));
        mark();
      };
    } else {
      const track = el('span', 'track');
      const range = el('input');
      range.type = 'range';
      range.id = id;
      range.step = String(p.step);
      // Home: where the base value sits, shown once the value leaves it. Not interactive.
      const home = el('i', 'home');
      home.setAttribute('aria-hidden', 'true');
      // Pinned at an end: re-centre the range on the value. Not for sliders that end at 1 or 100
      // (shares and percentages, whose ends mean something), nor at a 0 floor (an amount can't
      // go below none).
      const rerange = el('button', 'rerange', '↔');
      rerange.type = 'button';
      rerange.title = 'Re-centre this slider\'s range on its value (this browser only; Copy changes carries it).';
      const fixedEnds = p.codeMin! >= 0 && (p.codeMax === 1 || p.codeMax === 100);
      rerange.addEventListener('click', () => {
        const w = p.max! - p.min!, v = Number(p.value);
        let lo = v - w / 2, hi = v + w / 2;
        if (p.codeMin! >= 0 && lo < 0) { lo = 0; hi = w; }
        store.setRange(p, Number(lo.toFixed(p.decimals)), Number(hi.toFixed(p.decimals)));
        sync();
        onEdited();
      });
      track.append(range, home, rerange);
      const place = () => {
        range.min = String(p.min);
        range.max = String(p.max);
        const lo = p.min!, hi = p.max!, b = Number(p.base), v = Number(p.value);
        home.hidden = !store.isChanged(p) || b < lo || b > hi;
        // The thumb is 10px wide, so its centre runs from 5px to the width − 5px.
        home.style.left = 'calc(5px + (100% - 10px) * ' + ((b - lo) / (hi - lo)) + ')';
        const atMin = v <= lo && lo !== 0, atMax = v >= hi;
        rerange.hidden = fixedEnds || store.bypassed || !(atMin || atMax);
        rerange.classList.toggle('at-min', atMin);
      };
      const num = el('input', 'num');
      num.type = 'number';
      num.step = String(p.step);
      // Phones: the compact digit pad. It has no minus key on iOS, so params that can go negative
      // keep the default number keyboard.
      if (p.min != null && p.min >= 0) num.inputMode = Number.isInteger(p.step) ? 'numeric' : 'decimal';
      noSuggestions(num);
      // The number box deliberately has no min/max: type past the slider range if you need to.
      range.addEventListener('input', () => { store.setValue(p, range.value); num.value = String(p.value); mark(); place(); onEdited(); });
      num.addEventListener('change', () => { store.setValue(p, num.value); sync(); onEdited(); });
      wrap.append(track, num);
      sync = () => { place(); range.value = String(p.value); num.value = String(p.value); mark(); };
    }
    wrap.title = p.desc || '';
    sync();
    rows.push({ p, wrap, sync });
    return wrap;
  }

  const names = presets ? Object.keys(presets) : [];
  if (names.length) {
    // Presets: pick one to morph every setting it names; the menu then rests on "—" again,
    // since any edit afterwards makes the settings your own.
    const wrap = el('div', 'row row-select row-preset');
    const label = el('label', 'lbl', 'Preset');
    label.htmlFor = 'p--preset';
    const menu = el('select');
    menu.id = 'p--preset';
    menu.appendChild(el('option', null, '—')).value = '';
    for (const n of names) menu.appendChild(el('option', null, n)).value = n;
    menu.addEventListener('change', () => {
      if (menu.value && onPreset) onPreset(menu.value);
      menu.value = '';
    });
    wrap.append(label, menu);
    wrap.title = 'Morph to a preset. Settings it doesn\'t name are left as they are.';
    controls.appendChild(wrap);
  }

  for (const group of store.groups) {
    const det = el('details', 'group');
    det.open = true;
    det.appendChild(el('summary', null, group.group));
    for (const p of group.params) det.appendChild(buildRow(p));
    controls.appendChild(det);
  }

  const panel: Panel = {
    syncAll() { for (const r of rows) r.sync(); },
    refreshStatus() {
      for (const r of rows) r.wrap.hidden = !store.isShown(r.p);
      const n = store.changedCount();
      statusEl.textContent = n === 0 ? 'No changes' : n + (n === 1 ? ' change' : ' changes');
      resetBtn.hidden = n === 0;
      showBox.hidden = n === 0;
      showBox.checked = !store.bypassed;
      controls.classList.toggle('bypassed', store.bypassed);
    },
  };

  // ---- show changes: untick to see the bases (defaults or preset) in place of the edits, for
  // before/after comparison. The edits are held; the controls rest until it's ticked again.
  showBox.addEventListener('change', () => {
    store.setBypass(!showBox.checked);
    panel.syncAll();
    onEdited();
  });

  // ---- copy state
  function buildState(): string {
    // Edits since the preset (if one was applied): `from` is its value, or the default.
    const changed: Record<string, { from: unknown; to: unknown; range?: [number, number] }> = {};
    for (const p of store.params) {
      if (!store.isChanged(p) || !store.isShown(p)) continue;
      changed[p.key] = { from: p.base, to: store.edited(p) };
      // A slider re-centred in the pane: bake its new range too.
      if (p.min !== p.codeMin || p.max !== p.codeMax) changed[p.key].range = [p.min!, p.max!];
    }
    return JSON.stringify({ glimmers: STATE_TAG, sketch: slug, ...(store.preset ? { preset: store.preset } : {}), changed }, null, 2);
  }
  async function writeClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = el('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
      return ok;
    }
  }
  let copyTimer = 0;
  copyBtn.addEventListener('click', async () => {
    const text = buildState();
    const ok = await writeClipboard(text);
    if (!ok) console.log(text);
    copyBtn.textContent = ok ? 'Copied' : 'Clipboard blocked — logged to console';
    clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => { copyBtn.textContent = 'Copy changes'; }, 1800);
  });

  // Reset to the newest defaults: if a newer build has been deployed since this tab
  // loaded, its params.js may have different defaults, so jump to that build.
  resetBtn.addEventListener('click', async () => {
    store.resetAll();
    panel.syncAll();
    onEdited();
    const v = await newerBuild();
    if (!v) return;
    store.clearSaved();
    jumpTo(v);
  });

  return panel;
}
