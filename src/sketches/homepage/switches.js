// Homepage — theme switches.
//
// A switch starts at the click, Start size across, and its front grows outwards, slow at first
// and accelerating, until it has passed the whole screen; then its theme becomes the base.
//
// Its outline is Blackstar's: a closed Catmull-Rom spline through Points radii spaced evenly
// round the click, each swinging in and out on its own sine wave (own phase, speed and size),
// as a share of the reach. Each frame the spline is sampled at OUTLINE_POINTS angles, and the
// backdrop, the warp and the list reveal all draw from those radii, so their edges match.
// Switches sit in the page's coordinates (.hp's top left), so they scroll with it. Time runs on
// its own clock (real seconds), so a switch plays out even while paused.

import { hash2 } from '../../kit/random.js';

/** Switches that can be in flight at once; a third folds the oldest into the base. */
export const MAX_SWITCHES = 2;
/** Most spline points a switch can have (the Points param's max). */
export const MAX_POINTS = 12;
/** Samples round each outline: at a full-screen radius, 256 chords sit within a pixel of the curve. */
export const OUTLINE_POINTS = 256;

const TAU = Math.PI * 2;
/** The outline's sample directions: from +x towards +y (CSS y down). */
export const COS = Float32Array.from({ length: OUTLINE_POINTS }, (_, j) => Math.cos((j / OUTLINE_POINTS) * TAU));
export const SIN = Float32Array.from({ length: OUTLINE_POINTS }, (_, j) => Math.sin((j / OUTLINE_POINTS) * TAU));

/** Catmull-Rom through four values, u = 0..1 between the middle two. */
const catmullRom = (/** @type {number} */ p0, /** @type {number} */ p1, /** @type {number} */ p2, /** @type {number} */ p3, /** @type {number} */ u) =>
  0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * (p1 - p2) + p3 - p0) * u * u * u);

/** @typedef {ReturnType<typeof createSwitches>} Switches */

/** @param {Record<string, any>} P */
export function createSwitches(P) {
  /** @type {{ theme: number, x: number, y: number, t0: number, id: number }[]} */
  const live = [];
  let clock = 0;
  let nextId = 0;
  const ring = new Float32Array(MAX_POINTS);

  /** Reach (CSS px) τ seconds into a switch on a screen with short side `short`. */
  const reach = (/** @type {number} */ tau, /** @type {number} */ short) =>
    P.startSize.value / 2 + short * (P.switchSpeed.value * tau + 0.5 * P.switchAccel.value * tau * tau);

  /**
   * Whether switch `sp`'s deepest dip, `lead` seconds from now, has passed a point `dx` across
   * and `dy` down from its click. (The spline can overshoot its points a little, hence the 1.5.)
   * @param {{ t0: number }} sp
   */
  const covers = (sp, /** @type {number} */ short, /** @type {number} */ dx, /** @type {number} */ dy, /** @type {number} */ lead) =>
    reach(clock + lead - sp.t0, short) * (1 - 1.5 * P.wobble.value) >= Math.hypot(dx, dy) + 1;

  /** Spline point i's offset (a share of the reach) τ seconds into switch `id`. */
  function point(/** @type {number} */ id, /** @type {number} */ i, /** @type {number} */ tau) {
    const k = id * 31 + i;
    const amp = P.wobble.value * (1 - P.wobbleAmpJitter.value * hash2(k, 1));
    const freq = P.wobbleSpeed.value * (1 + P.wobbleSpeedJitter.value * (hash2(k, 2) * 2 - 1));
    return amp * Math.sin(TAU * (freq * tau + hash2(k, 3)));
  }

  const sw = {
    /** The theme under every switch (0 projects, 1 roles), as of the last update. */
    base: 0,
    /** The theme drawn right along the top of the screen, Bars lead early. */
    topEdge: 0,
    /** Switches under way, oldest first; the rest of these arrays are theirs. */
    count: 0,
    /** Each switch's click, in page px. */
    x: new Float32Array(MAX_SWITCHES),
    y: new Float32Array(MAX_SWITCHES),
    theme: new Uint8Array(MAX_SWITCHES),
    /** Switch s's radius (page px) towards COS[j], SIN[j] is radius[s * OUTLINE_POINTS + j]. */
    radius: new Float32Array(MAX_SWITCHES * OUTLINE_POINTS),

    /** The theme the page is heading to. */
    get target() { return live.length ? live[live.length - 1].theme : sw.base; },

    /** Switch at once (start-up, reduced motion, the Active tab param). */
    jump(/** @type {number} */ theme) {
      sw.base = sw.topEdge = theme;
      live.length = sw.count = 0;
    },

    /** Start a switch to `theme` at (x, y), page px. */
    start(/** @type {number} */ theme, /** @type {number} */ x, /** @type {number} */ y) {
      if (theme === sw.target) return;
      if (live.length === MAX_SWITCHES) sw.base = /** @type {{ theme: number }} */ (live.shift()).theme;
      live.push({ theme, x, y, t0: clock, id: nextId++ });
    },

    /**
     * Advance the clock and sample every outline. The screen is (vx, vy, w, h) in page px.
     * Allocation-free.
     */
    update(/** @type {number} */ dt, /** @type {number} */ vx, /** @type {number} */ vy, /** @type {number} */ w, /** @type {number} */ h) {
      clock += dt;
      const short = Math.min(w, h);
      // A switch that has passed the screen's furthest corner becomes the base, with any older ones.
      for (let s = live.length - 1; s >= 0; s--) {
        const sp = live[s];
        const dx = Math.max(Math.abs(sp.x - vx), Math.abs(vx + w - sp.x));
        if (covers(sp, short, dx, Math.max(Math.abs(sp.y - vy), Math.abs(vy + h - sp.y)), 0)) {
          sw.base = sp.theme;
          live.splice(0, s + 1);
          break;
        }
      }
      // Likewise the top edge, by its corners, a little early; newer switches draw over older ones.
      sw.topEdge = sw.base;
      for (let s = 0; s < live.length; s++) {
        const sp = live[s];
        if (covers(sp, short, Math.max(Math.abs(sp.x - vx), Math.abs(vx + w - sp.x)), Math.abs(sp.y - vy), P.barsLead.value)) sw.topEdge = sp.theme;
      }

      const n = P.wobblePoints.value;
      sw.count = live.length;
      for (let s = 0; s < live.length; s++) {
        const sp = live[s];
        const tau = clock - sp.t0;
        const r = reach(tau, short);
        sw.x[s] = sp.x;
        sw.y[s] = sp.y;
        sw.theme[s] = sp.theme;
        for (let i = 0; i < n; i++) ring[i] = point(sp.id, i, tau);
        for (let j = 0; j < OUTLINE_POINTS; j++) {
          const u = (j / OUTLINE_POINTS) * n;
          const k = Math.floor(u);
          sw.radius[s * OUTLINE_POINTS + j] = r * (1 + catmullRom(ring[(k + n - 1) % n], ring[k % n], ring[(k + 1) % n], ring[(k + 2) % n], u - k));
        }
      }
    },
  };
  return sw;
}
