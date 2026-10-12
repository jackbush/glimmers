// New-build detection. Each deploy stamps its commit hash into <meta name="build"> and
// version.json; an open tab compares the two and jumps to the new build, so nobody keeps
// running stale code (or stale defaults) after a push. Local builds aren't stamped.

const RELOADED_KEY = 'glimmers:reloaded-for';

function currentBuild(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="build"]')?.content || '';
}

/** The deployed build's id if it differs from this page's, else null. */
export async function newerBuild(): Promise<string | null> {
  const build = currentBuild();
  if (!build || build === 'dev') return null;
  try {
    const base = import.meta.env.BASE_URL;
    const r = await fetch(base + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    return j && j.version && j.version !== build ? String(j.version) : null;
  } catch {
    return null;
  }
}

export function jumpTo(version: string): void {
  location.replace(location.pathname + '?v=' + version + location.hash);
}

/** Check now, and again whenever the tab comes back. At most one automatic jump per build. */
export function autoReload(): void {
  async function check() {
    const v = await newerBuild();
    if (!v) return;
    try {
      if (sessionStorage.getItem(RELOADED_KEY) === v) return;
      sessionStorage.setItem(RELOADED_KEY, v);
    } catch { /* ignore */ }
    jumpTo(v);
  }
  check();
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
