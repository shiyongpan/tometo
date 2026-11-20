// @ts-check
// shell 層入口：唯一可以碰 DOM 的地方；只能往下 import core、data。
import { getPlaceholderText, createInitialState } from '../core/index.js';
import { RESOURCES } from '../data/balance.js';
import { createClock } from './clock.js';
import { startLoop } from './loop.js';
import { formatAmount } from './format.js';

/** @typedef {{ resources: Record<string, number> }} GameState 與 core/state.js 的定義相同 */

/** 本模組實例的啟動資訊；測試在頁面內以動態載入讀取（同網址只有一份實例）。 */
const bootInfo = { ready: false, id: '', text: '' };

let state = createInitialState();
const clock = createClock();

/**
 * 回傳啟動資訊的複本（可觀察狀態以 getter 提供）。
 * @returns {{ready: boolean, id: string, text: string}}
 */
export function getBootInfo() {
  return { ...bootInfo };
}

/**
 * 回傳遊戲狀態的複本（修改回傳值不影響內部）。
 * @returns {GameState}
 */
export function getGameState() {
  return structuredClone(state);
}

/**
 * 回傳時鐘的上次 tick 時間（毫秒）。
 * @returns {number}
 */
export function getLastTickMs() {
  return clock.getLast();
}

/** @type {HTMLElement} */
let resEl;

/** 把狀態寫到畫面（只在分頁可見時呼叫）。 */
function render() {
  const r = RESOURCES[0];
  resEl.textContent = `${r.name}：${formatAmount(state.resources[r.id])}`;
}

/** 啟動：建立畫面、開始 tick，並在 <html> 標記已啟動。 */
function boot() {
  const app = document.getElementById('app');
  if (!app) throw new Error('找不到 #app');
  bootInfo.text = getPlaceholderText();
  const nameEl = document.createElement('div');
  nameEl.id = 'game-name';
  nameEl.textContent = bootInfo.text;
  resEl = document.createElement('div');
  resEl.id = 'res-placeholder';
  app.replaceChildren(nameEl, resEl);
  render();

  const loop = startLoop({
    clock,
    getState: () => state,
    setState: s => {
      state = s;
    },
    onTick: () => {
      if (document.visibilityState === 'visible') render();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loop.tickNow();
  });

  // 實例識別碼：讓測試能分辨「頁面正在用的那份」與另一份新載入的實例
  bootInfo.id = Math.random().toString(36).slice(2);
  bootInfo.ready = true;
  document.documentElement.dataset.bootId = bootInfo.id;
  document.documentElement.dataset.ready = '1';
}

boot();
