// Homepage — theme switches.
//
// A switch starts at the click, Start size across, and its front grows outwards, slow at first
// and accelerating, until it has passed the whole screen; then its theme becomes the base.
//
// Its outline is Blackstar's: a closed Catmull-Rom spline through Points radii spaced evenly
// round the click, each swinging in and out on its own sine wave (own phase, speed and size),
// as a share of the reach. The CPU works the radii out each frame; the shader draws the
// spline through them (ringOffset in shader.js), and the page clips the new list to the same
// spline (radiusAt), so the two edges match. Time runs on its own clock (real seconds), so a
// switch plays out even while paused.

import { hash2 } from '../../kit/random.js';

/** Switches that can be in flight at once; a third folds the oldest into the base. */
export const MAX_SWITCHES = 2;
/** Most outline points a switch can have (the Points param's max). */
export const MAX_POINTS = 12;

const TAU = Math.PI * 2;

/** Catmull-Rom through four values, u = 0..1 between the middle two. */
const catmullRom = (/** @type {number} */ p0, /** @type {number} */ p1, /** @type {number} */ p2, /** @type {number} */ p3, /** @type {number} */ u) =>
  0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * (p1 - p2) + p3 - p0) * u * u * u);

/** @param {Record<string, any>} P */
export function createSwitches(P) {
  /** @type {{ theme: number, x: number, y: number, t0: number, id: number }[]} */
  const live = [];
  let base = 0;
  /** The theme along the top edge, Bars lead early (for the browser's bars). */
  let top = 0;
  let clock = 0;
  let nextId = 0;
  /** The newest switch's outline offsets and reach, as of the last update. */
  const ring = new Float32Array(MAX_POINTS);
  let newestReach = -1;

  /** Reach (CSS px) τ seconds into a switch on a screen with short side `short`. */
  const reach = (/** @type {number} */ tau, /** @type {number} */ short) =>
    P.startSize.value / 2 + short * (P.switchSpeed.value * tau + 0.5 * P.switchAccel.value * tau * tau);

  /**
   * Whether switch `sp`'s deepest dip, `lead` seconds from now, has passed the screen's sides
   * at `dy` below or above the click. (The spline can overshoot its points a little, hence the
   * 1.5.)
   * @param {{ x: number, t0: number }} sp
   */
  const covers = (sp, /** @type {number} */ w, /** @type {number} */ short, /** @type {number} */ dy, /** @type {number} */ lead) =>
    reach(clock + lead - sp.t0, short) * (1 - 1.5 * P.wobble.value) >= Math.hypot(Math.max(sp.x, w - sp.x), dy) + 1;

  /** Point i's offset (a share of the reach) τ seconds into switch `id`. */
  function point(/** @type {number} */ id, /** @type {number} */ i, /** @type {number} */ tau) {
    const k = id * 31 + i;
    const amp = P.wobble.value * (1 - P.wobbleAmpJitter.value * hash2(k, 1));
    const freq = P.wobbleSpeed.value * (1 + P.wobbleSpeedJitter.value * (hash2(k, 2) * 2 - 1));
    return amp * Math.sin(TAU * (freq * tau + hash2(k, 3)));
  }

  return {
    /** The theme the page is heading to (0 projects, 1 roles). */
    get target() { return live.length ? live[live.length - 1].theme : base; },

    /** The theme drawn right along the top edge, Bars lead early (as of the last update). */
    get topEdge() { return top; },

    /** Whether a switch is under way (as of the last update). */
    get running() { return newestReach >= 0; },

    /**
     * The newest switch's radius (CSS px) at angle `a` (radians, from +x towards +y, CSS y
     * down), as of the last update. Matches the shader's ringOffset.
     */
    radiusAt(/** @type {number} */ a) {
      const n = P.wobblePoints.value;
      const s = (((a / TAU) % 1) + 1) % 1 * n;
      const k = Math.floor(s);
      const off = catmullRom(ring[(k + n - 1) % n], ring[k % n], ring[(k + 1) % n], ring[(k + 2) % n], s - k);
      return newestReach * (1 + off);
    },

    /** Switch at once (start-up, reduced motion, the Active tab param). */
    jump(/** @type {number} */ theme) {
      base = top = theme;
      live.length = 0;
      newestReach = -1;
    },

    /** Start a switch to `theme` at (x, y), CSS px. */
    start(/** @type {number} */ theme, /** @type {number} */ x, /** @type {number} */ y) {
      if (theme === this.target) return;
      if (live.length === MAX_SWITCHES) base = /** @type {{ theme: number }} */ (live.shift()).theme;
      live.push({ theme, x, y, t0: clock, id: nextId++ });
    },

    /**
     * Advance the clock and write the switches into the frame uniforms. Allocation-free.
     * @param {number} dt real seconds
     * @param {Record<string, Float32Array>} f
     */
    update(dt, /** @type {number} */ w, /** @type {number} */ h, f) {
      clock += dt;
      const short = Math.min(w, h);
      const n = P.wobblePoints.value;
      // A switch that has passed the furthest corner becomes the base, with any older ones.
      for (let s = live.length - 1; s >= 0; s--) {
        const sp = live[s];
        if (covers(sp, w, short, Math.max(sp.y, h - sp.y), 0)) {
          base = sp.theme;
          live.splice(0, s + 1);
          break;
        }
      }
      // Likewise the top edge, by its corners, a little early; newer switches draw over older ones.
      top = base;
      for (let s = 0; s < live.length; s++) if (covers(live[s], w, short, live[s].y, P.barsLead.value)) top = live[s].theme;

      f.f_baseTheme[0] = base;
      f.f_switchCount[0] = live.length;
      f.f_ringCount[0] = n;
      newestReach = -1;
      for (let s = 0; s < live.length; s++) {
        const sp = live[s];
        const tau = clock - sp.t0;
        const k = s * 4;
        f.f_switch[k] = sp.x;
        f.f_switch[k + 1] = sp.y;
        f.f_switch[k + 2] = reach(tau, short);
        f.f_switch[k + 3] = sp.theme;
        for (let i = 0; i < n; i++) f.f_ring[s * MAX_POINTS + i] = point(sp.id, i, tau);
      }
      if (live.length) {
        const s = live.length - 1;
        newestReach = f.f_switch[s * 4 + 2];
        for (let i = 0; i < n; i++) ring[i] = f.f_ring[s * MAX_POINTS + i];
      }
    },
  };
}
