// The settings pane: one row per param, generated from params.js, plus the changes line,
// Reset and Copy changes. Copy produces a state blob the glimmers-state skill bakes into
// params.js.

import type { ParamStore } from './params';
import type { Param, Presets } from './types';
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
  const rows: { p: Param; wrap: HTMLElement; sync(): void }[] = [];

  function buildRow(p: Param): HTMLElement {
    const wrap = el('div', 'row row-' + p.type);
    // Dependent params sit under their parent, marked "- " per level.
    const label = el('label', 'lbl', '- '.repeat(p.depth) + p.label);
    const id = 'p-' + p.key;
    label.htmlFor = id;
    label.title = (p.desc ? p.desc + '\n' : '') + 'key: ' + p.key + ' · default: ' + p.default + '\nDouble-click to reset.';
    // Labels stay linked to their control for accessibility, but a click on one must not activate it
    // (that opened the colour picker / toggled checkboxes); double-click is reserved for reset.
    label.addEventListener('click', (e) => e.preventDefault());
    label.addEventListener('dblclick', () => { store.setValue(p, p.default); sync(); onEdited(); });
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
      const pick = el('input');
      pick.type = 'color';
      pick.id = id;
      const hex = el('input', 'num');
      hex.type = 'text';
      hex.maxLength = 7;
      noSuggestions(hex);
      pick.addEventListener('input', () => { store.setValue(p, pick.value); hex.value = String(p.value); mark(); onEdited(); });
      hex.addEventListener('change', () => { store.setValue(p, hex.value.trim().replace(/^#?/, '#')); sync(); onEdited(); });
      wrap.append(pick, hex);
      sync = () => { pick.value = String(p.value); hex.value = String(p.value); mark(); };
    } else {
      const range = el('input');
      range.type = 'range';
      range.id = id;
      range.min = String(p.min);
      range.max = String(p.max);
      range.step = String(p.step);
      const num = el('input', 'num');
      num.type = 'number';
      num.step = String(p.step);
      // Phones: the compact digit pad. It has no minus key on iOS, so params that can go negative
      // keep the default number keyboard.
      if (p.min != null && p.min >= 0) num.inputMode = Number.isInteger(p.step) ? 'numeric' : 'decimal';
      noSuggestions(num);
      // The number box deliberately has no min/max: type past the slider range if you need to.
      range.addEventListener('input', () => { store.setValue(p, range.value); num.value = String(p.value); mark(); onEdited(); });
      num.addEventListener('change', () => { store.setValue(p, num.value); sync(); onEdited(); });
      wrap.append(range, num);
      sync = () => { range.value = String(p.value); num.value = String(p.value); mark(); };
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
    },
  };

  // ---- copy state
  function buildState(): string {
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const p of store.params) if (store.isChanged(p) && store.isShown(p)) changed[p.key] = { from: p.default, to: p.value };
    return JSON.stringify({ glimmers: STATE_TAG, sketch: slug, changed }, null, 2);
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
