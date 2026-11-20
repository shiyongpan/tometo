// 本機靜態伺服器：只用 Node 內建模組。
// 用法：node tools/serve.mjs [--port 8080] [--dir <目錄>]   （--port 0 = 自動挑空閒埠）
// 只聽 127.0.0.1；回應不快取，改檔後重新整理就看到新內容。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * 回覆純文字錯誤。
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} msg
 */
function fail(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(msg);
}

/**
 * 建立請求處理函式。注意不用 new URL 解析路徑（它會先把 /../ 正規化掉，等於替攻擊者消毒）。
 * @param {string} root 服務的根目錄（絕對路徑）
 */
function makeHandler(root) {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, '只接受 GET／HEAD');
    let rel;
    try {
      rel = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    } catch {
      return fail(res, 400, '路徑編碼錯誤');
    }
    if (rel.includes('\0') || rel.includes('\\')) return fail(res, 400, '路徑不合法');
    let file = path.resolve(root, '.' + (rel.startsWith('/') ? rel : '/' + rel));
    // 跳出服務目錄一律拒絕
    if (file !== root && !file.startsWith(root + path.sep)) return fail(res, 403, '禁止存取目錄外的檔案');
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) {
        file = path.join(file, 'index.html');
        fs.stat(file, (e2, s2) => (e2 || !s2.isFile() ? fail(res, 404, '找不到') : send(res, req, file, s2)));
      } else if (err || !st.isFile()) fail(res, 404, '找不到');
      else send(res, req, file, st);
    });
  };
}

/**
 * 送出檔案。
 * @param {http.ServerResponse} res
 * @param {http.IncomingMessage} req
 * @param {string} file
 * @param {fs.Stats} st
 */
function send(res, req, file, st) {
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-store'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

/**
 * 啟動伺服器；埠被占用時 reject（error.code === 'EADDRINUSE'）。
 * @param {{root: string, port?: number, host?: string}} opts
 * @returns {Promise<http.Server>}
 */
export function startServer({ root, port = 8080, host = '127.0.0.1' }) {
  const server = http.createServer(makeHandler(path.resolve(root)));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

/** CLI 入口。 */
async function main() {
  const args = process.argv.slice(2);
  const opt = (/** @type {string} */ name, /** @type {string} */ def) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
  };
  const port = Number(opt('--port', '8080'));
  const root = path.resolve(opt('--dir', path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`埠號不合法：${opt('--port', '')}`);
    process.exit(1);
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`服務目錄不存在：${root}`);
    process.exit(1);
  }
  try {
    const server = await startServer({ root, port });
    const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
    console.log(`tometo serve: http://127.0.0.1:${addr.port}/  （目錄：${root}）`);
  } catch (e) {
    const err = /** @type {NodeJS.ErrnoException} */ (e);
    console.error(
      err.code === 'EADDRINUSE' ? `埠 ${port} 已被占用，請換一個埠（--port <號碼>）` : `無法啟動伺服器：${err.message}`
    );
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
