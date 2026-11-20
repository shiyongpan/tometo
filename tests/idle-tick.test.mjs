// 第 2 塊：在線掛機核心的 node:test（advance、state、MODE、format、clock、loop、原始碼檢查）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO,
  CORE_FORBIDDEN,
  listFiles,
  findForbidden,
  findLayerViolations,
  findClockViolations,
  findDebugSwitches
} from './lib/source-checks.mjs';
import { RESOURCES, OFFLINE_FACTOR } from '../src/data/balance.js';
import * as coreIndex from '../src/core/index.js';
import { createInitialState } from '../src/core/state.js';
import { advance, MODE } from '../src/core/advance.js';
import { formatAmount } from '../src/shell/format.js';
import { elapsedSince, createClock } from '../src/shell/clock.js';
import * as loopMod from '../src/shell/loop.js';

const { ONLINE_LIMIT_SEC, splitElapsed, applyElapsed, startLoop } = loopMod;
const r = RESOURCES.find(x => x.id === 'placeholder').ratePerSec;
const f = OFFLINE_FACTOR;
const rel = p => path.relative(REPO, p).split(path.sep).join('/');
const read = p => fs.readFileSync(p, 'utf8');
const srcJs = listFiles(path.join(REPO, 'src'), p => p.endsWith('.js'));
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ---------- 資料與核心 ----------
test('AC-01 balance：ratePerSec > 0、OFFLINE_FACTOR 在 (0,1]、數字不在 data 外重複定義', () => {
  for (const x of RESOURCES) assert.ok(x.ratePerSec > 0, x.id);
  assert.ok(f > 0 && f <= 1);
  assert.ok(Object.isFrozen(RESOURCES));
  for (const p of srcJs) {
    if (rel(p).startsWith('src/data/')) continue;
    const t = read(p);
    assert.doesNotMatch(t, /ratePerSec\s*[:=]\s*[\d.]/, rel(p));
    assert.doesNotMatch(t, /OFFLINE_FACTOR\s*=/, rel(p));
    assert.doesNotMatch(t, /\b0\.5\b/, rel(p));
  }
});

test('AC-02 MODE 凍結且值正確', () => {
  assert.equal(MODE.ONLINE, 'online');
  assert.equal(MODE.OFFLINE, 'offline');
  assert.ok(Object.isFrozen(MODE));
});

test('AC-03 createInitialState 每次回新物件', () => {
  const a = createInitialState();
  const b = createInitialState();
  assert.deepEqual(a, { resources: { placeholder: 0 } });
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  a.resources.placeholder = 99;
  assert.equal(b.resources.placeholder, 0);
});

test('AC-04 狀態可 JSON 往返', () => {
  const s = createInitialState();
  const n = advance(s, 7.5, MODE.ONLINE).state;
  for (const x of [s, n]) assert.deepEqual(JSON.parse(JSON.stringify(x)), x);
});

test('AC-05 在線 10 秒', () => {
  const out = advance(createInitialState(), 10, MODE.ONLINE);
  assert.ok(close(out.gains.resources.placeholder, 10 * r));
  assert.ok(close(out.state.resources.placeholder, 10 * r));
});

test('AC-06 離線 100 秒', () => {
  const off = advance(createInitialState(), 100, MODE.OFFLINE).state.resources.placeholder;
  const on = advance(createInitialState(), 100, MODE.ONLINE).state.resources.placeholder;
  assert.ok(close(off, 100 * r * f));
  assert.ok(off < on);
});

test('AC-07 0 秒狀態不變', () => {
  for (const s of [createInitialState(), { resources: { placeholder: 12.5 } }]) {
    for (const m of [MODE.ONLINE, MODE.OFFLINE]) assert.deepEqual(advance(s, 0, m).state, s);
  }
});

test('AC-08 不修改輸入、相同輸入相同輸出', () => {
  const s = { resources: { placeholder: 3.25 } };
  const copy = structuredClone(s);
  const a = advance(s, 12.5, MODE.OFFLINE);
  assert.deepEqual(s, copy);
  assert.deepEqual(advance(s, 12.5, MODE.OFFLINE), a);
  assert.notEqual(a.state, s);
  assert.notEqual(a.state.resources, s.resources);
});

