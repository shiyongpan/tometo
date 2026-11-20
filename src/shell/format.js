// @ts-check
// 畫面數字格式；狀態保留小數，只有顯示取整。

/**
 * @param {number} v
 * @returns {number}
 */
export function formatAmount(v) {
  return Math.floor(v + 1e-6);
}
