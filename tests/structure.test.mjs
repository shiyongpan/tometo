// 專案結構檢查：三層、禁用字樣、index.html 引用規則、無外部套件。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO,
  CORE_FORBIDDEN,
  DATA_FORBIDDEN,
  listFiles,
  findForbidden,
  findLayerViolations,
  findGlobalHooks,
  hasDynamicImport,
  attrValues,
  inlineScriptImports
} from './lib/source-checks.mjs';

const rel = f => path.relative(REPO, f).split(path.sep).join('/');
const read = f => fs.readFileSync(f, 'utf8');
const srcJs = listFiles(path.join(REPO, 'src'), f => f.endsWith('.js'));

test('src 底下每個 .js 第一行都是 // @ts-check', () => {
  assert.ok(srcJs.length >= 3);
  for (const f of srcJs) assert.equal(read(f).split(/\r?\n/)[0], '// @ts-check', rel(f));
});

test('core 與 data 在沒有 document／window 的 Node 直接 import 不報錯', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.window, 'undefined');
  const data = await import('../src/data/index.js');
  const core = await import('../src/core/index.js');
  assert.equal(core.getPlaceholderText(), data.GAME_NAME);
});

test('core 沒有禁用字樣（含註解，嚴格比對）', () => {
  for (const f of listFiles(path.join(REPO, 'src', 'core'))) {
    assert.deepEqual(findForbidden(read(f), CORE_FORBIDDEN), [], rel(f));
  }
});

test('data 沒有 document／window／localStorage', () => {
  for (const f of listFiles(path.join(REPO, 'src', 'data'))) {
    assert.deepEqual(findForbidden(read(f), DATA_FORBIDDEN), [], rel(f));
  }
});

test('檢查器自我測試：含 Date.now() 的字串必須被判違規', () => {
  assert.deepEqual(findForbidden('const t = Date.now();', CORE_FORBIDDEN), ['Date.now']);
  for (const w of CORE_FORBIDDEN) assert.deepEqual(findForbidden(`// ${w}`, CORE_FORBIDDEN), [w]);
  assert.deepEqual(findForbidden('const x = 1;', CORE_FORBIDDEN), []);
});

test('層級方向：data 不 import core／shell，core 不 import shell', () => {
  for (const f of srcJs) {
    const r = rel(f);
    if (r.startsWith('src/core/') || r.startsWith('src/data/')) assert.deepEqual(findLayerViolations(r, read(f)), [], r);
  }
});

test('檢查器自我測試：方向違規會被抓到', () => {
  assert.equal(findLayerViolations('src/core/a.js', "import x from '../shell/b.js';").length, 1);
  assert.equal(findLayerViolations('src/data/a.js', "import '../core/b.js';").length, 1);
  assert.equal(findLayerViolations('src/data/a.js', "import x from '../shell/b.js';").length, 1);
  assert.equal(findLayerViolations('src/core/a.js', "import x from '../data/b.js';").length, 0);
  assert.equal(findLayerViolations('src/shell/a.js', "import x from '../core/b.js';").length, 0);
});

test('src 沒有 __dbg、沒有對 globalThis／window 掛接口、沒有動態 import()', () => {
  for (const f of listFiles(path.join(REPO, 'src'))) {
    assert.deepEqual(findGlobalHooks(read(f)), [], rel(f));
    assert.equal(hasDynamicImport(read(f)), false, rel(f));
  }
});

test('檢查器自我測試：全域掛接口與動態 import 會被抓到', () => {
  assert.ok(findGlobalHooks('globalThis.x = 1').length);
  assert.ok(findGlobalHooks('window.foo = {}').length);
  assert.ok(findGlobalHooks('globalThis.__dbg=s=>s').length);
  assert.equal(findGlobalHooks('if (window.x === 1) {}').length, 0);
  assert.ok(hasDynamicImport("await import('./a.js')"));
});

test('index.html：本地引用只在 href／src、相對路徑、不引用其他網域', () => {
  const html = read(path.join(REPO, 'index.html'));
  const vals = attrValues(html);
  assert.ok(vals.length >= 2);
  for (const v of vals) {
    assert.ok(!v.startsWith('/'), `不可用 / 開頭：${v}`);
    assert.ok(!/^https?/i.test(v), `不可引用其他網域：${v}`);
  }
  assert.deepEqual(inlineScriptImports(html), []);
  assert.ok(vals.includes('css/game.css') && vals.includes('src/shell/main.js'));
  assert.match(html, /<title>tometo<\/title>/);
  assert.match(html, /<link rel="icon" href="data:,">/);
});

test('沒有外部套件：無 node_modules、package.json 只有 type（與 private）', () => {
  assert.equal(fs.existsSync(path.join(REPO, 'node_modules')), false);
  const pkg = JSON.parse(read(path.join(REPO, 'package.json')));
  assert.equal(pkg.type, 'module');
  for (const k of ['scripts', 'name', 'version', 'dependencies', 'devDependencies']) assert.ok(!(k in pkg), k);
  assert.deepEqual(
    Object.keys(pkg).filter(k => k !== 'type' && k !== 'private'),
    []
  );
});
