'use strict';

/** 用 Edge CDP 截图后台页面，便于检查布局与答辩材料。运行前先启动 Edge 9222 与后端 3000。 */
const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.join(__dirname, '..', 'reports', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function newTarget(url) {
  const response = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  return response.json();
}

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
      if (message.method && this.events.has(message.method)) {
        for (const handler of this.events.get(message.method)) handler(message.params);
        this.events.delete(message.method);
      }
    });
  }

  send(method, params = {}) {
    const id = (this.id += 1);
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method) {
    return new Promise((resolve) => {
      const handlers = this.events.get(method) || [];
      handlers.push(resolve);
      this.events.set(method, handlers);
    });
  }

  close() {
    this.ws.close();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function screenshot(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('saved', file);
}

async function waitFor(cdp, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.result?.value) return true;
    await sleep(250);
  }
  return false;
}

async function main() {
  const target = await newTarget('http://127.0.0.1:3000/admin/');
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(800);
  await screenshot(cdp, '01-login');

  const loginResult = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const response = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username: 'superadmin', password: 'Admin@123456'})
      });
      const json = await response.json();
      sessionStorage.setItem('moto_admin_token', json.data.token);
      location.reload();
      return json.code;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('login code', loginResult.result?.value);
  await sleep(1200);
  await waitFor(cdp, `document.querySelectorAll('.finding').length >= 3 && document.querySelectorAll('.rec-item').length >= 3`);
  await screenshot(cdp, '02-dashboard');

  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-page="activities"]').click()`,
  });
  await sleep(900);
  await screenshot(cdp, '03-activities');

  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('#activity-table button[data-action="stats"][data-id="3"]')?.click()`,
  });
  await sleep(900);
  await screenshot(cdp, '07-activity-stats');
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.modal-close')?.click()`,
  });
  await sleep(300);

  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-page="users"]').click()`,
  });
  await sleep(700);
  await screenshot(cdp, '04-users');

  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-page="admins"]').click()`,
  });
  await sleep(700);
  await screenshot(cdp, '05-admins');

  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-page="dashboard"]').click()`,
  });
  await sleep(800);
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('#ai-generate').click()`,
  });
  await sleep(1600);
  await screenshot(cdp, '06-dashboard-ai');

  const result = await cdp.send('Page.getLayoutMetrics');
  console.log('content size', result.cssContentSize);
  cdp.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
