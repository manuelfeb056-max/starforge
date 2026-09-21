/**
 * CDP screenshot capture for STARFORGE cinematic frames.
 * One fresh Chrome per shot (startup-URL navigation avoids local-network
 * access checks that block CDP-initiated navigations to 127.0.0.1).
 * Usage: node scripts/cap-shots.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

const PORT = 9223;
const SHOTS = ['takeover', 'spin', 'nearmiss', 'hell', 'reveal'];
const BASE = 'file:///tmp/shot-test.html';
const OUT = '/tmp/odshots';
mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function capture(shot) {
  rmSync('/tmp/cdp-prof', { recursive: true, force: true });
  const chrome = spawn(
    '/opt/meta-chromium/chrome',
    [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--no-first-run', '--disable-background-networking',
      `--remote-debugging-port=${PORT}`,
      '--user-data-dir=/tmp/cdp-prof',
      '--window-size=1280,800', '--proxy-server=direct://', '--proxy-bypass-list=*',
      '--disable-features=LocalNetworkAccessChecks',
      `${BASE}?shot=${shot}`,
    ],
    { stdio: 'ignore', env: { ...process.env, HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '', ALL_PROXY: '', all_proxy: '', NO_PROXY: '*', no_proxy: '*' } },
  );
  try {
    // wait for the devtools endpoint
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (r.ok) break;
      } catch { /* not up */ }
      await sleep(500);
    }
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find(t => t.type === 'page');
    if (!page) throw new Error('no page target');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(JSON.stringify(m.error)));
        else res(m.result);
      }
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    await send('Page.enable');
    // debugShot fires 600ms after load; let the scene freeze and render
    await sleep(6000);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${shot}.png`, Buffer.from(data, 'base64'));
    console.log(`captured ${shot}.png`);
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
  }
}

for (const shot of SHOTS) {
  await capture(shot);
  await sleep(800);
}
console.log('ALL SHOTS OK');
