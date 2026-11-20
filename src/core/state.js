// @ts-check
// 遊戲狀態：純 JSON，每次呼叫回傳新物件。
import { RESOURCES } from '../data/balance.js';

/**
 * @typedef {{ resources: Record<string, number> }} GameState
 */

/**
 * 建立初始狀態：每種資源一個欄位，值為 0。
 * @returns {GameState}
 */
export function createInitialState() {
  /** @type {Record<string, number>} */
  const resources = {};
  for (const r of RESOURCES) resources[r.id] = 0;
  return { resources };
}
