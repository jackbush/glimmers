// Homepage — the page itself, over the canvas: intro, the Projects/Roles toggle and both
// lists, as on jackbush.github.io, so the backdrop is judged under real text.
//
// The page is laid out four times in one grid cell. The first copy is the real one: tabs,
// links, focus and screen readers, with its text transparent. The other three are aria-hidden
// copies that only draw text, each in a blend layer over the canvas (ink.js), so every glyph
// takes the inverse of whichever page is under it and flips with the switch pixel by pixel.
// Nothing between them and the canvas may isolate them, or the blends only meet each other
// and the text goes dark: `.hp` is no stacking context, and the document scrolls (as on the
// site), not `.hp`, because Safari isolates a scroller's content.
//
// On a switch the intro stays (it just changes colour with the page), but the lists swap: the
// old one fades out over Old text fade, and the new one shows only inside the switch as it
// spreads (an SVG polygon clip, set each frame to the switch's outline, so it matches the
// canvas). Switching back mid-switch fades the half-revealed list over Interrupt
// fade instead. With reduced motion the lists swap at once.
//
// Text that falls short of WCAG AA (4.5:1) on its page flickers, so a failing colour is
// obvious while tuning.

import { projects, roles } from './content.js';
import { contrast, css, inkLayers, invert, mixRgb } from './ink.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap';
const AA = 4.5;
/** Points in the reveal's outline: at a full-screen radius, 256 chords sit within a pixel of the curve. */
const CLIP_POINTS = 256;

export const MODES = ['projects', 'roles'];
/** The blend layers, bottom to top: their CSS blend modes (see ink.js), and the colour that
 * leaves what's under it alone. */
const INKS = { m: ['multiply', '#fff'], d: ['difference', '#000'], k: ['plus-lighter', '#000'] };

const MAIN = ':is(h1, h2, h3, strong, .hp-strong, .hp-toggle button, .hp-more span)';
const MINOR = '.hp-minor';
const flicker = (/** @type {string} */ sel) => `${sel} { animation: hp-flicker 0.7s steps(1) infinite; }`;

