// Headless Chrome over the DevTools protocol, plus a preview server. Node ≥ 22, no deps.
// Shared by bench.mjs and capture.mjs.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;

/**
 * Parse arguments. `valued` lists the options that take a value (`--size 1440x900`);
 * any other `--x` is a flag, and everything else is positional.
 */
export function cli(valued, argv = process.argv.slice(2)) {
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (valued.includes(argv[i])) i++;
    else if (!argv[i].startsWith('--')) args.push(argv[i]);
  }
  return {
    args,
    opt: (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; },
    has: (name) => argv.includes(name),
  };
}

/**
 * Build the site (fast, and it means the page under test is never stale; skipped when the
 * caller has just built, via GLIMMERS_BUILT=1), then reuse a server already answering at
 * `url` if it serves this dist/ (a running `astro preview` does), or start `astro preview`.
 * Anything else on that port, like `astro dev`, is an error: it would test other code.
 * Returns the base URL and a stop function.
 */
export async function ensureServer(url = 'http://127.0.0.1:4321/glimmers/') {
  if (!process.env.GLIMMERS_BUILT) {
    const built = spawnSync('npx', ['astro', 'build'], { cwd: ROOT, encoding: 'utf8' });
    if (built.status !== 0) throw new Error('astro build failed:\n' + built.stdout + built.stderr);
  }
  const index = readFileSync(join(ROOT, 'dist/index.html'), 'utf8');
  /** 'ours' if `url` serves this dist/, 'other' if something else answers, 'none' if nothing does. */
  const probe = async () => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      return r.ok && (await r.text()) === index ? 'ours' : 'other';
    } catch {
      return 'none';
    }
  };
  const found = await probe();
  if (found === 'ours') return { base: url, stop: () => {} };
  if (found === 'other') {
    throw new Error(`${url} serves something other than this repo's fresh dist/ (an \`astro dev\` server?). Stop it, or point --url at an \`astro preview\` of this repo.`);
  }
  const port = new URL(url).port || '4321';
  const proc = spawn('npx', ['astro', 'preview', '--port', port, '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    if ((await probe()) === 'ours') return { base: url, stop: () => { try { process.kill(-proc.pid); } catch {} } };
    await sleep(200);
  }
  throw new Error('preview server did not start at ' + url);
}

/**
 * Launch headless Chrome with vsync off and connect to its first page.
 * @returns {Promise<{ send: (method: string, params?: object) => Promise<any>, evaluate: (expression: string) => Promise<any>, close: () => void }>}
 */
export async function launch({ width = 1440, height = 900, dpr = 1, swiftshader = false } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'glimmers-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const flags = [
    '--headless=new', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, `--force-device-scale-factor=${dpr}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
  ];
  if (swiftshader) flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  const chrome = spawn(CHROME, flags, { stdio: 'ignore' });

  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch {}
    if (!ws) await sleep(200);
  }
  if (!ws) { chrome.kill(); throw new Error('could not connect to Chrome at ' + CHROME); }
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`));
    else p.resolve(m);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { method, resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || 'evaluate failed');
    return m.result?.result?.value;
  };
  const close = () => { chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  await send('Page.enable');
  return { send, evaluate, close };
}
