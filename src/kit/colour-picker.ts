// The colour picker the pane opens instead of the browser's: a small window with the colour as a
// wide bar, an OKHSL square (saturation across, lightness up) for the current hue, and a hue band
// under it. OKHSL (okhsl.ts) is HSL rebuilt on OKLab: even steps look even, and the whole square
// is inside sRGB, which is what params store.
//
// The picker owns its coordinates, so the hue survives a pass through grey. Desktop: 90% of the
// pane's width, centred on it, under the row being edited and nudged up to stay on screen; drag
// its title bar to put it elsewhere, and it stays there until the page reloads. Phones: full
// screen. A press outside it, or Escape, closes it.

import { hexToOkhsl, okhslRow, okhslToHex } from './okhsl';

/** Square fill resolution: a smooth gradient, computed small and stretched. */
const FILL = 96;
/** Stops in the hue band's gradient. */
const HUE_STOPS = 24;
const PHONE = '(max-width: 699px)';
/** Gap kept between the window and the screen's edges. */
const MARGIN = 8;

export interface ColourPicker {
  /** Open for `anchor` (the row's swatch) at `hex`; `onInput` gets each new hex. */
  open(anchor: HTMLElement, hex: string, onInput: (hex: string) => void): void;
  close(): void;
  /** The swatch it's open for, if any. */
  readonly anchor: HTMLElement | null;
  /** The value changed elsewhere (typed, reset, preset): follow it unless it's our own. */
  follow(hex: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  parent?.appendChild(n);
  return n;
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function createColourPicker(): ColourPicker {
  const win = el('div', 'picker');
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Colour picker');
  win.hidden = true;
  const bar = el('div', 'picker-bar', win);
  el('span', 'picker-title', bar).textContent = 'Colour picker';
  const shut = el('button', 'picker-close', bar);
  shut.type = 'button';
  shut.setAttribute('aria-label', 'Close');
  shut.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>';
  const swatch = el('div', 'picker-swatch', win);
  const square = el('div', 'picker-square', win);
  square.tabIndex = 0;
  square.setAttribute('role', 'slider');
  square.setAttribute('aria-label', 'Saturation and lightness');
  const canvas = el('canvas', 'picker-canvas', square);
  canvas.width = canvas.height = FILL;
  const dot = el('div', 'picker-dot', square);
  const band = el('div', 'picker-hue', win);
  band.tabIndex = 0;
  band.setAttribute('role', 'slider');
  band.setAttribute('aria-label', 'Hue');
  band.setAttribute('aria-valuemin', '0');
  band.setAttribute('aria-valuemax', '360');
  const bandDot = el('div', 'picker-dot', band);
  document.body.appendChild(win);

  const ctx = canvas.getContext('2d')!;
  const pixels = new ImageData(FILL, FILL);

  let anchor: HTMLElement | null = null;
  let onInput: ((hex: string) => void) | null = null;
  // The picker's own coordinates (OKHSL, each 0–1), and the last hex it wrote.
  let H = 0, S = 0, L = 0.5, written = '', paintedHue = NaN;
  /** Where the window was dragged to (desktop), kept until reload; null = under the row. */
  let moved: { x: number; y: number } | null = null;

  function paintSquare() {
    if (H === paintedHue) return;
    paintedHue = H;
    const d = pixels.data;
    for (let py = 0; py < FILL; py++) {
      const row = okhslRow(H, 1 - py / (FILL - 1));
      for (let px = 0; px < FILL; px++) {
        const n = parseInt(row(px / (FILL - 1)).slice(1), 16), i = (py * FILL + px) * 4;
        d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
  }

  function render() {
    dot.style.left = clamp01(S) * 100 + '%';
    dot.style.top = (1 - L) * 100 + '%';
    bandDot.style.left = H * 100 + '%';
    swatch.style.background = written;
    let stops = '';
    for (let i = 0; i <= HUE_STOPS; i++) {
      stops += (i ? ', ' : '') + okhslToHex(i / HUE_STOPS, Math.min(1, S), L) + ' ' + (i / HUE_STOPS) * 100 + '%';
    }
    band.style.backgroundImage = 'linear-gradient(to right, ' + stops + ')';
    square.setAttribute('aria-valuetext', `Saturation ${Math.round(S * 100)}%, lightness ${Math.round(L * 100)}%`);
    band.setAttribute('aria-valuenow', String(Math.round(H * 360)));
    paintSquare();
  }

  function commit() {
    written = okhslToHex(H, S, L);
    render();
    onInput?.(written);
  }

  function setFrom(hex: string) {
    const o = hexToOkhsl(hex);
    S = o.s; L = o.l;
    if (!Number.isNaN(o.h)) H = o.h; // a grey keeps the hue it had
    written = hex;
  }

  /** Drag on an element: a 0–1 position until release. */
  function drag(target: HTMLElement, move: (fx: number, fy: number) => void) {
    const at = (e: PointerEvent) => {
      const r = target.getBoundingClientRect();
      return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)];
    };
    target.addEventListener('pointerdown', (e) => {
      target.setPointerCapture(e.pointerId);
      target.focus({ preventScroll: true });
      delete win.dataset.keys;
      e.preventDefault();
      const [fx, fy] = at(e);
      move(fx, fy);
    });
    target.addEventListener('pointermove', (e) => {
      if (!target.hasPointerCapture(e.pointerId)) return;
      const [fx, fy] = at(e);
      move(fx, fy);
    });
  }
  drag(square, (fx, fy) => { S = fx; L = 1 - fy; commit(); });
  drag(band, (fx) => { H = fx; commit(); });

  // The focus ring shows once the keyboard is in use, not after a drag.
  win.addEventListener('keydown', () => { win.dataset.keys = ''; });
  // Keys anywhere in the picker: left/right change saturation a percent, up/down lightness;
  // Alt (Option) with left/right turns the hue a degree instead. Shift: ten at a time.
  win.addEventListener('keydown', (e) => {
    if (shut === document.activeElement) return;
    const k = e.shiftKey ? 10 : 1;
    if (e.altKey && e.key === 'ArrowLeft') H = (H - k / 360 + 1) % 1;
    else if (e.altKey && e.key === 'ArrowRight') H = (H + k / 360) % 1;
    else if (e.key === 'ArrowLeft') S = clamp01(S - k / 100);
    else if (e.key === 'ArrowRight') S = clamp01(S + k / 100);
    else if (e.key === 'ArrowUp') L = clamp01(L + k / 100);
    else if (e.key === 'ArrowDown') L = clamp01(L - k / 100);
    else return;
    e.preventDefault();
    commit();
  });

  /** Keep the window wholly on screen at (x, y). */
  function put(x: number, y: number) {
    win.style.left = Math.max(MARGIN, Math.min(x, innerWidth - MARGIN - win.offsetWidth)) + 'px';
    win.style.top = Math.max(MARGIN, Math.min(y, innerHeight - MARGIN - win.offsetHeight)) + 'px';
  }
  /** Under the anchor's row, centred on the pane at 90% of its width; or where it was dragged. */
  function place() {
    if (!anchor) return;
    if (matchMedia(PHONE).matches) { win.style.cssText = ''; return; }
    const pane = (document.getElementById('panel') ?? document.body).getBoundingClientRect();
    win.style.width = pane.width * 0.9 + 'px';
    if (moved) { put(moved.x, moved.y); return; }
    const row = (anchor.closest('.row') ?? anchor).getBoundingClientRect();
    put(pane.left + pane.width * 0.05, row.bottom + 4);
  }

  // Desktop: the title bar moves the window.
  bar.addEventListener('pointerdown', (e) => {
    if (matchMedia(PHONE).matches || shut.contains(e.target as Node)) return;
    const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    bar.setPointerCapture(e.pointerId);
    e.preventDefault();
    const move = (m: PointerEvent) => {
      put(m.clientX - dx, m.clientY - dy);
      moved = { x: parseFloat(win.style.left), y: parseFloat(win.style.top) };
    };
    const end = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', end); };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
  });

  function close() {
    if (!anchor) return;
    const was = anchor;
    win.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    anchor = null;
    onInput = null;
    if (win.contains(document.activeElement)) was.focus();
  }

  // A press anywhere outside closes it (the swatch that opened it toggles it itself).
  document.addEventListener('pointerdown', (e) => {
    if (anchor && !win.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  }, true);
  // Escape closes the picker only; the pane (chrome.ts, on window) stays open.
  document.addEventListener('keydown', (e) => { if (anchor && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  shut.addEventListener('click', close);
  addEventListener('resize', place);
  document.getElementById('controls')?.addEventListener('scroll', () => { if (!moved) place(); }, { passive: true });

  return {
    open(a, hex, cb) {
      if (anchor) close();
      anchor = a;
      onInput = cb;
      anchor.setAttribute('aria-expanded', 'true');
      setFrom(hex);
      win.hidden = false;
      render();
      place();
      square.focus({ preventScroll: true });
    },
    close,
    get anchor() { return anchor; },
    follow(hex) {
      if (!anchor || hex === written) return;
      setFrom(hex);
      render();
    },
  };
}