const CSS = `
/* The document scrolls, not .hp (see the top of this file). */
html, body { height: auto; overflow: visible; }
.hp {
  --card-padding: 1rem; /* around a project card's text */
  --radius: 0.5rem; /* corners of the toggle and the project cards */
  --gutter: 1.5rem; /* the page's side margins, and the space between project cards */
  position: relative; display: grid;
  font-family: "Inter", sans-serif; -webkit-font-smoothing: antialiased;
}
.hp-main { grid-area: 1 / 1; width: 100%; max-width: 740px; margin-inline: auto; padding: 4rem var(--gutter) 6rem; box-sizing: border-box; }
.hp-main * { box-sizing: border-box; }
.hp-ui { --hp-text: transparent; --hp-minor: transparent; --hp-none: transparent; }
.hp-ink { pointer-events: none; user-select: none; }
${Object.entries(INKS).map(([k, [mode, none]]) => `.hp-ink[data-ink="${k}"] { mix-blend-mode: ${mode}; --hp-text: var(--hp-${k}-main); --hp-minor: var(--hp-${k}-minor); --hp-none: ${none}; }`).join('\n')}
.hp h1 { font-size: clamp(2.25rem, 7vw, 4.5rem); font-weight: 900; line-height: 1.02; letter-spacing: -0.03em; margin: 0 0 1rem; color: var(--hp-text); }
.hp h2 { font-size: 1.375rem; font-weight: 700; line-height: 1.4; letter-spacing: -0.01em; margin: 0; color: var(--hp-text); }
.hp h3 { font-size: 1.2rem; font-weight: 700; line-height: 1.6; letter-spacing: -0.01em; margin: 0; color: var(--hp-text); }
.hp p, .hp .hp-body { font-size: 1.125rem; line-height: 1.6; margin: 0; }
.hp strong, .hp .hp-strong { color: var(--hp-text); }
.hp .hp-minor { color: var(--hp-minor); }
.hp .hp-strong { font-weight: 600; line-height: 1.75; }
.hp .hp-dates { font-weight: 400; }
.hp a { color: inherit; text-decoration: none; display: block; }
.hp ul { list-style: none; margin: 0; padding: 0; }
.hp .hp-desc { margin-top: 0.25rem; }
.hp .hp-bullets { list-style: disc; margin: 0.5rem 0 0; padding-left: 1.5rem; }
/* Phones: a narrower gutter, and body, item titles and strong lines a step down. */
@media (max-width: 30rem) {
  .hp { --gutter: 1rem; }
  .hp h3 { font-size: 1.125rem; }
  .hp p, .hp .hp-body { font-size: 1rem; }
}
.hp-intro { margin-bottom: 3rem; }
/* Both lists share one cell, so the new one can appear over the old one as it fades. */
.hp-panels { display: grid; }
.hp-panels > section { grid-area: 1 / 1; min-width: 0; }
/* Roles are divided by lines like the toggle's frame. A card's text sits inside its padding,
   so the roles start that much lower to line up. */
.hp .hp-roles { padding-top: var(--card-padding); }
.hp-roles > li + li { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--hp-text); }
.hp-roles .hp-desc { margin-top: 0.5rem; }
/* Projects are cards, as far apart as the page is from the screen's edges (and from the
   toggle): a 1px box in the text colour, a line between cover and text. */
.hp-projects { display: grid; gap: var(--gutter); }
.hp-projects > li { container: card / inline-size; }
.hp-card { border: 1px solid var(--hp-text); border-radius: var(--radius); overflow: hidden; }
.hp-text { padding: var(--card-padding); }
/* The text and the bar sit on a lighter wash of the page; not in the ink copies, where it
   would go through their blends. */
.hp-ui .hp-text, .hp-ui .hp-more { background: rgba(255, 255, 255, 0.25); background-clip: padding-box; }
.hp .hp-more { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem var(--card-padding); border-top: 1px solid var(--hp-text); }
.hp-more span { color: var(--hp-text); }
.hp-more svg { flex: none; width: 1rem; height: 1rem; fill: none; stroke: var(--hp-text); stroke-width: 1.5; }
/* Covers are boxes sized by their format, so the ink copies (which drop the media) keep the layout. */
.hp-cover { position: relative; overflow: hidden; background-clip: padding-box; }
.hp-ui .hp-cover { background: var(--cover-bg, none); }
.hp-cover > * { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border: 0; }
.hp-landscape .hp-cover, .hp-vimeo .hp-cover { aspect-ratio: 3 / 2; border-bottom: 1px solid var(--hp-text); box-sizing: content-box; }
.hp-vimeo .hp-cover { aspect-ratio: 16 / 9; }
.hp-cover video { opacity: 0; transition: opacity 0.4s ease; }
.hp-cover video.on { opacity: 1; }
.hp-square .hp-cover { aspect-ratio: 1; border-bottom: 1px solid var(--hp-text); }
/* Wide enough, a square sits beside the text (a third), alternating sides down the list. */
@container card (min-width: 32rem) {
  .hp-square .hp-cardmain { display: grid; grid-template-columns: 1fr 2fr; align-items: start; }
  .hp-text { align-self: stretch; display: flex; flex-direction: column; justify-content: center; }
  .hp-square .hp-cover { border-bottom: 0; }
  .hp-square .hp-text { border-left: 1px solid var(--hp-text); }
  .hp-square.hp-flip .hp-text { border-left: 0; border-right: 1px solid var(--hp-text); }
  .hp-flip .hp-cardmain { grid-template-columns: 2fr 1fr; }
  .hp-flip .hp-cover { order: 1; }
}
/* The frame and both tabs are drawn by the ink layers too, so they take the colours of the page
   under them: the frame and the other tab's label in the text colour, and the current tab
   filled with it, its label a gap in the fill where the page shows through. */
.hp-toggle { --frame: 1px; display: flex; border: var(--frame) solid var(--hp-text); border-radius: var(--radius); margin-bottom: var(--gutter); }
.hp-toggle button {
  flex: 1; min-height: 2.75rem; padding: 0.6rem 1rem; font: inherit; font-size: 1rem; font-weight: 700; border: none; cursor: pointer;
  color: var(--hp-text); background: transparent;
}
.hp-toggle button:first-child { border-radius: calc(var(--radius) - var(--frame)) 0 0 calc(var(--radius) - var(--frame)); }
.hp-toggle button:last-child { border-radius: 0 calc(var(--radius) - var(--frame)) calc(var(--radius) - var(--frame)) 0; }
${MODES.map((m) => `.hp[data-theme="${m}"] .hp-toggle [data-mode="${m}"]`).join(', ')} { color: var(--hp-none); background: var(--hp-text); }

/* Below AA: text on the page it fails on flickers. */
@keyframes hp-flicker { 50% { opacity: 0.15; } }
${MODES.map((m) => [
    flicker(`.hp[data-theme="${m}"][data-fail~="${m}-main"] .hp-ink ${MAIN}`),
    flicker(`.hp[data-theme="${m}"][data-fail~="${m}-minor"] .hp-ink ${MINOR}`),
  ].join('\n')).join('\n')}
`;

