// tools/pack.mjs：發佈組裝（rewriteIndexHtml 與 pack）。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { rewriteIndexHtml, pack } from '../tools/pack.mjs';
import { REPO, listFiles, attrValues } from './lib/source-checks.mjs';

const TMP = path.join(REPO, 'tests', '.tmp');
fs.mkdirSync(TMP, { recursive: true });
const made = [];
const tmpDir = name => (made.push(fs.mkdtempSync(path.join(TMP, name + '-'))), made[made.length - 1]);
after(() => made.forEach(d => fs.rmSync(d, { recursive: true, force: true })));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
/** 目錄快照：相對路徑 → 雜湊 */
const snapshot = dir =>
  Object.fromEntries(listFiles(dir).map(f => [path.relative(dir, f).split(path.sep).join('/'), sha(f)]));

test('rewriteIndexHtml：只改 href／src 開頭為 css/、src/、assets/ 的值，其餘不變', () => {
  const html = '<link href="css/game.css">\n<script src="src/shell/main.js"></script><a href="#x">x</a>';
  assert.equal(
    rewriteIndexHtml(html, 'abc1234'),
    '<link href="v/abc1234/css/game.css">\n<script src="v/abc1234/src/shell/main.js"></script><a href="#x">x</a>'
  );
  assert.equal(
    rewriteIndexHtml("<img src='assets/a.png'><link href=\"css/a.css\">", 'abc1234'),
    "<img src='v/abc1234/assets/a.png'><link href=\"v/abc1234/css/a.css\">"
  );
});

test('rewriteIndexHtml：沒有可改寫的引用或版本不合法就丟錯', () => {
  assert.throws(() => rewriteIndexHtml('<a href="#x">x</a><link href="data:,">', 'abc1234'), /沒有任何/);
  assert.throws(() => rewriteIndexHtml('<link href="css/a.css">', 'ABC1234'), /版本/);
  assert.throws(() => rewriteIndexHtml('<link href="css/a.css">', 'abc12'), /版本/);
});

test('pack：輸出結構、改寫、逐位元組相同、白名單', () => {
  const out = path.join(tmpDir('pack'), 'site');
  const files = pack({ version: 'abc1234', outDir: out, root: REPO });
  assert.deepEqual(fs.readdirSync(out).sort(), ['index.html', 'v']);
  assert.deepEqual(fs.readdirSync(path.join(out, 'v')), ['abc1234']);
  const ver = fs.readdirSync(path.join(out, 'v', 'abc1234')).sort();
  assert.ok(ver.includes('css') && ver.includes('src'));
  assert.ok(ver.every(n => ['css', 'src', 'assets'].includes(n)));
  for (const bad of ['docs', 'tests', 'tools', '.git', '.github', 'package.json', '.gitattributes']) {
    assert.ok(!files.some(f => f === bad || f.startsWith(bad + '/') || f.includes('/' + bad + '/')), bad);
  }
  // 引用都加了前綴且檔案存在
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const local = attrValues(html).filter(v => !v.startsWith('data:'));
  assert.ok(local.length >= 2);
  for (const v of local) {
    assert.ok(v.startsWith('v/abc1234/'), v);
    assert.ok(fs.existsSync(path.join(out, v)), v);
  }
  // src／css 與 repo 逐位元組相同
  for (const d of ['src', 'css']) {
    for (const f of listFiles(path.join(REPO, d))) {
      const r = path.relative(REPO, f);
      assert.ok(Buffer.from(fs.readFileSync(f)).equals(fs.readFileSync(path.join(out, 'v', 'abc1234', r))), r);
    }
  }
});

test('pack：同樣輸入兩次，兩個目錄的檔案清單與雜湊完全相同', () => {
  const base = tmpDir('idem');
  pack({ version: 'abc1234', outDir: path.join(base, 'a'), root: REPO });
  pack({ version: 'abc1234', outDir: path.join(base, 'b'), root: REPO });
  assert.deepEqual(snapshot(path.join(base, 'a')), snapshot(path.join(base, 'b')));
});

test('pack：輸入不合法時先驗證、不寫檔、丟錯', () => {
  const base = tmpDir('bad');
  for (const version of ['abc12', 'ABC1234', 'abc12345', undefined]) {
    const out = path.join(base, 'o-' + version);
    assert.throws(() => pack({ version, outDir: out, root: REPO }), /版本/);
    assert.equal(fs.existsSync(out), false);
  }
  // 必要來源缺檔（沒有 src/）
  const root = tmpDir('root');
  fs.writeFileSync(path.join(root, 'index.html'), '<link href="css/a.css">');
  fs.mkdirSync(path.join(root, 'css'));
  const out = path.join(base, 'nosrc');
  assert.throws(() => pack({ version: 'abc1234', outDir: out, root }), /缺少必要來源/);
  assert.equal(fs.existsSync(out), false);
});

test('pack：輸出目錄已存在且非空 → 拒絕，原有內容不變；空目錄可用', () => {
  const base = tmpDir('exist');
  const out = path.join(base, 'site');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'keep.txt'), 'keep');
  assert.throws(() => pack({ version: 'abc1234', outDir: out, root: REPO }), /非空/);
  assert.deepEqual(fs.readdirSync(out), ['keep.txt']);
  assert.equal(fs.readFileSync(path.join(out, 'keep.txt'), 'utf8'), 'keep');
  const empty = path.join(base, 'empty');
  fs.mkdirSync(empty);
  pack({ version: 'abc1234', outDir: empty, root: REPO });
  assert.ok(fs.existsSync(path.join(empty, 'index.html')));
});

test('pack：寫入後自我驗證失敗（引用的檔案不存在）→ 丟錯並清掉半成品', () => {
  const base = tmpDir('half');
  const root = path.join(base, 'root');
  fs.mkdirSync(path.join(root, 'css'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'index.html'), '<link href="css/missing.css"><script src="src/a.js"></script>');
  fs.writeFileSync(path.join(root, 'src', 'a.js'), '');
  const out = path.join(base, 'out');
  assert.throws(() => pack({ version: 'abc1234', outDir: out, root }), /不存在/);
  assert.equal(fs.existsSync(out), false);
});

test('pack CLI：缺版本、版本格式不符 → 非 0、有說明、輸出目錄不存在', () => {
  const base = tmpDir('cli');
  const script = path.join(REPO, 'tools', 'pack.mjs');
  const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  let out = path.join(base, 'o1');
  let r = run(['--out', out]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /版本/);
  assert.equal(fs.existsSync(out), false);
  out = path.join(base, 'o2');
  r = run(['--version', 'abc12', '--out', out]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /版本/);
  assert.equal(fs.existsSync(out), false);
  out = path.join(base, 'o3');
  r = run(['--version', 'abc1234', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(out, 'v', 'abc1234', 'src', 'shell', 'main.js')));
});
