// @ts-check
// shell 層入口：唯一可以碰 DOM 的地方；只能往下 import core。
import { getPlaceholderText } from '../core/index.js';

/** 本模組實例的啟動資訊；測試在頁面內以動態載入讀取（同網址只有一份實例）。 */
const bootInfo = { ready: false, id: '', text: '' };

/**
 * 回傳啟動資訊的複本（可觀察狀態以 getter 提供）。
 * @returns {{ready: boolean, id: string, text: string}}
 */
export function getBootInfo() {
  return { ...bootInfo };
}

/** 啟動：顯示占位文字，並在 <html> 標記已啟動。 */
function boot() {
  const app = document.getElementById('app');
  if (!app) throw new Error('找不到 #app');
  bootInfo.text = getPlaceholderText();
  app.textContent = bootInfo.text;
  // 實例識別碼：讓測試能分辨「頁面正在用的那份」與另一份新載入的實例
  bootInfo.id = Math.random().toString(36).slice(2);
  bootInfo.ready = true;
  document.documentElement.dataset.bootId = bootInfo.id;
  document.documentElement.dataset.ready = '1';
}

boot();
