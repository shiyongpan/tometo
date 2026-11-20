// @ts-check
// core 層：純函式，只能 import data；一切副作用都在 shell。
import { GAME_NAME } from '../data/index.js';

/**
 * 取得占位畫面要顯示的文字（證明 shell → core → data 載入鏈通了）。
 * @returns {string}
 */
export function getPlaceholderText() {
  return GAME_NAME;
}
