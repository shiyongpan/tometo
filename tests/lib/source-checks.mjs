// 原始碼檢查函式（給 node:test 用）。檢查器本身也有自我測試，避免壞掉卻永遠通過。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** core 禁用字樣（ADR-0006 ＋ 02 的 4.1），嚴格字串比對，註解裡出現也算。 */
export const CORE_FORBIDDEN = [
  'Date.now',
  'new Date',
  'Math.random',
  'performance.now',
  'document',
  'window',
  'localStorage'
];
/** data 禁用字樣（不碰瀏覽器全域物件）。 */
export const DATA_FORBIDDEN = ['document', 'window', 'localStorage'];

/**
 * 遞迴列出目錄內的檔案（絕對路徑）。
 * @param {string} dir
 * @param {(f: string) => boolean} [filter]
 * @returns {string[]}
 */
export function listFiles(dir, filter = () => true) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

/**
 * 找出文字中出現的禁用字樣。
 * @param {string} text
 * @param {string[]} words
 * @returns {string[]}
 */
export function findForbidden(text, words) {
  return words.filter(w => text.includes(w));
}

/**
 * 檢查層級 import 方向：shell → core → data。
 * @param {string} relPath 檔案在 repo 內的相對路徑，例如 src/core/index.js
 * @param {string} text
 * @returns {string[]} 違規的 import 說明
 */
export function findLayerViolations(relPath, text) {
  const layer = relPath.split('/')[1];
  const banned = layer === 'data' ? ['core', 'shell'] : layer === 'core' ? ['shell'] : [];
  /** @type {string[]} */
  const bad = [];
  for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*['"]([^'"]+)['"]/g)) {
    if (!m[1].startsWith('.')) continue;
    const target = path.posix.join(path.posix.dirname(relPath), m[1]).split('/');
    if (target[0] === 'src' && banned.includes(target[1])) bad.push(`${relPath} import ${m[1]}`);
  }
  return bad;
}

/**
 * 找出對全域物件掛接口的賦值與 __dbg。
 * @param {string} text
 * @returns {string[]}
 */
export function findGlobalHooks(text) {
  /** @type {string[]} */
  const bad = [];
  if (text.includes('__dbg')) bad.push('__dbg');
  for (const m of text.matchAll(/\b(?:globalThis|window|self)\s*(?:\.\s*\w+|\[[^\]]*\])\s*=(?!=)/g)) bad.push(m[0]);
  return bad;
}

/**
 * 找出動態 import()。
 * @param {string} text
 * @returns {boolean}
 */
export function hasDynamicImport(text) {
  return /\bimport\s*\(/.test(text);
}

/**
 * 取出 html 中所有 href／src 屬性值。
 * @param {string} html
 * @returns {string[]}
 */
export function attrValues(html) {
  return [...html.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gis)].map(m => m[2]);
}

/**
 * 行內（沒有 src 的）script 內容裡 import 的路徑。
 * @param {string} html
 * @returns {string[]}
 */
export function inlineScriptImports(html) {
  /** @type {string[]} */
  const bad = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    for (const i of m[2].matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g)) bad.push(i[1]);
  }
  return bad;
}
