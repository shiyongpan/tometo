// CDP 瀏覽器測試框架：用無頭 Chrome／Edge 開頁面。只用 Node 內建的 fetch、WebSocket、child_process。
// 參考北境求生的 harness.mjs 做法；ES modules 不能用 file:// 開，所以一律走 tools/serve.mjs。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(LIB, '..', '..', '..');
/** 暫存資料夾（瀏覽器設定檔、組裝輸出、截圖），不進 git */
export const TMP = path.join(REPO, 'tests', '.tmp');
fs.mkdirSync(TMP, { recursive: true });
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// 略過外部注入請求的主機清單：預設為空（repo 內不寫死任何主機名稱）。
// 本機環境若被其他軟體往頁面注入對外請求，可用環境變數 TOMETO_IGNORE_HOSTS（逗號分隔的主機名稱）設定；
// 實際略過時，分頁關閉時會印出 NOTE 說明略過的主機與筆數。
/**
 * 解析略過清單。
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function parseIgnoreHosts(value) {
  return (value ?? '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}
/** 目前環境變數設定的略過清單（每次呼叫即時讀取）。 */
export const getIgnoreHosts = () => parseIgnoreHosts(process.env.TOMETO_IGNORE_HOSTS);

const BROWSERS = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

/** 找 Chrome／Edge；找不到丟出明確訊息。 */
export function findBrowser() {
  const exe = BROWSERS.find(p => fs.existsSync(p));
  if (!exe) {
    throw new Error('找不到 Chrome 或 Edge；請用環境變數 CHROME 指定執行檔路徑（例如 CHROME="C:/path/to/chrome.exe"）');
  }
  return exe;
}

/** 結束程序（Windows 連同子程序一起結束）並等它真的結束。 */
function killTree(proc) {
  return new Promise(resolve => {
    if (proc.exitCode !== null || proc.signalCode) return resolve();
    proc.once('exit', () => resolve());
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGKILL');
    setTimeout(resolve, 5000);
  });
}

/**
 * 起 tools/serve.mjs（空閒埠由 serve 自己挑：--port 0），回傳網址。
 * @param {string} dir 要服務的目錄
 */