const el = (/** @type {string} */ tag, /** @type {Record<string, string>} */ attrs = {}, /** @type {(Node | string)[]} */ kids = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  n.append(...kids);
  return n;
};

/** The link bar's chevron. */
function chevron() {
  const t = document.createElement('template');
  t.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>';
  return /** @type {Node} */ (t.content.firstChild);
}

/** The page's markup, once. */
function build() {
  const tabs = MODES.map((mode) => el('button', {
    role: 'tab', id: 'hp-tab-' + mode, 'data-mode': mode, 'aria-controls': 'hp-panel-' + mode,
  }, [mode === 'projects' ? 'Projects' : 'Roles']));

  // Side (square) covers alternate left, right, left… down the list.
  let sides = 0;
  const newTab = { target: '_blank', rel: 'noopener noreferrer' };
  const projectItems = projects.map((p) => {
    const format = p.vimeo ? 'vimeo' : p.cover?.format;
    const flip = format === 'square' && sides++ % 2 === 1;
    const cover = p.vimeo
      ? el('div', { class: 'hp-cover' }, [el('iframe', {
        src: `https://player.vimeo.com/video/${p.vimeo}?dnt=1&title=0&byline=0&portrait=0`, title: `${p.name} video`, loading: 'lazy',
        allow: 'autoplay; fullscreen; picture-in-picture', referrerpolicy: 'strict-origin-when-cross-origin',
      })])
      : p.cover && el('div', { class: 'hp-cover', style: p.cover.background ? `--cover-bg: ${p.cover.background}` : '' }, [
        el('img', { src: p.cover.image, alt: '' }),
        ...(p.cover.video ? [el('video', { src: p.cover.video, loop: '', playsinline: '', preload: 'none', 'aria-hidden': 'true' })] : []),
      ]);
    const main = el(p.url ? 'a' : 'div', { class: 'hp-cardmain', ...(p.url ? { href: p.url, ...newTab } : {}) }, [
      ...(cover ? [cover] : []),
      el('div', { class: 'hp-text' }, [el('h3', {}, [p.name]), el('p', { class: 'hp-desc hp-minor' }, [p.description])]),
    ]);
    const more = p.link ? [el('a', { class: 'hp-more', href: p.link.url, ...newTab }, [el('span', { class: 'hp-body' }, [p.link.label]), chevron()])] : [];
    return el('li', {}, [el('div', { class: `hp-card hp-${format}${flip ? ' hp-flip' : ''}` }, [main, ...more])]);
  });
  const roleItems = roles.map((r) => el('li', {}, [
    el('h2', {}, [r.organisation]),
    el('p', { class: 'hp-strong' }, [r.role, el('span', { class: 'hp-dates' }, [` (${r.dates})`])]),
    el('p', { class: 'hp-desc hp-minor' }, [r.description]),
    ...(r.listItems ? [el('ul', { class: 'hp-bullets hp-minor' }, r.listItems.map((i) => el('li', { class: 'hp-body' }, [i])))] : []),
  ]));
  const panels = MODES.map((mode) => el('section', {
    id: 'hp-panel-' + mode, role: 'tabpanel', 'aria-labelledby': 'hp-tab-' + mode, 'data-mode': mode,
  }, [el('ul', { class: 'hp-' + mode }, mode === 'projects' ? projectItems : roleItems)]));

  return el('main', { class: 'hp-main hp-ui' }, [
    el('section', { class: 'hp-intro' }, [
      el('h1', {}, ['Jack Bush']),
      el('p', {}, [
        el('strong', {}, ["I'm a design and product leader who loves making things."]),
        ' ',
        el('span', { class: 'hp-minor' }, ["Since 2005 I've built apps, platforms, teams, design systems, AI agents, instruments, a brain-machine interface, exhibitions, furniture, and a van. I care about quality, accessibility, delight, and contributing to the human toolbox."]),
      ]),
    ]),
    el('div', { class: 'hp-toggle', role: 'tablist', 'aria-label': 'Projects or roles' }, tabs),
    el('div', { class: 'hp-panels' }, panels),
  ]);
}