test('AC-09 非法輸入', () => {
  const s = createInitialState();
  for (const bad of [-1, NaN, Infinity]) assert.throws(() => advance(s, bad, MODE.ONLINE), RangeError);
  for (const bad of ['idle', undefined]) assert.throws(() => advance(s, 1, bad), TypeError);
});

/** 固定種子亂數（mulberry32），結果可重現。 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把 total 切成 n 段（隨機權重；integer 時每段為整數秒）。 */
function randomSplit(rand, total, n, integer) {
  if (n === total && integer) return Array(n).fill(1);
  const w = Array.from({ length: n }, () => 0.05 + rand());
  const sum = w.reduce((x, y) => x + y, 0);
  const parts = w.map(x => (x / sum) * total);
  if (!integer) return parts;
  let acc = 0;
  let exact = 0;
  return parts.map((p, i) => {
    exact += p;
    const end = i === n - 1 ? total : Math.round(exact);
    const seg = end - acc;
    acc = end;
    return seg;
  });
}

test('AC-10 SYS-007 任意切法差距 <= 1%（T=28800，固定種子 26 組）', () => {
  const T = 28800;
  const rand = rng(20260101);
  const sizes = [1, 2, 3, 10, 100, 1000, 1000, 5000, 28800];
  const cases = [];
  for (let k = 0; k < 24; k++) cases.push({ n: sizes[k % sizes.length], integer: k % 3 !== 0 });
  cases.push({ n: 28800, integer: true }, { n: 777, integer: false });
  assert.ok(cases.some(c => c.n === 1));
  assert.ok(cases.some(c => c.n === 28800));
  assert.ok(cases.some(c => c.n >= 1000 && c.n < 28800));
  assert.ok(cases.some(c => !c.integer));
  for (const c of cases) {
    const parts = randomSplit(rand, T, c.n, c.integer);
    assert.equal(parts.length, c.n);
    assert.ok(Math.abs(parts.reduce((x, y) => x + y, 0) - T) < 1e-6);
    for (const mode of [MODE.ONLINE, MODE.OFFLINE]) {
      const whole = advance(createInitialState(), T, mode).state.resources.placeholder;
      let s = createInitialState();
      for (const p of parts) s = advance(s, p, mode).state;
      const diff = Math.abs(s.resources.placeholder - whole) / whole;
      assert.ok(diff <= 0.01, `${mode} n=${c.n} 相對差 ${diff}`);
    }
  }
});

test('AC-11 core/index.js 匯出', () => {
  for (const k of ['createInitialState', 'advance', 'MODE', 'getPlaceholderText']) assert.ok(k in coreIndex, k);
});

test('AC-12 formatAmount', () => {
  assert.equal(formatAmount(2.9999999999999996), 3);
  assert.equal(formatAmount(2.5), 2);
  assert.equal(formatAmount(0), 0);
});

// ---------- 時鐘與迴圈 ----------
test('AC-13 elapsedSince', () => {
  const t0 = 1_700_000_000_000;
  assert.deepEqual(elapsedSince(t0, t0 + 1500), { elapsedSec: 1.5, last: t0 + 1500 });
  assert.deepEqual(elapsedSince(t0, t0 - 3600000), { elapsedSec: 0, last: t0 });
});

test('AC-14 createClock 時間倒退', () => {
  const t0 = 1_700_000_000_000;
  const seq = [t0, t0 - 3600000, t0 + 1000];
  let i = 0;
  const clock = createClock(() => seq[i++]);
  assert.equal(clock.tick(), 0);
  assert.equal(clock.getLast(), t0);
  assert.equal(clock.tick(), 1);
  assert.equal(clock.getLast(), t0 + 1000);
});

test('AC-15 loop 匯出、界線值只定義一次', () => {
  assert.equal(ONLINE_LIMIT_SEC, 120);
  for (const fn of [splitElapsed, applyElapsed, startLoop]) assert.equal(typeof fn, 'function');
  const hits = srcJs.flatMap(p => read(p).match(/\b120\b/g) ?? []);
  assert.equal(hits.length, 1);
  assert.match(read(path.join(REPO, 'src/shell/loop.js')), /ONLINE_LIMIT_SEC\s*=\s*120/);
});