export async function startServe(dir) {
  const p = spawn(process.execPath, [path.join(REPO, 'tools', 'serve.mjs'), '--port', '0', '--dir', dir], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  p.stdout.on('data', d => (out += d));
  p.stderr.on('data', d => (out += d));
  for (let k = 0; k < 50; k++) {
    const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (m) {
      return {
        url: m[0],
        origin: `http://127.0.0.1:${m[1]}`,
        close: () => killTree(p)
      };
    }
    if (p.exitCode !== null) break;
    await sleep(100);
  }
  await killTree(p);
  throw new Error('serve.mjs 沒有成功啟動：' + out);
}

/** 啟動無頭瀏覽器（debug 埠由瀏覽器自己挑，從 DevToolsActivePort 讀回，避免撞埠）。 */
export async function launch() {
  const exe = findBrowser();
  const ud = fs.mkdtempSync(path.join(TMP, 'chrome-'));
  const proc = spawn(
    exe,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${ud}`,
      '--window-size=1280,800',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );
  let port = 0;
  const portFile = path.join(ud, 'DevToolsActivePort');
  for (let k = 0; k < 100 && !port; k++) {
    if (fs.existsSync(portFile)) port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]) || 0;
    if (!port) await sleep(100);
  }
  if (!port) {
    await killTree(proc);
    throw new Error('瀏覽器沒有啟動成功（讀不到 DevToolsActivePort）');
  }
  return {
    port,
    async close() {
      await killTree(proc);
      for (let k = 0; k < 10; k++) {
        try {
          fs.rmSync(ud, { recursive: true, force: true });
          break;
        } catch {
          await sleep(200);
        }
      }
    }
  };
}

/**
 * 開一個分頁並連上 CDP。會蒐集：例外與 console error／warning（logs）、網路請求（requests，標出 load 前後）。
 * @param {{port: number}} br
 * @param {string} url
 */
export async function openPage(br, url) {
  const r = await fetch(`http://127.0.0.1:${br.port}/json/new?about:blank`, { method: 'PUT' });
  const target = await r.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('CDP WebSocket 連線失敗'));
  });
  let id = 0;
  const pend = new Map();
  /** @type {string[]} */
  const logs = [];
  /** @type {{url: string, afterLoad: boolean}[]} */
  const requests = [];
  const ignoreHosts = getIgnoreHosts();
  /** @type {Map<string, number>} 被略過的主機 → 筆數 */
  const ignored = new Map();
  /** @type {string[]} */
  const notes = [];
  let loaded = false;
  let loadResolve = () => {};
  const loadPromise = new Promise(res => (loadResolve = res));
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
      return;
    }
    const p = m.params;
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('EXC ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    } else if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) {
      logs.push(p.type + ' ' + p.args.map(a => a.value ?? a.description).join(' '));
    } else if (m.method === 'Log.entryAdded' && (p.entry.level === 'error' || p.entry.level === 'warning')) {
      logs.push(`log-${p.entry.level} ${p.entry.text} ${p.entry.url || ''}`.trim());
    } else if (m.method === 'Network.requestWillBeSent') {
      const host = new URL(p.request.url).hostname;
      if (ignoreHosts.some(x => host === x || host.endsWith('.' + x))) ignored.set(host, (ignored.get(host) ?? 0) + 1);
      else requests.push({ url: p.request.url, afterLoad: loaded });
    } else if (m.method === 'Page.loadEventFired') {
      loaded = true;
      loadResolve();
    }
  };
  const send = (method, params = {}) =>
    new Promise(res => {
      const i = ++id;
      pend.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  for (const d of ['Runtime', 'Page', 'Network', 'Log']) await send(d + '.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  const pg = {
    logs,
    requests,
    notes,
    send,
    /** 等 load 事件（之後的請求都會標 afterLoad） */
    async waitLoad(ms = 15000) {
      await Promise.race([loadPromise, sleep(ms).then(() => Promise.reject(new Error('等 load 事件逾時')))]);
    },
    /** 在頁面內執行運算式（回傳值以 JSON 傳回） */
    async ev(expr) {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (res.result.exceptionDetails) {
        throw new Error(
          'eval: ' +
            (res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text) +
            '\n  in: ' +
            expr.slice(0, 200)
        );
      }
      return res.result.result.value;
    },
    /**
     * 在頁面內 import() 指定模組（絕對網址）再對模組套用函式。
     * 同網址的 ES module 只有一份實例，拿到的就是頁面正在用的那份。
     * @param {string} moduleUrl
     * @param {string} fnSource 例如 'm => m.getBootInfo()'（結果須可 JSON 序列化）
     */
    async importIn(moduleUrl, fnSource) {
      return pg.ev(`import(${JSON.stringify(moduleUrl)}).then(${fnSource})`);
    },
    async key(code, key) {
      const k = key || (/^Key/.test(code) ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k });
    },
    async click(x, y, button = 'left') {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
    },
    async clickSel(sel) {
      const pos = await pg.ev(
        `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return[b.x+b.width/2,b.y+b.height/2]})()`
      );
      if (!pos) throw new Error('找不到元素 ' + sel);
      await pg.click(pos[0], pos[1]);
    },
    async shot(file) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'));
      return file;
    },
    /** 等條件成立（條件是頁面內的運算式） */
    async wait(fn, ms = 8000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try {
          if (await pg.ev(fn)) return true;
        } catch {}
        await sleep(100);
      }
      throw new Error('等待逾時：' + fn);
    },
    async close() {
      for (const [h, n] of ignored) {
        const line = `NOTE 略過 ${n} 筆對 ${h} 的請求（TOMETO_IGNORE_HOSTS）`;
        notes.push(line);
        console.log(line);
      }
      ignored.clear();
      try {
        ws.close();
        await fetch(`http://127.0.0.1:${br.port}/json/close/${target.id}`);
      } catch {}
    }
  };
  return pg;
}

/**
 * 每個測試檔共用：PASS／FAIL 一行一項。
 * @returns {(cond: any, msg: string, extra?: any) => void}
 */
export function checker() {
  return (cond, msg, extra) => {
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (cond || extra === undefined ? '' : '  → ' + JSON.stringify(extra)));
    if (!cond) process.exitCode = 1;
  };
}

/**
 * 測試檔的外框：起瀏覽器、跑測試、無論成敗都關掉瀏覽器與伺服器。
 * @param {(ctx: {br: {port: number}, check: ReturnType<typeof checker>, track: <T extends {close: () => any}>(x: T) => T}) => Promise<void>} fn
 */
export async function runTest(fn) {
  const check = checker();
  /** @type {{close: () => any}[]} */
  const toClose = [];
  const track = x => (toClose.push(x), x);
  try {
    const br = track(await launch());
    await fn({ br, check, track });
  } catch (e) {
    console.log('FAIL 測試中途出錯  → ' + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  } finally {
    for (const c of toClose.reverse()) {
      try {
        await c.close();
      } catch {}
    }
  }
}
