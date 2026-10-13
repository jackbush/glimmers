// The frame loop: timing, canvas sizing and adaptive quality. Allocation-free per frame.
//
// Scene time `t` runs at the Speed param and stops while `paused` (the play/pause button);
// real time `rt` always runs (wrapped to keep float32 precision in shaders). The canvas is sized to its CSS box ×
// min(devicePixelRatio, maxDpr) × renderScale × the adaptive scale.

import type { Param, SketchInstance } from './types';

export interface Loop {
  start(): void;
  stop(): void;
  /** Render exactly one frame `dt` seconds after the last (capture mode). */
  step(dt: number): void;
  degrade(factor: number): void;
  /** Called twice a second with a status line for the pane header. */
  onStats: ((text: string) => void) | null;
  /** Freezes scene time; real time keeps running. */
  paused: boolean;
  /** Frames rendered so far (scripts/bench.mjs reads this). */
  readonly frames: number;
}

const MIN_SCALE = 0.35;

export function createLoop(canvas: HTMLCanvasElement, P: Record<string, Param>, sketch: () => SketchInstance | null): Loop {
  const P_timeScale = P.timeScale;
  const P_renderScale = P.renderScale, P_maxDpr = P.maxDpr;
  const P_adaptive = P.adaptive, P_targetFps = P.targetFps;

  let raf = 0, last = 0, sceneTime = 0, realTime = 0;
  let fpsAccum = 0, fpsFrames = 0;
  let lastW = 0, lastH = 0, lastRatio = 0, frames = 0;

  // ---- adaptive quality
  // dynScale multiplies the render resolution. It drops when frames run slower than the target and
  // creeps back up when there's headroom. A drop that doesn't actually speed things up (the display or
  // power mode is capping fps, not the GPU) is undone, and dropping pauses for a while.
  let dynScale = 1;
  let winTime = 0, winFrames = 0, sinceChange = 0, ceiling = 1, ceilingAge = 0;
  let judgingDrop = false, preDropScale = 1, preDropAvg = 0, holdDown = 0, holdDownLen = 5;

  function adaptive(): boolean { return !!(P_adaptive && P_adaptive.value); }

  function adapt(dt: number) {
    if (!adaptive()) { dynScale = 1; return; }
    winTime += dt;
    winFrames++;
    sinceChange += dt;
    ceilingAge += dt;
    holdDown -= dt;
    if (winTime < 0.5) return;
    const avg = winTime / winFrames;
    winTime = 0;
    winFrames = 0;
    const budget = 1 / (P_targetFps ? (P_targetFps.value as number) : 60);

    if (judgingDrop) {
      judgingDrop = false;
      if (avg > preDropAvg * 0.92) { // didn't help → not GPU-bound
        dynScale = preDropScale;
        ceiling = 1;
        holdDown = holdDownLen;
        holdDownLen = Math.min(holdDownLen * 2, 60);
        sinceChange = 0;
        return;
      }
      holdDownLen = 5;
    }
    if (avg > budget * 1.2 && dynScale > MIN_SCALE && holdDown <= 0 && sinceChange > 0.5) {
      preDropScale = dynScale;
      preDropAvg = avg;
      dynScale = Math.max(MIN_SCALE, dynScale * 0.8);
      ceiling = preDropScale;
      ceilingAge = 0;
      judgingDrop = true;
      sinceChange = 0;
    } else if (avg < budget * 1.08 && dynScale < 1 && sinceChange > 2) {
      const next = Math.min(1, dynScale * 1.12);
      if (next < ceiling * 0.97 || ceilingAge > 20) {
        dynScale = next;
        sinceChange = 0;
      }
    }
  }

  function resizeIfNeeded(s: SketchInstance) {
    const maxDpr = P_maxDpr ? (P_maxDpr.value as number) : 2;
    const scale = P_renderScale ? (P_renderScale.value as number) : 1;
    const ratio = Math.min(window.devicePixelRatio || 1, maxDpr) * scale * dynScale;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const w = Math.max(1, Math.round(cw * ratio));
    const h = Math.max(1, Math.round(ch * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const px = cw > 0 ? w / cw : 1;
    if (w !== lastW || h !== lastH || px !== lastRatio) {
      lastW = w;
      lastH = h;
      lastRatio = px;
      s.resize(w, h, px);
    }
  }

  function render(dt: number) {
    const s = sketch();
    if (!s) return;
    realTime = (realTime + dt) % 10000; // keep float32 precision in shaders
    const sdt = loop.paused ? 0 : dt * (P_timeScale ? (P_timeScale.value as number) : 1);
    sceneTime += sdt;
    adapt(dt);
    resizeIfNeeded(s);
    s.frame(sceneTime, sdt, realTime);
    frames++;

    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      if (loop.onStats) {
        // e.g. "2940×2240dp @ 60fps (100%)": canvas size in device pixels, frames per
        // second, and adaptive quality's resolution scale (only when it's on).
        loop.onStats(canvas.width + '×' + canvas.height + 'dp @ ' + Math.round(fpsFrames / fpsAccum) + 'fps' +
          (adaptive() ? ' (' + Math.round(dynScale * 100) + '%)' : ''));
      }
      fpsAccum = 0;
      fpsFrames = 0;
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) * 0.001, 0.1) : 0; // clamp after tab switches
    last = now;
    render(dt);
  }

  const loop: Loop = {
    onStats: null,
    paused: false,
    get frames() { return frames; },
    start() {
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    step(dt) { render(dt); },
    degrade(factor) { dynScale = Math.max(MIN_SCALE, dynScale * factor); },
  };
  return loop;
}
