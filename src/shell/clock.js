// @ts-check
// 時鐘：整個 src/ 唯一讀時間的地方（ADR-0006）。

/**
 * 由上次時間與現在時間算經過秒數；時間倒退時算 0，上次時間取較晚者。
 * @param {number} last 毫秒
 * @param {number} now 毫秒
 * @returns {{ elapsedSec: number, last: number }}
 */
export function elapsedSince(last, now) {
  if (now < last) return { elapsedSec: 0, last };
  return { elapsedSec: (now - last) / 1000, last: now };
}

/**
 * 建立時鐘；建立時讀一次當初始上次時間。
 * @param {() => number} [readNow] 預設在呼叫當下讀 Date.now()
 * @returns {{ tick: () => number, getLast: () => number }}
 */
export function createClock(readNow = () => Date.now()) {
  let last = readNow();
  return {
    tick() {
      const r = elapsedSince(last, readNow());
      last = r.last;
      return r.elapsedSec;
    },
    getLast: () => last
  };
}
