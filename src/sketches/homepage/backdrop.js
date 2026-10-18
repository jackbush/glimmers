// Homepage — the page colours under the text, and the warp at a switch's edge.
//
// The backdrop is an SVG at the bottom of .hp: the base theme's page colour, with each switch's
// outline (switches.js) filled with its theme's page colour on top. .hp isolates, so the ink
// copies blend with exactly this and nothing outside the page.
//
// While a switch runs, .hp takes the warp filter, which bends everything near the edge, page
// and text together. Each pixel is drawn from along the radius, Strength px further from the
// edge at the edge, easing to nothing Width px away on either side: a lens either side, with
// the sign flipping across the edge, so lines stretch towards it and kink as they cross.
// Negative Strength draws each side from across the edge instead, doubling a strip of each.
// Curve shapes the easing like tan: flat far off, steep near the edge. The displacement map is SVG too: two quads per wedge round each edge, inside
// and outside, each with a gradient across the band along the edge's normal, its colour the
// wedge's direction (feDisplacementMap reads red as x, green as y, ½ as none), over neutral
// grey. It's drawn in the backdrop a screen's width (and a gap) left of the screen, where the
// filter offsets it onto the screen, bends the page by it and crops it away. Browsers won't
// bend by a map from feImage of an element (it could leak other origins' pixels), but they
// will by the element's own.

import { MODES } from './page.js';
import { COS, MAX_SWITCHES, OUTLINE_POINTS, SIN } from './switches.js';

const SVG = 'http://www.w3.org/2000/svg';
/** Wedges round each edge in the warp map, one per two outline samples. */
const STEP = 2;
const WEDGES = OUTLINE_POINTS / STEP;
/** Stops tracing the curve across each half of the band. */
const STOPS = 8;

/** Space between the map and the screen, more than the strongest warp reaches. */
const GAP = 100;

// Lengths moved each frame start as plain numbers: their defaults are percentages, and setting
// a percentage's value takes it as a share of the (zero-size) SVG.
const PX_BOX = { x: '0', y: '0', width: '0', height: '0' };
const PX_ENDS = { x1: '0', y1: '0', x2: '0', y2: '0' };

