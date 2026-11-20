// @ts-check
// data 層：數值表。調整產出率只改這裡，core 不動。

/** 資源定義（本塊只有一種占位資源）。 */
export const RESOURCES = Object.freeze([{ id: 'placeholder', name: '資源', ratePerSec: 1 }]);

/**
 * 離線倍率（占位值，不設上限）。
 * 這只是為了讓「模式有被正確傳遞」看得出來，不是離線折扣與上限（Q2）的答案；C02 那一塊會換成正式的值。
 */
export const OFFLINE_FACTOR = 0.5;
