// 發佈組裝：把遊戲檔案整理成要發佈的網站目錄（不是建置：檔案逐檔複製，只替換 index.html 的路徑）。
// 用法：node tools/pack.mjs --version <7 碼小寫十六進位> [--out _site]
// 版本只由參數傳入（不呼叫 git、不讀環境變數）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERSION_RE = /^[0-9a-f]{7}$/;
/** 白名單：只複製這些（目錄 css/src/assets 放進 v/<版本>/，index.html 放頂層）。 */
const DIRS = ['css', 'src', 'assets'];
const OPTIONAL = new Set(['assets']);
/** 本地引用的開頭 */
const LOCAL_RE = /^(?:css|src|assets)\//;
/** 取出 href／src 屬性值（含引號） */
const ATTR_RE = /(\b(?:href|src)\s*=\s*)(["'])(.*?)\2/gis;

/**
 * 驗證版本格式。
 * @param {unknown} version
 */
function assertVersion(version) {
  if (typeof version !== 'string' || !VERSION_RE.test(version)) {
    throw new Error(`版本必須是 7 碼小寫十六進位（^[0-9a-f]{7}$），收到：${JSON.stringify(version)}`);
  }
}

/**
 * 列出 html 裡所有 href／src 的值。
 * @param {string} html
 * @returns {string[]}
 */
function attrValues(html) {
  return [...html.matchAll(ATTR_RE)].map(m => m[3]);
}

/**
 * 改寫 index.html：href／src 值開頭為 css/、src/、assets/ 者，前面加 v/<版本>/。
 * 沒有任何可改寫的引用就丟錯；改寫後不得殘留未加前綴的本地引用。
 * @param {string} html
 * @param {string} version
 * @returns {string}
 */
export function rewriteIndexHtml(html, version) {
  assertVersion(version);
  let count = 0;
  const out = html.replace(ATTR_RE, (all, head, quote, value) => {
    if (!LOCAL_RE.test(value)) return all;
    count++;
    return `${head}${quote}v/${version}/${value}${quote}`;
  });
  if (count === 0) throw new Error('index.html 沒有任何以 css/、src/、assets/ 開頭的 href／src 可改寫');
  const left = attrValues(out).filter(v => LOCAL_RE.test(v));
  if (left.length) throw new Error(`改寫後仍有未加前綴的本地引用：${left.join(', ')}`);
  return out;
}

/**
 * 遞迴複製目錄（逐檔，內容逐位元組相同）。
 * @param {string} from
 * @param {string} to
 */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, ent.name);
    const b = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(a, b);
    else if (ent.isFile()) fs.copyFileSync(a, b);
  }
}

/**
 * 組裝網站目錄。先驗證再寫檔；寫入或自我驗證失敗會清掉半成品。
 * @param {{version: string, outDir: string, root: string}} opts
 * @returns {string[]} 輸出目錄內所有檔案（相對路徑，排序）
 */
export function pack({ version, outDir, root }) {
  // 1. 驗證（不寫任何東西）
  assertVersion(version);
  const indexPath = path.join(root, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error(`缺少必要來源：${indexPath}`);
  for (const d of DIRS) {
    const p = path.join(root, d);
    if (!fs.existsSync(p)) {
      if (OPTIONAL.has(d)) continue;
      throw new Error(`缺少必要來源：${p}`);
    }
    if (!fs.statSync(p).isDirectory()) throw new Error(`來源應為目錄：${p}`);
  }
  const html = fs.readFileSync(indexPath, 'utf8');
  const rewritten = rewriteIndexHtml(html, version);
  const outExisted = fs.existsSync(outDir);
  if (outExisted && (!fs.statSync(outDir).isDirectory() || fs.readdirSync(outDir).length > 0)) {
    throw new Error(`輸出目錄已存在且非空，拒絕覆蓋：${outDir}`);
  }

  // 2. 寫入
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), rewritten);
    for (const d of DIRS) {
      if (fs.existsSync(path.join(root, d))) copyDir(path.join(root, d), path.join(outDir, 'v', version, d));
    }
    // 3. 自我驗證：每個被引用的檔案都存在
    for (const v of attrValues(rewritten)) {
      if (!v.startsWith(`v/${version}/`)) continue;
      if (!fs.existsSync(path.join(outDir, v))) throw new Error(`index.html 引用的檔案不存在：${v}`);
    }
  } catch (e) {
    // 清半成品：原本不存在的目錄整個刪掉；原本是空目錄就清空內容
    if (outExisted) for (const n of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, n), { recursive: true, force: true });
    else fs.rmSync(outDir, { recursive: true, force: true });
    throw e;
  }
  return listFiles(outDir);
}

/**
 * 列出目錄內所有檔案（相對路徑，正斜線，排序）。
 * @param {string} dir
 * @returns {string[]}
 */
function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** CLI 入口。 */
function main() {
  const args = process.argv.slice(2);
  const opt = (/** @type {string} */ name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const version = opt('--version');
    if (version === undefined) throw new Error('缺少版本參數 --version <7 碼小寫十六進位>');
    const outDir = path.resolve(opt('--out') ?? '_site');
    const files = pack({ version, outDir, root });
    console.log(`已組裝 ${files.length} 個檔案 → ${outDir}（版本 ${version}）`);
  } catch (e) {
    console.error(`組裝失敗：${/** @type {Error} */ (e).message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
