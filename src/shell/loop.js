// @ts-check
// tick 迴圈：每秒一次，經過時間依在線界線切成在線與離線兩段。import 時不建計時器、不碰 DOM。
import { advance, MODE } from '../core/index.js';

/** @typedef {{ resources: Record<string, number> }} GameState 與 core/state.js 的定義相同 */

/** 在線與離線的界線（秒）。 */
export const ONLINE_LIMIT_SEC = 120;

/**
 * @param {number} e 經過秒數
 * @returns {{ online: number, offline: number }}
 */
export function splitElapsed(e) {
  const online = Math.min(e, ONLINE_LIMIT_SEC);
  return { online, offline: e - online };
}

/**
 * 先在線、後離線地推進狀態。
 * @param {GameState} state
 * @param {number} e 經過秒數
 * @returns {GameState}
 */
export function applyElapsed(state, e) {
  const { online, offline } = splitElapsed(e);
  let next = advance(state, online, MODE.ONLINE).state;
  if (offline > 0) next = advance(next, offline, MODE.OFFLINE).state;
  return next;
}

/**
 * @param {{
 *   clock: { tick: () => number },
 *   getState: () => GameState,
 *   setState: (s: GameState) => void,
 *   onTick: () => void
 * }} deps
 * @returns {{ stop: () => void, tickNow: () => void }}
 */
export function startLoop({ clock, getState, setState, onTick }) {
  const tickNow = () => {
    setState(applyElapsed(getState(), clock.tick()));
    onTick();
  };
  const timer = setInterval(tickNow, 1000);
  return { stop: () => clearInterval(timer), tickNow };
}