/**
 * @param {{ P: Record<string, any>, onSwitch: (mode: string, x: number, y: number) => void }} opts
 *   `onSwitch` is called when the page switches, with where the switch starts (CSS px from the
 *   top left)
 */
export function createPage({ P, onSwitch }) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.head.append(el('link', { rel: 'stylesheet', href: FONTS }), el('style', {}, [CSS]));

  const ui = build();
  // The ink copies: no ids (they'd clash), hidden from assistive tech, never focusable. They
  // drop their media (covers keep their size without it), which would draw in the blends.
  const inks = Object.keys(INKS).map((k) => {
    const copy = /** @type {HTMLElement} */ (ui.cloneNode(true));
    copy.className = 'hp-main hp-ink';
    copy.dataset.ink = k;
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    for (const n of copy.querySelectorAll('[id]')) n.removeAttribute('id');
    for (const n of copy.querySelectorAll('img, video, iframe')) n.remove();
    return copy;
  });
  const root = el('div', { class: 'hp' }, [ui, ...inks]);
  document.body.append(root);

  // Cover previews play only while on screen, and never with reduced motion. Each fades in over
  // its poster once it's actually playing.
  const onScreen = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      const v = /** @type {HTMLVideoElement} */ (target);
      if (isIntersecting && !reduceMotion.matches) v.play().catch(() => {});
      else v.pause();
    }
  }, { rootMargin: '100px 0px' });
  for (const v of ui.querySelectorAll('video')) {
    v.muted = true;
    v.addEventListener('playing', () => v.classList.add('on'), { once: true });
    onScreen.observe(v);
  }

  const tabs = [...ui.querySelectorAll('[role="tab"]')].map((t) => /** @type {HTMLElement} */ (t));
  const panels = [...root.querySelectorAll('section[data-mode]')].map((p) => /** @type {HTMLElement} */ (p));

  // The reveal clips: two SVG polygons, so a list cut off mid-reveal keeps its clip while the
  // next reveal uses the other. Points are set as numbers each frame: nothing is allocated.
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position: absolute; width: 0; height: 0;';
  const clips = [0, 1].map((i) => {
    const clip = document.createElementNS(SVG, 'clipPath');
    clip.id = 'hp-clip-' + i;
    const poly = document.createElementNS(SVG, 'polygon');
    for (let j = 0; j < CLIP_POINTS; j++) poly.points.appendItem(svg.createSVGPoint());
    clip.append(poly);
    svg.append(clip);
    return { url: `url(#hp-clip-${i})`, points: [...Array(CLIP_POINTS).keys()].map((j) => poly.points.getItem(j)) };
  });
  document.body.append(svg);

  /** Each list's running fade, so a quick switch back can cancel it. */
  const fades = new Map();
  /** The reveal in progress: its clip, the lists under it, and the click in their box. */
  let reveal = /** @type {{ clip: typeof clips[0], lists: HTMLElement[], x: number, y: number } | null} */ (null);
  let nextClip = 0;

  function settle(/** @type {HTMLElement} */ p) {
    fades.get(p)?.cancel();
    fades.delete(p);
  }

  function setTabs(/** @type {string} */ mode) {
    root.dataset.theme = mode;
    for (const t of tabs) {
      const on = t.dataset.mode === mode;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
  }

  /** Switch at once: no fade, no reveal. */
  function setMode(/** @type {string} */ mode) {
    setTabs(mode);
    reveal = null;
    for (const p of panels) {
      settle(p);
      p.hidden = p.dataset.mode !== mode;
      p.removeAttribute('aria-hidden');
      p.style.clipPath = '';
    }
  }

  /** Switch to `mode`, starting at (x, y) CSS px: the old list fades, the new one is revealed. */
  function switchTo(/** @type {string} */ mode, /** @type {number} */ x, /** @type {number} */ y) {
    if (mode === root.dataset.theme) return;
    if (reduceMotion.matches) {
      setMode(mode);
      onSwitch(mode, x, y);
      return;
    }
    setTabs(mode);
    for (const p of panels) {
      if (p.dataset.mode === mode || p.hidden) continue;
      // A list still being revealed (a switch back mid-switch) keeps its clip, so it doesn't
      // jump to whole, and goes quickly; the switch it was in keeps spreading on the canvas.
      const interrupted = reveal?.lists.includes(p) ?? false;
      settle(p);
      p.setAttribute('aria-hidden', 'true');
      const seconds = interrupted ? P.interruptFade.value : P.oldTextFade.value;
      const fade = p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: seconds * 1000, fill: 'forwards' });
      fade.onfinish = () => { p.hidden = true; p.removeAttribute('aria-hidden'); p.style.clipPath = ''; settle(p); };
      fades.set(p, fade);
    }
    const lists = panels.filter((p) => p.dataset.mode === mode);
    const clip = clips[nextClip];
    nextClip = 1 - nextClip;
    for (const p of lists) {
      settle(p);
      p.hidden = false;
      p.removeAttribute('aria-hidden');
      p.style.clipPath = clip.url;
    }
    const box = lists[0].getBoundingClientRect();
    reveal = { clip, lists, x: x - box.left, y: y - box.top };
    for (const pt of clip.points) { pt.x = reveal.x; pt.y = reveal.y; }
    onSwitch(mode, x, y);
  }

  // The switch starts at the pointer, or at the tab's centre from the keyboard (a keyboard
  // click has detail 0).
  function pick(/** @type {HTMLElement} */ tab, /** @type {MouseEvent | null} */ e) {
    const r = tab.getBoundingClientRect();
    const x = e && e.detail > 0 ? e.clientX : r.left + r.width / 2;
    const y = e && e.detail > 0 ? e.clientY : r.top + r.height / 2;
    switchTo(/** @type {string} */ (tab.dataset.mode), x, y);
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', (e) => pick(tab, e));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const next = tabs[(i + 1) % tabs.length];
      pick(next, null);
      next.focus();
    });
  });

  return {
    setMode,
    switchTo,
    /** The real page's tab for `mode`. */
    tab: (/** @type {string} */ mode) => /** @type {HTMLElement} */ (tabs.find((t) => t.dataset.mode === mode)),
    /**
     * Step the reveal to the newest switch's outline, or end it once no switch is running.
     * Called every frame; allocation-free.
     * @param {{ running: boolean, radiusAt(a: number): number }} switches
     */
    reveal(switches) {
      if (!reveal) return;
      if (!switches.running) {
        for (const p of reveal.lists) p.style.clipPath = '';
        reveal = null;
        return;
      }
      const pts = reveal.clip.points;
      for (let j = 0; j < CLIP_POINTS; j++) {
        const a = (j / CLIP_POINTS) * Math.PI * 2;
        const r = switches.radiusAt(a);
        pts[j].x = reveal.x + Math.cos(a) * r;
        pts[j].y = reveal.y + Math.sin(a) * r;
      }
    },
    /**
     * Push the params the page's CSS reads, and flag text below AA. Call when they change.
     * @param {Record<string, any>} P
     */
    sync(P) {
      const s = root.style;
      // Roles is Projects inverted: each page is the other's text.
      const page = { projects: P.themeColour.rgb, roles: invert(P.themeColour.rgb) };
      const text = { projects: page.roles, roles: page.projects };

      // Each kind of text is the page's inverse at its own opacity, with its own ink greys.
      const kinds = { main: 1, minor: P.minorOpacity.value };
      const fails = [];
      for (const [kind, opacity] of Object.entries(kinds)) {
        const ink = inkLayers(opacity);
        for (const k of /** @type {const} */ (['m', 'd', 'k'])) s.setProperty(`--hp-${k}-${kind}`, css([ink[k], ink[k], ink[k]]));
        for (const m of /** @type {const} */ (['projects', 'roles'])) {
          if (contrast(page[m], mixRgb(page[m], text[m], opacity)) < AA) fails.push(`${m}-${kind}`);
        }
      }
      root.dataset.fail = fails.join(' ');
    },
  };
}
