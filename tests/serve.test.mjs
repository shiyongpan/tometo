// tools/serve.mjs 的行為：MIME、404、路徑跳脫、埠被占用。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer } from '../tools/serve.mjs';
import { REPO } from './lib/source-checks.mjs';

/** 用原始路徑發請求（fetch 會先把 /../ 正規化，測不到跳脫）。 */
function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: rawPath, agent: false }, res => {
        let body = '';
        res.on('data', d => (body += d));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      })
      .on('error', reject);
  });
}

test('serve：MIME、目錄請求、404、不快取', async () => {
  const server = await startServer({ root: REPO, port: 0 });
  const { port } = server.address();
  try {
    const js = await rawGet(port, '/src/shell/main.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /^text\/javascript/);
    assert.equal(js.headers['cache-control'], 'no-store');
    assert.match((await rawGet(port, '/css/game.css')).headers['content-type'], /^text\/css/);
    const root = await rawGet(port, '/');
    assert.equal(root.status, 200);
    assert.match(root.headers['content-type'], /^text\/html/);
    assert.match(root.body, /<title>tometo<\/title>/);
    assert.equal((await rawGet(port, '/no/such/file.js')).status, 404);
  } finally {
    server.close();
  }
});

test('serve：路徑跳出服務目錄一律拒絕（含編碼後的跳脫）', async () => {
  // 服務 src/，目錄外的 repo 根有 package.json
  const server = await startServer({ root: path.join(REPO, 'src'), port: 0 });
  const { port } = server.address();
  try {
    assert.equal((await rawGet(port, '/data/index.js')).status, 200);
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/data/../../package.json']) {
      const r = await rawGet(port, p);
      assert.ok(r.status >= 400 && r.status < 500, `${p} → ${r.status}`);
      assert.ok(!r.body.includes('"type"'), `${p} 不該回傳 package.json`);
    }
  } finally {
    server.close();
  }
});

test('serve：埠被占用時印出說明並以非 0 結束', async () => {
  const blocker = net.createServer();
  await new Promise(r => blocker.listen(0, '127.0.0.1', r));
  const { port } = blocker.address();
  try {
    const r = spawnSync(process.execPath, [path.join(REPO, 'tools', 'serve.mjs'), '--port', String(port)], {
      encoding: 'utf8'
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /已被占用/);
  } finally {
    blocker.close();
  }
});