const svgEl = (/** @type {string} */ tag, /** @type {Record<string, string>} */ attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/** A polygon with `n` points to move, and its points. */
function polygon(/** @type {SVGSVGElement} */ svg, /** @type {number} */ n, /** @type {Record<string, string>} */ attrs = {}) {
  const poly = /** @type {SVGPolygonElement} */ (svgEl('polygon', attrs));
  for (let j = 0; j < n; j++) poly.points.appendItem(svg.createSVGPoint());
  return { poly, pts: [...Array(n).keys()].map((j) => poly.points.getItem(j)) };
}

export function createBackdrop() {
  const svg = /** @type {SVGSVGElement} */ (svgEl('svg', { class: 'hp-backdrop', 'aria-hidden': 'true' }));
  const base = svgEl('rect', { width: '100%', height: '100%', 'data-page': MODES[0] });
  const fills = [...Array(MAX_SWITCHES)].map(() => polygon(svg, OUTLINE_POINTS, { visibility: 'hidden' }));

  // The filter, and the gradients the map's quads take, outside .hp.
  const defs = /** @type {SVGSVGElement} */ (svgEl('svg', { 'aria-hidden': 'true', style: 'position: absolute; width: 0; height: 0;' }));
  const filter = /** @type {SVGFilterElement} */ (svgEl('filter', {
    id: 'hp-warp', filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB', ...PX_BOX,
  }));
  // Each step is cropped to the screen. The map comes in by its offset; the original goes
  // under the bent page, for the slivers at the screen's sides bent in from beyond it.
  const shift = /** @type {SVGFEOffsetElement} */ (svgEl('feOffset', { in: 'SourceGraphic', result: 'field', ...PX_BOX }));
  const displace = /** @type {SVGFEDisplacementMapElement} */ (svgEl('feDisplacementMap', {
    in: 'SourceGraphic', in2: 'field', xChannelSelector: 'R', yChannelSelector: 'G', result: 'bent', ...PX_BOX,
  }));
  const merge = svgEl('feMerge', PX_BOX);
  merge.append(svgEl('feMergeNode', { in: 'SourceGraphic' }), svgEl('feMergeNode', { in: 'bent' }));
  filter.append(shift, displace, merge);
  const steps = /** @type {SVGFilterPrimitiveStandardAttributes[]} */ ([shift, displace, merge]);

  // Each wedge's two gradients' stops (inside, outside), shared by every switch's quads there.
  const templates = [...Array(WEDGES)].map((_, k) => ['in', 'out'].map((side) => {
    const g = svgEl('linearGradient', { id: `hp-warp-${side}-${k}` });
    for (let i = 0; i < STOPS; i++) g.append(svgEl('stop', { offset: String(i / (STOPS - 1)) }));
    return g;
  }));
  // The map, over neutral grey the size of the screen and clipped to it (a big switch's band
  // reaches far beyond), drawn shifted left. Each switch's quads: inside then outside per wedge,
  // with their own gradient's ends.
  const clip = svgEl('clipPath', { id: 'hp-warp-clip' });
  const clipBox = /** @type {SVGRectElement} */ (svgEl('rect', PX_BOX));
  clip.append(clipBox);
  const clipped = svgEl('g', { 'clip-path': 'url(#hp-warp-clip)', visibility: 'hidden' });
  const map = /** @type {SVGGElement} */ (svgEl('g', { 'shape-rendering': 'crispEdges', transform: 'translate(0 0)' }));
  clipped.append(map);
  const grey = /** @type {SVGRectElement} */ (svgEl('rect', { fill: 'rgb(128, 128, 128)', ...PX_BOX }));
  map.append(grey);
  const quads = [...Array(MAX_SWITCHES)].map((_, s) => {
    const group = svgEl('g', { visibility: 'hidden' });
    const wedges = [...Array(WEDGES)].map((_, k) => ['in', 'out'].map((side) => {
      const id = `hp-warp-${s}-${side}-${k}`;
      const grad = /** @type {SVGLinearGradientElement} */ (svgEl('linearGradient', { id, href: `#hp-warp-${side}-${k}`, gradientUnits: 'userSpaceOnUse', ...PX_ENDS }));
      const { poly, pts } = polygon(svg, 4, { fill: `url(#${id})` });
      group.append(poly);
      return { grad, pts };
    }));
    map.append(group);
    return { group, wedges };
  });
  svg.append(base, ...fills.map((f) => f.poly), clipped);
  defs.append(svgEl('defs', {}), filter, clip);
  /** @type {Element} */ (defs.firstChild).append(...templates.flat(), ...quads.flatMap((q) => q.wedges.flat().map((w) => w.grad)));
  const offset = map.transform.baseVal.getItem(0);

  let shown = 0, curve = NaN, warped = false;

  return {
    /** The backdrop, for the bottom of .hp. */
    svg,
    /** The filter and map, for anywhere outside .hp. */
    defs,
    /** The CSS filter that warps .hp. */
    filter: 'url(#hp-warp)',

    /**
     * Shape the warp's gradients to the Curve param. Call when it changes.
     * @param {Record<string, any>} P
     */
    sync(P) {
      if (P.warpCurve.value === curve) return;
      curve = P.warpCurve.value;
      // Displacement across a half band, 0 at its far side to 1 at the edge: tan, scaled to end at 1.
      const theta = (curve * Math.PI) / 2;
      const ease = (/** @type {number} */ t) => (theta > 1e-3 ? Math.tan(theta * t) / Math.tan(theta) : t);
      const channel = (/** @type {number} */ v) => Math.round((0.5 + 0.5 * v) * 255);
      templates.forEach((sides, k) => {
        const a = ((k * STEP + STEP / 2) / OUTLINE_POINTS) * Math.PI * 2;
        sides.forEach((g, side) => g.querySelectorAll('stop').forEach((stop, i) => {
          const t = i / (STOPS - 1);
          // Inside, the gradient runs from the band's far side to the edge (0 → inwards);
          // outside, from the edge to the far side (outwards → 0).
          const d = side === 0 ? -ease(t) : ease(1 - t);
          stop.setAttribute('stop-color', `rgb(${channel(Math.cos(a) * d)}, ${channel(Math.sin(a) * d)}, 128)`);
        }));
      });
    },

    /**
     * Draw the switches and, if it's on, the warp map. The screen is (vx, vy, w, h) in page px.
     * Returns whether .hp should take the filter. Allocation-free.
     * @param {import('./switches.js').Switches} sw
     * @param {Record<string, any>} P
     */
    update(sw, P, /** @type {number} */ vx, /** @type {number} */ vy, /** @type {number} */ w, /** @type {number} */ h) {
      base.setAttribute('data-page', MODES[sw.base]);
      for (let s = 0; s < MAX_SWITCHES; s++) {
        const on = s < sw.count;
        if (on !== s < shown) {
          fills[s].poly.setAttribute('visibility', on ? 'visible' : 'hidden');
          quads[s].group.setAttribute('visibility', on ? 'visible' : 'hidden');
        }
        if (!on) continue;
        fills[s].poly.setAttribute('data-page', MODES[sw.theme[s]]);
        const cx = sw.x[s], cy = sw.y[s], o = s * OUTLINE_POINTS;
        const pts = fills[s].pts;
        for (let j = 0; j < OUTLINE_POINTS; j++) {
          pts[j].x = cx + COS[j] * sw.radius[o + j];
          pts[j].y = cy + SIN[j] * sw.radius[o + j];
        }
      }
      shown = sw.count;

      const strength = P.warp.value, width = P.warpWidth.value;
      const warping = sw.count > 0 && strength !== 0 && width > 0;
      if (warping !== warped) clipped.setAttribute('visibility', (warped = warping) ? 'visible' : 'hidden');
      if (!warping) return false;
      // The filter takes in the map, left of the screen, and puts out the screen.
      const off = w + GAP;
      filter.x.baseVal.value = vx - off;
      filter.y.baseVal.value = vy;
      filter.width.baseVal.value = w + off;
      filter.height.baseVal.value = h;
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        step.x.baseVal.value = vx;
        step.y.baseVal.value = vy;
        step.width.baseVal.value = w;
        step.height.baseVal.value = h;
      }
      offset.setTranslate(-off, 0);
      clipBox.x.baseVal.value = vx - off;
      clipBox.y.baseVal.value = vy;
      clipBox.width.baseVal.value = w;
      clipBox.height.baseVal.value = h;
      shift.dx.baseVal = off;
      grey.x.baseVal.value = vx;
      grey.y.baseVal.value = vy;
      grey.width.baseVal.value = w;
      grey.height.baseVal.value = h;
      displace.scale.baseVal = 2 * strength;
      for (let s = 0; s < sw.count; s++) {
        const cx = sw.x[s], cy = sw.y[s], o = s * OUTLINE_POINTS;
        const wedges = quads[s].wedges;
        for (let k = 0; k < WEDGES; k++) {
          const j0 = k * STEP, j1 = (j0 + STEP) % OUTLINE_POINTS;
          const r0 = sw.radius[o + j0], r1 = sw.radius[o + j1];
          // Inside, the band stops at the click.
          const in0 = Math.max(0, r0 - width), in1 = Math.max(0, r1 - width);
          const bx = cx + COS[j0] * r0, by = cy + SIN[j0] * r0, ex = cx + COS[j1] * r1, ey = cy + SIN[j1] * r1;
          // The edge's outward normal across this wedge, and its middle.
          const tx = ex - bx, ty = ey - by, len = Math.hypot(tx, ty) || 1;
          const nx = ty / len, ny = -tx / len, mx = (bx + ex) / 2, my = (by + ey) / 2;
          const inner = Math.min(width, (r0 + r1) / 2);
          const inside = wedges[k][0], outside = wedges[k][1];
          let p = inside.pts;
          p[0].x = cx + COS[j0] * in0; p[0].y = cy + SIN[j0] * in0;
          p[1].x = bx; p[1].y = by;
          p[2].x = ex; p[2].y = ey;
          p[3].x = cx + COS[j1] * in1; p[3].y = cy + SIN[j1] * in1;
          let g = inside.grad;
          g.x1.baseVal.value = mx - nx * inner; g.y1.baseVal.value = my - ny * inner;
          g.x2.baseVal.value = mx; g.y2.baseVal.value = my;
          p = outside.pts;
          p[0].x = bx; p[0].y = by;
          p[1].x = cx + COS[j0] * (r0 + width); p[1].y = cy + SIN[j0] * (r0 + width);
          p[2].x = cx + COS[j1] * (r1 + width); p[2].y = cy + SIN[j1] * (r1 + width);
          p[3].x = ex; p[3].y = ey;
          g = outside.grad;
          g.x1.baseVal.value = mx; g.y1.baseVal.value = my;
          g.x2.baseVal.value = mx + nx * width; g.y2.baseVal.value = my + ny * width;
        }
      }
      return true;
    },
  };
}
