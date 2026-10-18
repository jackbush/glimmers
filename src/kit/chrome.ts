// The buttons around a sketch: back (top left) and the settings cog (top right), and the
// keyboard. Two states, shared by every sketch on the site:
//   ui    on | off       Space toggles; off hides the buttons and the pane. Remembered per
//                       browser (glimmers:ui).
//   pane  open | closed  the cog toggles; Escape closes. Every page opens with it closed,
//                       unless its URL ends #settings (links straight to the settings), which
//                       also shows the buttons for that visit without saving it.

const UI_KEY = 'glimmers:ui';

function load(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export interface Chrome {
  readonly paneOpen: boolean;
}

/**
 * @param persist false in capture mode: the UI is forced off and nothing is saved.
 * @param onPane called whenever the pane opens or closes.
 */
export function setupChrome(persist: boolean, onPane?: (open: boolean) => void): Chrome {
  const body = document.body;
  const cog = document.getElementById('cog')!;
  const panel = document.getElementById('panel')!;
  const settings = persist && location.hash === '#settings';
  let ui = persist && (settings || load(UI_KEY) !== 'off') ? 'on' : 'off';
  let pane = settings ? 'open' : 'closed';

  function apply() {
    body.dataset.ui = ui;
    body.dataset.pane = pane;
    const open = ui === 'on' && pane === 'open';
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    cog.setAttribute('aria-expanded', String(open));
  }
  function setUi(v: string) { ui = v; if (persist) save(UI_KEY, v); apply(); }
  function setPane(v: string) { pane = v; apply(); onPane?.(v === 'open'); }

  cog.addEventListener('click', () => setPane(pane === 'open' ? 'closed' : 'open'));

  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
      (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox'));
    if (e.key === 'Escape') { if (pane === 'open') setPane('closed'); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') {
      e.preventDefault(); // don't scroll, and don't press a focused button
      setUi(ui === 'on' ? 'off' : 'on');
    }
  });

  apply();
  return { get paneOpen() { return ui === 'on' && pane === 'open'; } };
}
