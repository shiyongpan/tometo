// @ts-check
// 核心推進：經過秒數與模式 → 新狀態與收益明細。純函式，不碰時鐘與 DOM。
import { RESOURCES, OFFLINE_FACTOR } from '../data/balance.js';

/** @typedef {{ resources: Record<string, number> }} GameState 與 state.js 的定義相同（JSDoc 型別，避免動態 import 字樣） */

/** 結算模式：在線全額、離線套倍率。 */
export const MODE = Object.freeze({ ONLINE: 'online', OFFLINE: 'offline' });

/**
 * @param {GameState} state
 * @param {number} seconds 經過秒數（可為小數，不可為負、NaN、Infinity）
 * @param {string} mode MODE 的其中一個值
 * @returns {{ state: GameState, gains: { resources: Record<string, number> } }}
 */
export function advance(state, seconds, mode) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(`seconds 必須是有限且非負的數字：${seconds}`);
  }
  if (mode !== MODE.ONLINE && mode !== MODE.OFFLINE) {
    throw new TypeError(`不合法的模式：${String(mode)}`);
  }
  const factor = mode === MODE.ONLINE ? 1 : OFFLINE_FACTOR;
  /** @type {Record<string, number>} */
  const gained = {};
  /** @type {Record<string, number>} */
  const resources = { ...state.resources };
  for (const r of RESOURCES) {
    const g = r.ratePerSec * seconds * factor;
    gained[r.id] = g;
    resources[r.id] = (state.resources[r.id] ?? 0) + g;
  }
  return { state: { ...state, resources }, gains: { resources: gained } };
}
