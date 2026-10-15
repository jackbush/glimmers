// Atlas Nights — pointer gestures on the sky.
//
// - A mouse hovers (its position, every move).
// - A touch that doesn't move is a tap (hover.js picks what it landed on).
// - A press that moves more across than up or down drags time: right runs it forward (the sky
//   turns east to west, left to right), one screen width = Drag span of a loop. A press that
//   moves more up or down than across is ignored entirely.

// How far a press moves (CSS px) before it's a drag rather than a tap or a click.
const SLOP = 6;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Record<string, any>} P
 * @param {(x: number, y: number) => void} onPoint called with CSS px when the mouse moves
 */
export function createInput(canvas, P, onPoint) {
  const state = {
    /** The mouse, CSS px from the canvas's top left; NaN when there's none. */
    x: NaN,
    y: NaN,
    /** A tap waiting to be picked up, at tapX, tapY (CSS px). */
    tapped: false,
    tapX: 0,
    tapY: 0,
    /** Scene seconds added by dragging. */
    scrub: 0,
  };
  /** @type {{ id: number, x0: number, y0: number, lastX: number, mode: 'pending' | 'scrub' | 'ignore' } | null} */
  let press = null;
  canvas.style.touchAction = 'none'; // touches arrive as pointer events, not page scrolls

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') state.x = state.y = NaN; // a touch: nothing is hovering
    press = { id: e.pointerId, x0: e.offsetX, y0: e.offsetY, lastX: e.offsetX, mode: 'pending' };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      state.x = e.offsetX;
      state.y = e.offsetY;
      onPoint(state.x, state.y);
    }
    if (!press || e.pointerId !== press.id) return;
    const dx = e.offsetX - press.x0, dy = e.offsetY - press.y0;
    if (press.mode === 'pending' && Math.hypot(dx, dy) > SLOP) press.mode = Math.abs(dx) > Math.abs(dy) ? 'scrub' : 'ignore';
    if (press.mode === 'scrub') {
      state.scrub += ((e.offsetX - press.lastX) / Math.max(canvas.clientWidth, 1)) * P.dragSpan.value * P.nightLength.value;
      press.lastX = e.offsetX;
    }
  });
  const release = (/** @type {PointerEvent} */ e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.mode === 'pending' && e.pointerType !== 'mouse') {
      state.tapped = true;
      state.tapX = e.offsetX;
      state.tapY = e.offsetY;
    }
    press = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', (e) => { if (press && e.pointerId === press.id) press = null; });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') state.x = state.y = NaN;
  });
  return state;
}
