import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
export class BrowserUnavailable extends Error {}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
class CDPCommandError extends Error {
  constructor(error) { super(error.message ?? JSON.stringify(error)); this.name = 'CDPCommandError'; this.code = error.code; }
}
const transientNavigationContext = error => error instanceof CDPCommandError && /^(?:Execution context was destroyed|Cannot find (?:default )?(?:execution )?context)(?:\b|\.)/i.test(error.message);
async function stopBrowser(browser) {
  if (!browser?.pid || browser.exitCode !== null || browser.signalCode !== null) return;
  const stop = signal => new Promise(resolve => {
    if (browser.exitCode !== null || browser.signalCode !== null) { resolve(true); return; }
    const finish = exited => { clearTimeout(timer); browser.off('exit', exitedHandler); resolve(exited); };
    const exitedHandler = () => finish(true), timer = setTimeout(() => finish(false), 5000);
    browser.once('exit', exitedHandler); browser.kill(signal);
  });
  if (!await stop('SIGTERM') && !await stop('SIGKILL')) throw new Error('Browser did not exit before profile cleanup');
}

/** Actual CDP, one temporary profile, sandbox kept enabled. No framework dependency. */
export async function withHarnessBrowser(task, options = {}) {
  const executable = options.executable ?? process.env.GPU_BROWSER_PATH;
  if (!executable) throw new BrowserUnavailable('Set GPU_BROWSER_PATH to a Chromium executable');
  if (!globalThis.WebSocket) throw new BrowserUnavailable('The CDP runner requires Node 22+');
  const root = resolve('.'), profile = await mkdtemp(resolve(tmpdir(), 'poku-browser-'));
  const server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.startsWith('/effects/')) pathname = '/site/public' + pathname;
      if (['app.js', '3d.js', 'studio.js', 'studio-worker.js', 'gpu-lab.js', 'gpu-lab-worker.js'].some(name => pathname === `/gallery/${name}`)) pathname = pathname.replace('/gallery/', '/build-gallery/');
      if (pathname.startsWith('/gallery/chunks/')) pathname = pathname.replace('/gallery/chunks/', '/build-gallery/chunks/');
      const path = resolve(root, '.' + pathname); if (!path.startsWith(root + sep)) throw new Error('Invalid path');
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(path)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store'); res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  let browser, socket;
  try {
    try { await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); }); } catch (error) { throw new BrowserUnavailable(`Local test server unavailable: ${error}`); }
    const port = server.address().port; let stderr = '';
    browser = spawn(executable, ['--headless=new', '--window-size=1440,1000', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let endpoint;
    try {
      endpoint = await new Promise((ok, fail) => {
        const timer = setTimeout(() => fail(new Error(`Browser startup timeout: ${stderr.slice(-1800)}`)), 30000);
        browser.once('error', e => { clearTimeout(timer); fail(e); }); browser.once('exit', code => { clearTimeout(timer); fail(new Error(`Browser exited ${code}: ${stderr.slice(-1800)}`)); });
        browser.stderr.on('data', data => { stderr += data; const found = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr); if (found) { clearTimeout(timer); ok(found[1]); } });
      });
    } catch (error) { throw new BrowserUnavailable(String(error)); }
    let page, discoveryError; const discoveryEnd = Date.now() + 15000;
    while (!page && Date.now() < discoveryEnd) {
      if (browser.exitCode !== null || browser.signalCode !== null) throw new BrowserUnavailable(`Browser exited before page discovery: ${stderr.slice(-1800)}`);
      try {
        const response = await fetch(`http://${new URL(endpoint).host}/json/list`, { signal: AbortSignal.timeout(1000) });
        if (!response.ok) throw new Error(`Target discovery HTTP ${response.status}`);
        const tabs = await response.json(); page = tabs.find(t => t.type === 'page');
      } catch (error) { discoveryError = error; }
      if (!page) await pause(40);
    }
    if (!page) throw new BrowserUnavailable(`No browser page target within 15 seconds${discoveryError ? `: ${discoveryError}` : ''}`);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { const timeout = setTimeout(() => fail(new BrowserUnavailable('CDP connection timeout')), 10000); socket.addEventListener('open', () => { clearTimeout(timeout); ok(); }, { once: true }); socket.addEventListener('error', () => { clearTimeout(timeout); fail(new BrowserUnavailable('CDP connection failed')); }, { once: true }); });
    let nextId = 0; const pending = new Map(), exceptions = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
      if (!message.id) return; const waiting = pending.get(message.id); if (!waiting) return; pending.delete(message.id); clearTimeout(waiting.timer);
      message.error ? waiting.fail(new CDPCommandError(message.error)) : waiting.ok(message.result);
    });
    const send = (method, params = {}, timeout = 30000) => new Promise((ok, fail) => { const id = ++nextId, timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP ${method} timed out`)); }, timeout); pending.set(id, { ok, fail, timer }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression, timeout = 30000) => { const result = await send('Runtime.evaluate', { expression: typeof expression === 'function' ? `(${expression})()` : expression, returnByValue: true, awaitPromise: true }, timeout); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
    const waitFor = async (expression, timeout = 15000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try { const value = await evaluate(expression, Math.max(1, end - Date.now())); if (value) return value; }
        catch (error) { if (!transientNavigationContext(error)) throw error; }
        await pause(40);
      }
      const status = await evaluate("document.getElementById('status')?.textContent ?? document.body?.textContent?.slice(0,500)").catch(() => 'unavailable');
      throw new Error(`UI wait timed out: ${String(expression)}; status=${status}`);
    };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__pokuUnhandled=[];addEventListener('unhandledrejection',e=>window.__pokuUnhandled.push(String(e.reason)));addEventListener('error',e=>window.__pokuUnhandled.push(e.message));" });
    return await task({ send, evaluate, waitFor, exceptions, origin: `http://127.0.0.1:${port}`, navigate: path => send('Page.navigate', { url: `http://127.0.0.1:${port}${path}` }) });
  } finally {
    socket?.close();
    try { await stopBrowser(browser); }
    finally { if (server.listening) await new Promise(ok => server.close(ok)); }
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