test('AC-16 splitElapsed', () => {
  for (const e of [1, 60, 120]) assert.deepEqual(splitElapsed(e), { online: e, offline: 0 });
  assert.deepEqual(splitElapsed(120.5), { online: 120, offline: 0.5 });
  assert.deepEqual(splitElapsed(300), { online: 120, offline: 180 });
});

test('AC-17 applyElapsed', () => {
  const s = createInitialState();
  assert.ok(close(applyElapsed(s, 300).resources.placeholder, 120 * r + 180 * r * f));
  assert.deepEqual(applyElapsed(s, 0), s);
});

test('AC-18 startLoop：tickNow 與 stop', () => {
  const t0 = 1_700_000_000_000;
  let now = t0;
  const clock = createClock(() => now);
  let state = createInitialState();
  let ticks = 0;
  const loop = startLoop({ clock, getState: () => state, setState: s => (state = s), onTick: () => ticks++ });
  assert.equal(typeof loop.stop, 'function');
  assert.equal(typeof loop.tickNow, 'function');
  now = t0 + 300_000;
  loop.tickNow();
  assert.equal(ticks, 1);
  assert.ok(close(state.resources.placeholder, 120 * r + 180 * r * f));
  loop.stop(); // 不 stop 的話 setInterval 會讓 node --test 無法結束
});

test('AC-19 shell 純模組在沒有 document／window 的 Node 可 import', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.window, 'undefined');
  for (const m of ['clock', 'loop', 'format']) await import(`../src/shell/${m}.js`);
});

// ---------- 原始碼與結構 ----------
test('AC-20 時鐘字樣只出現在 clock.js（含自我測試）', () => {
  for (const p of srcJs) {
    if (rel(p) === 'src/shell/clock.js') assert.ok(read(p).includes('Date.now'));
    else assert.deepEqual(findClockViolations(rel(p), read(p)), [], rel(p));
  }
  assert.deepEqual(findClockViolations('src/shell/other.js', 'const t = Date.now();'), ['Date.now']);
  assert.deepEqual(findClockViolations('src/core/x.js', '// new Date'), ['new Date']);
  assert.deepEqual(findClockViolations('src/shell/x.js', 'performance.now()'), ['performance.now']);
  assert.deepEqual(findClockViolations('src/shell/clock.js', 'Date.now()'), []);
});

test('AC-21 src 沒有除錯開關、innerHTML、localStorage；core 沒有計時器', () => {
  for (const p of srcJs) assert.deepEqual(findDebugSwitches(read(p)), [], rel(p));
  for (const p of listFiles(path.join(REPO, 'src', 'core'))) {
    assert.deepEqual(findForbidden(read(p), ['setInterval', 'setTimeout']), [], rel(p));
  }
  assert.deepEqual(findDebugSwitches("Symbol.for('tometo.test')"), ['tometo.test']);
  assert.deepEqual(findDebugSwitches('el.innerHTML = x; location.search'), ['location.search', 'innerHTML']);
});

test('AC-22 層級：shell 可 import core／data；core、data 反向違規', () => {
  assert.deepEqual(findLayerViolations('src/shell/a.js', "import a from '../core/b.js'; import c from '../data/d.js';"), []);
  assert.equal(findLayerViolations('src/core/a.js', "import a from '../shell/b.js';").length, 1);
  assert.equal(findLayerViolations('src/data/a.js', "import a from '../core/b.js';").length, 1);
  assert.equal(findLayerViolations('src/data/a.js', "import a from '../shell/b.js';").length, 1);
  for (const p of srcJs) assert.deepEqual(findLayerViolations(rel(p), read(p)), [], rel(p));
});

test('AC-23 core 新檔通過禁用字樣檢查', () => {
  for (const p of listFiles(path.join(REPO, 'src', 'core'))) assert.deepEqual(findForbidden(read(p), CORE_FORBIDDEN), [], rel(p));
});

test('AC-24 src 檔案第一行 // @ts-check、只用靜態 import', () => {
  for (const p of srcJs) {
    assert.equal(read(p).split(/\r?\n/)[0], '// @ts-check', rel(p));
    assert.doesNotMatch(read(p), /\bimport\s*\(/, rel(p));
  }
});
